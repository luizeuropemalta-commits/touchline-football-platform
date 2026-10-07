type Result='provider_accepted'|'unconfirmed'|'blocked'|'invalid'|'busy';
type Options={
  accountId:string; installationId:string;
  /** Host must invalidate on account change and dispose on unmount. */
  isCurrent:()=>boolean;
  storage:Pick<Storage,'getItem'|'setItem'>;
  randomUUID:()=>string;
  request:typeof fetch;
  scheduleTimeout?:(callback:()=>void,ms:number)=>(()=>void);
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const schedule=(callback:()=>void,ms:number)=>{const timer=setTimeout(callback,ms);return()=>clearTimeout(timer);};

/** One user-authorized diagnostic attempt per local account/installation marker.
 * The host constructs this ONLY after exact registration acknowledgement.
 * Local storage is a conservative UI fence, not the durable reservation authority:
 * server reservation and cooldown remain mandatory, including across tabs.
 * No constructor effects, registration, permission prompts or game preferences.
 * Any attempt marker blocks reuse after remount, including unknown outcomes.
 * There is deliberately no automatic reset/retry or delivered result.
 */
export function createPushRehearsalAttempt(options:Options){
  let disposed=false,pending=false;
  let active:AbortController|undefined;
  const current=()=>!disposed&&options.isCurrent();
  return {
    dispose(){disposed=true;active?.abort();},
    async send(explicitTestConsent:unknown):Promise<Result>{
      if(explicitTestConsent!==true)return 'invalid';
      if(disposed)return 'unconfirmed';
      if(pending)return 'busy';
      pending=true;
      let clearTimeout:()=>void=()=>{};
      let removeAbort:()=>void=()=>{};
      try{
        if(!UUID.test(options.accountId)||!UUID.test(options.installationId)||!current())return 'unconfirmed';
        const accountId=options.accountId.toLowerCase(),installationId=options.installationId.toLowerCase();
        const key=`touchline:push-rehearsal-attempt:v1:${accountId}:${installationId}`;
        // Even malformed or obsolete nonempty markers mean an earlier attempt
        // may have reached the provider. Do not clear or mint a new ID here.
        if(options.storage.getItem(key)!==null)return 'blocked';
        const requestId=options.randomUUID();
        if(!UUID.test(requestId))return 'unconfirmed';
        const marker=JSON.stringify({requestId:requestId.toLowerCase(),state:'attempted'});
        options.storage.setItem(key,marker);
        if(options.storage.getItem(key)!==marker||!current())return 'unconfirmed';
        const controller=new AbortController();active=controller;
        const aborted=new Promise<never>((_resolve,reject)=>{
          const abort=()=>reject(Error('attempt-unconfirmed'));
          controller.signal.addEventListener('abort',abort,{once:true});
          removeAbort=()=>controller.signal.removeEventListener('abort',abort);
        });
        clearTimeout=(options.scheduleTimeout??schedule)(()=>controller.abort(),8000);
        const run=async():Promise<Result>=>{
          controller.signal.throwIfAborted();if(!current())return 'unconfirmed';
          const response=await options.request('/api/notifications/rehearsal',{
            method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
            headers:{'Content-Type':'application/json','X-Touchline-Expected-Account':accountId},
            body:JSON.stringify({installationId,requestId:requestId.toLowerCase(),explicitTestConsent:true}),
          });
          controller.signal.throwIfAborted();if(!current()||response.status!==202)return 'unconfirmed';
          const receipt:unknown=await response.json();
          controller.signal.throwIfAborted();if(!current()||options.storage.getItem(key)!==marker)return 'unconfirmed';
          return receipt!==null&&typeof receipt==='object'&&!Array.isArray(receipt)
            &&(receipt as Record<string,unknown>).ok===true
            &&(receipt as Record<string,unknown>).status==='provider_accepted'?'provider_accepted':'unconfirmed';
        };
        const result=await Promise.race([aborted,run()]);
        // Promise settlement adds another microtask boundary after receipt
        // validation. Never publish acceptance to an invalidated host.
        if(controller.signal.aborted||!current()||options.storage.getItem(key)!==marker)return 'unconfirmed';
        return result;
      }catch{return 'unconfirmed';}
      finally{clearTimeout();removeAbort();active?.abort();active=undefined;pending=false;}
    },
  };
}
