import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as core from '../lib/admin/company-documents.ts';
const actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',contract='33333333-3333-4333-8333-333333333333';
const pdf=Buffer.from('%PDF-1.7\nstructural fixture only\n%%EOF\n');
test('PDF checks and streamed limit derive hash and size; reject malformed and unsafe names',async()=>{
 const meta=core.inspectCompanyPdf(pdf);assert.equal(meta.byte_size,pdf.length);assert.equal(meta.sha256.length,64);
 assert.throws(()=>core.inspectCompanyPdf(Buffer.from('not PDF')));assert.throws(()=>core.inspectCompanyPdf(Buffer.concat([pdf,Buffer.from('junk')])));
 for(const name of ['.pdf','../contract.pdf','x\r\n.pdf','x.png','x\\y.pdf'])assert.throws(()=>core.documentFilename(name));
 assert.equal(core.documentFilename('Contrato 2026.pdf'),'Contrato 2026.pdf');
 assert.equal(core.documentObjectKey(contract,id,meta.sha256),`contracts/${contract}/${id}/${meta.sha256}.pdf`);
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(core.COMPANY_DOCUMENT_LIMIT+1));},cancel(){cancelled=true;}});
 await assert.rejects(core.readCompanyDocument(stream));assert.equal(cancelled,true);
});
/* eslint-disable @typescript-eslint/no-explicit-any */
function harness(options:{denied?:boolean;publicBucket?:boolean;lostUpload?:boolean;corrupt?:boolean;dbFail?:boolean}={}) {
 const rows=new Map<string,any>();let storageReads=0,writes=0,dbReads=0,audits=0;
 class Response {body:any;init:any;constructor(body:any,init:any){this.body=body;this.init=init;}static json(body:any,init:any){return new Response(body,init);}}
 const admin={from:(table:string)=>{let key='',proposed:any;const b:any={select:()=>b,eq:(_k:string,v:string)=>{key=v;return b;},maybeSingle:async()=>{dbReads++;return {data:table.endsWith('contracts')?{id:contract}:rows.get(key)??null,error:null};},insert:(r:any)=>{proposed=r;return b;},single:async()=>{if(options.dbFail)return{data:null,error:{code:'08006'}};if(rows.has(proposed.id))return{data:null,error:{code:'23505'}};rows.set(proposed.id,proposed);audits++;return{data:proposed,error:null};}};return b;},storage:{getBucket:async()=>({data:{id:core.COMPANY_DOCUMENT_BUCKET,name:core.COMPANY_DOCUMENT_BUCKET,public:options.publicBucket??false,file_size_limit:core.COMPANY_DOCUMENT_LIMIT,allowed_mime_types:['application/pdf']},error:null}),from:()=>({upload:async(_k:string,_v:unknown,opts:any)=>{assert.equal(opts.upsert,false);writes++;return {error:options.lostUpload?{}:null};},download:async()=>{storageReads++;return{data:new Blob([options.corrupt?Buffer.from('%PDF-1.7\nOTHER\n%%EOF'):pdf]),error:null};}})}};
 const deps:any={'next/server':{NextResponse:Response},'@/lib/admin/owner':{isOwnerEmail:()=>!options.denied},'@/lib/touchlineArena/auth-access':{hasTouchLineArenaAccess:()=>!options.denied},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:actor,email:'admin@example.test'}},error:null})}})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/admin/company-documents':core};
 const exports:any={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/api/admin/company-finance/documents/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,Uint8Array,Number,encodeURIComponent,require:(n:string)=>{assert.ok(deps[n],n);return deps[n];}});
 const req=(query=`requestId=${id}&contractId=${contract}&filename=contract.pdf`,origin='https://qa.test')=>({nextUrl:new URL(`https://qa.test/api?${query}`),headers:new Headers({'origin':origin,'content-type':'application/pdf'}),body:new Blob([pdf]).stream()});
 return{...exports,req,rows,counts:()=>({storageReads,writes,dbReads,audits})};
}
test('admin/origin enforcement occurs before storage or database access',async()=>{
 const h=harness({denied:true});assert.equal((await h.POST(h.req())).init.status,403);assert.equal((await h.GET(h.req(`id=${id}`))).init.status,403);assert.deepEqual(h.counts(),{storageReads:0,writes:0,dbReads:0,audits:0});
 const a=harness();assert.equal((await a.POST(a.req(undefined,'https://bad.test'))).init.status,403);assert.equal(a.counts().writes,0);
});
test('private create-only document link replays exactly and emits attachment with verified bytes',async()=>{
 const h=harness();assert.equal((await h.POST(h.req())).init.status,201);assert.equal((await h.POST(h.req())).init.status,200);assert.equal(h.counts().writes,1);assert.equal(h.counts().audits,1);
 const response=await h.GET(h.req(`id=${id}`));assert.equal(response.init.headers['X-Content-Type-Options'],'nosniff');assert.match(response.init.headers['Content-Disposition'],/^attachment;/);assert.equal(response.init.headers['Cache-Control'],'private, no-store');
 const row=h.rows.get(id);row.filename='different.pdf';assert.equal((await h.POST(h.req())).init.status,409);assert.equal(h.counts().writes,1);
});
test('public bucket, corrupt retries, and lost database response never silently confirm a document',async()=>{
 const pub=harness({publicBucket:true});assert.equal((await pub.POST(pub.req())).init.status,503);assert.equal(pub.counts().writes,0);
 const retry=harness({lostUpload:true});assert.equal((await retry.POST(retry.req())).init.status,201);assert.equal(retry.counts().storageReads,1);
 const bad=harness({lostUpload:true,corrupt:true});assert.equal((await bad.POST(bad.req())).init.status,409);assert.equal(bad.counts().audits,0);
 const fail=harness({dbFail:true});assert.equal((await fail.POST(fail.req())).init.status,503);assert.equal(fail.counts().audits,0);
});
test('local migration enforces private bucket, immutable links, actor audit and atomic rollback',{skip:!process.env.TOUCHLINE_COMPANY_PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.TOUCHLINE_COMPANY_PGLITE_MODULE!);const db=new PGlite();
 try {
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;insert into auth.users values('${actor}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text);`);
 for(const file of ['20261025205533_touchline_company_finance_foundation.sql','20261025211157_touchline_company_private_documents.sql'])await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
 await db.exec(`set role service_role;insert into public.touchline_company_suppliers(id,name,created_by) values('${id}','Fixture supplier','${actor}');insert into public.touchline_company_contracts(id,supplier_id,title,starts_on,created_by) values('${contract}','${id}','Fixture contract','2026-01-01','${actor}');`);
 const meta=core.inspectCompanyPdf(pdf),key=core.documentObjectKey(contract,id,meta.sha256);
 const insert=()=>db.query(`insert into public.touchline_company_documents(id,contract_id,filename,object_key,mime_type,byte_size,sha256,created_by) values($1,$2,'contract.pdf',$3,'application/pdf',$4,$5,$6)`,[id,contract,key,meta.byte_size,meta.sha256,actor]);
 await insert();assert.equal(Number((await db.query('select count(*) n from public.touchline_company_audit_events')).rows[0].n),3);
 await assert.rejects(insert(),/unique/i);
 await assert.rejects(db.exec(`update public.touchline_company_documents set filename='other.pdf'`),/permission denied/i);
 await db.exec('reset role');
 await assert.rejects(db.exec(`begin;insert into public.touchline_company_documents select '44444444-4444-4444-8444-444444444444',contract_id,filename,'wrong',mime_type,byte_size,sha256,created_by,created_at from public.touchline_company_documents;commit;`),/check/i);await db.exec('rollback');
 assert.equal(Number((await db.query('select count(*) n from public.touchline_company_audit_events')).rows[0].n),3);
 assert.equal((await db.query(`select public from storage.buckets where id='touchline-company-documents'`)).rows[0].public,false);
 for(const role of ['anon','authenticated']){await db.exec(`reset role;set role ${role}`);await assert.rejects(db.query('select * from public.touchline_company_documents'),/permission denied/i);}
 }finally{await db.close();}
});
