import { validateCompanyMoney } from "./company-finance.ts";
export const companyKinds = ["suppliers", "contracts", "obligations", "settlements"] as const;
export type CompanyKind = typeof companyKinds[number];
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bad=()=>{throw new Error("INVALID_INPUT");};
function uuid(value:unknown){if(typeof value!=="string"||!uuidPattern.test(value))return bad();return value.toLowerCase();}
function text(value:unknown,max=1024){if(typeof value!=="string"||!value.trim()||value.length>max)return bad();return value.trim();}
function day(value:unknown){const result=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(result)||!Number.isFinite(Date.parse(result+"T00:00:00Z"))||new Date(result+"T00:00:00Z").toISOString().slice(0,10)!==result)return bad();return result;}
/** Decimal form input to exact minor units, never floating point multiplication. */
export function parseCompanyAmount(value:unknown,exponent:unknown,currency:unknown){
 if(typeof exponent!=="number"||!Number.isInteger(exponent)||exponent<0||exponent>4)return bad();
 if(typeof value!=="string"||!/^\d{1,16}(?:\.\d{1,4})?$/.test(value))return bad();
 const [whole,fraction=""]=value.split(".");if(fraction.length>exponent)return bad();
 const minor=BigInt(whole)*BigInt(10)**BigInt(exponent)+BigInt(fraction.padEnd(exponent,"0")||"0");
 if(minor>BigInt(Number.MAX_SAFE_INTEGER))return bad();
 const money={currency:text(currency,3),minor:Number(minor),exponent};validateCompanyMoney(money);return money;
}
export function parseCompanyCommand(body:unknown,actorId:string,today:string){
 if(!body||typeof body!=="object"||Array.isArray(body))return bad();
 const input=body as Record<string,unknown>;const kind=input.kind;
 if(!companyKinds.includes(kind as CompanyKind))return bad();
 const id=uuid(input.requestId),actor=uuid(actorId), fields=input.fields;
 if(!fields||typeof fields!=="object"||Array.isArray(fields))return bad();
 const f=fields as Record<string,unknown>;
 const base={id,created_by:actor};
 if(kind==="suppliers")return {kind,row:{...base,name:text(f.name,200)}};
 if(kind==="contracts"){
  const starts=day(f.starts_on),ends=f.ends_on?day(f.ends_on):null,renewal=f.renewal_on?day(f.renewal_on):null,cancel=f.cancellation_deadline_on?day(f.cancellation_deadline_on):null;
  if((ends&&ends<starts)||(renewal&&renewal<starts)||(cancel&&renewal&&cancel>renewal))return bad();
  return {kind,row:{...base,supplier_id:uuid(f.supplier_id),title:text(f.title,300),starts_on:starts,ends_on:ends,renewal_on:renewal,cancellation_deadline_on:cancel,document_reference:f.document_reference?text(f.document_reference):null}};
 }
 const money=parseCompanyAmount(f.amount,f.unit_exponent,f.currency);
 if(kind==="obligations"){
  const issued=day(f.issued_on),due=day(f.due_on);if(due<issued)return bad();
  return {kind,row:{...base,supplier_id:uuid(f.supplier_id),contract_id:f.contract_id?uuid(f.contract_id):null,source_reference:text(f.source_reference),issued_on:issued,due_on:due,currency:money.currency,unit_exponent:money.exponent,amount_minor:money.minor}};
 }
 const paid=day(f.paid_on);if(paid>day(today)||money.minor===0||!["BANK","PROVIDER","MANUAL"].includes(String(f.source)))return bad();
 return {kind,row:{id,obligation_id:uuid(f.obligation_id),currency:money.currency,unit_exponent:money.exponent,amount_minor:money.minor,paid_on:paid,source:String(f.source),source_reference:text(f.source_reference),confirmed_by:actor}};
}
export function companyReplayMatches(stored:Record<string,unknown>,proposed:Record<string,unknown>){
 return Object.entries(proposed).every(([key,value])=>stored[key]===value);
}

export async function readCompanyJson(request:Request,timeoutMs=10000){
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return null;
 const size=Number(request.headers.get("content-length"));if(Number.isFinite(size)&&size>12000)return null;
 if(!request.body)return null;const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{reject(Error("READ_TIMEOUT"));void reader.cancel().catch(()=>undefined);},timeoutMs);});
 try{while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;length+=value.byteLength;if(length>12000){void reader.cancel().catch(()=>undefined);return null;}chunks.push(value);}}
 catch{return null;}finally{clearTimeout(timer);reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes)) as unknown;}catch{return null;}
}
