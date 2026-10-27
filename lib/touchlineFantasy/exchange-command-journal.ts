import {prepareExchangeCommand,type ExchangeCommandEnvelope} from './exchange-command-client.ts';
type Storage=Pick<globalThis.Storage,'getItem'|'setItem'|'removeItem'>;
const key=(accountId:string,seasonId:string)=>`touchline.exchange.intent.v1:${accountId}:${seasonId}`;
/** Stores only the already validated command identity/context, never balances,
 * tokens, cookies or credentials. A restored command is read-only until reconciled. */
export function readExchangeCommandJournal(storage:Storage,accountId:string,seasonId:string):ExchangeCommandEnvelope|null{
 try{const raw=storage.getItem(key(accountId,seasonId));if(!raw)return null;const parsed=prepareExchangeCommand(JSON.parse(raw));return parsed?.expectedAccountId===accountId&&parsed.expectedSeasonId===seasonId?parsed:null;}catch{return null;}
}
export function writeExchangeCommandJournal(storage:Storage,value:ExchangeCommandEnvelope):boolean{
 const parsed=prepareExchangeCommand(value);if(!parsed)return false;
 try{const encoded=JSON.stringify(parsed);storage.setItem(key(parsed.expectedAccountId,parsed.expectedSeasonId),encoded);return storage.getItem(key(parsed.expectedAccountId,parsed.expectedSeasonId))===encoded;}catch{return false;}
}
export function clearExchangeCommandJournal(storage:Storage,accountId:string,seasonId:string):void{
 try{storage.removeItem(key(accountId,seasonId));}catch{/* A retained command is safer than silently losing an uncertain write. */}
}
