import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";
import {readFileSync} from "node:fs";
import * as core from "../lib/admin/company-finance-api.ts";
const modulePath=process.env.TOUCHLINE_COMPANY_PGLITE_MODULE;
const actor="11111111-1111-4111-8111-111111111111",supplier="22222222-2222-4222-8222-222222222222",contract="33333333-3333-4333-8333-333333333333",obligation="44444444-4444-4444-8444-444444444444",payment="55555555-5555-4555-8555-555555555555";
/* eslint-disable @typescript-eslint/no-explicit-any */
test("actual finance handlers + parser + SQL transport + migration compose atomically",{skip:!modulePath},async t=>{
 const {PGlite}=await import(modulePath!);const db=new PGlite();
 try{
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;insert into auth.users values('${actor}');`);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261025205533_touchline_company_finance_foundation.sql",import.meta.url),"utf8"));
  await db.exec('set role service_role');
  // Transport only: fluent calls are translated to actual SQL, not canned business responses.
  const transport={from:(table:string)=>{
   assert.match(table,/^touchline_company_(suppliers|contracts|obligations|settlements)$/);
   let row:Record<string,unknown>|null=null,where:unknown=null,start=0,end=49;
   const execute=async(single:boolean)=>{try{
    let result;if(row){const keys=Object.keys(row);keys.forEach(key=>assert.match(key,/^[a-z_]+$/));result=await db.query(`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')}) returning *`,Object.values(row));}
    else if(where!==null)result=await db.query(`select * from public.${table} where id=$1`,[where]);
    else result=await db.query(`select * from public.${table} order by id asc offset $1 limit $2`,[start,end-start+1]);
    const rows=result.rows.map((record:Record<string,unknown>)=>Object.fromEntries(Object.entries(record).map(([key,value])=>[key,value instanceof Date?(key.endsWith("_on")?value.toISOString().slice(0,10):value.toISOString()):typeof value==="bigint"?Number(value):value])));
    return{data:single?rows[0]??null:rows,error:null};
   }catch(error){return{data:null,error:{code:(error as any).code,message:String(error)}};}};
   const builder:any={select:()=>builder,eq:(key:string,value:unknown)=>{assert.equal(key,'id');where=value;return builder;},order:(key:string)=>{assert.equal(key,'id');return builder;},range:(a:number,b:number)=>{start=a;end=b;return execute(false);},insert:(value:Record<string,unknown>)=>{row=value;return builder;},maybeSingle:()=>execute(true),single:()=>execute(true)};return builder;
  },rpc:async(name:string,args:Record<string,unknown>)=>{assert.equal(name,'touchline_company_record_settlement');try{const result=await db.query(`select public.touchline_company_record_settlement($1::uuid,$2::uuid,$3::text,$4::smallint,$5::bigint,$6::date,$7::text,$8::text,$9::uuid) result`,[args.p_request_id,args.p_obligation_id,args.p_currency,args.p_unit_exponent,args.p_amount_minor,args.p_paid_on,args.p_source,args.p_source_reference,args.p_actor_id]);return{data:result.rows[0].result,error:null};}catch(error){return{data:null,error:{code:(error as any).code,message:String(error)}};}}};
  class Response{body:any;init:any;constructor(body:any,init:any){this.body=body;this.init=init;}static json(body:any,init:any){return new Response(body,init);}}
  const dependencies:any={"next/server":{NextResponse:Response},"@/lib/admin/owner":{isOwnerEmail:()=>true},"@/lib/touchlineArena/auth-access":{hasTouchLineArenaAccess:()=>true},"@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:actor,email:"owner@example.test"}},error:null})}})},"@/lib/supabase/admin":{createAdminClient:()=>transport},"@/lib/admin/company-finance-api":core};
  const exports:any={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../app/api/admin/company-finance/route.ts",import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,Date,require:(name:string)=>{assert.ok(Object.hasOwn(dependencies,name));return dependencies[name];}});
  const post=async(kind:string,requestId:string,fields:Record<string,unknown>)=>{const request=new Request("https://qa.test/api/admin/company-finance",{method:"POST",headers:{origin:"https://qa.test","content-type":"application/json"},body:JSON.stringify({kind,requestId,fields})});return exports.POST(Object.assign(request,{nextUrl:new URL(request.url)}));};
  const count=async()=>Number((await db.query('select count(*) n from public.touchline_company_audit_events')).rows[0].n);
  await t.test("real supplier, contract, obligation and manual settlement persist once through handlers",async()=>{
   const commands:[string,string,Record<string,unknown>][]=[['suppliers',supplier,{name:'Provider'}],['contracts',contract,{supplier_id:supplier,title:'Service',starts_on:'2026-01-01',ends_on:'2026-12-31'}],['obligations',obligation,{supplier_id:supplier,contract_id:contract,source_reference:'invoice-source',issued_on:'2026-10-01',due_on:'2026-10-25',currency:'EUR',unit_exponent:2,amount:'100.29'}],['settlements',payment,{obligation_id:obligation,currency:'EUR',unit_exponent:2,amount:'40.29',paid_on:'2026-10-01',source:'MANUAL',source_reference:'bank-line-1'}]];
   for(const [kind,id,fields] of commands){const first=await post(kind,id,fields);assert.ok([200,201].includes(first.init.status),JSON.stringify(first.body));const repeated=await post(kind,id,fields);assert.equal(repeated.init.status,200,JSON.stringify(repeated.body));assert.equal(repeated.body.record.id,id);}
   assert.equal(await count(),4);assert.equal(Number((await db.query(`select amount_minor from public.touchline_company_obligations where id='${obligation}'`)).rows[0].amount_minor),10029);
  });
  await t.test("failed FK/currency and conflicting replay do not append audit or rows",async()=>{
   const before=await count();const fields={obligation_id:obligation,currency:'GBP',unit_exponent:2,amount:'1',paid_on:'2026-10-01',source:'MANUAL',source_reference:'wrong-currency'};
   assert.equal((await post('settlements','66666666-6666-4666-8666-666666666666',fields)).init.status,409);
   assert.equal((await post('suppliers',supplier,{name:'Different'})).init.status,409);
   assert.equal(await count(),before);
  });
  await t.test("pagination returns real persisted rows without duplicates across boundaries",async()=>{
   for(let i=1;i<=51;i++){const id=`77777777-7777-4777-8777-${String(i).padStart(12,'0')}`;assert.equal((await post('suppliers',id,{name:`Supplier ${i}`})).init.status,201);}
   const get=(page:number)=>exports.GET({nextUrl:new URL(`https://qa.test/api/admin/company-finance?kind=suppliers&page=${page}`)});
   const first=await get(0),second=await get(1);assert.equal(first.body.rows.length,50);assert.equal(first.body.hasNext,true);assert.equal(second.body.rows.length,2);assert.equal(second.body.hasNext,false);
   assert.equal(new Set([...first.body.rows,...second.body.rows].map(row=>row.id)).size,52);
  });
 }finally{await db.close();}
});
