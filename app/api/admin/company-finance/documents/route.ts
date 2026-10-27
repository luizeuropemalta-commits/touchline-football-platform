import { NextRequest, NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import { COMPANY_DOCUMENT_BUCKET as bucket, COMPANY_DOCUMENT_LIMIT, documentUuid, documentFilename, readCompanyDocument, inspectCompanyPdf, documentObjectKey, exactDocument } from "@/lib/admin/company-documents";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
async function authorize() { const session = await createClient(); if (!session) return null; const {data:{user},error} = await session.auth.getUser(); return !error && hasTouchLineArenaAccess(user) && isOwnerEmail(user?.email) ? user : null; }
async function privateBucket(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
 const {data,error} = await admin.storage.getBucket(bucket);
 return !error && data?.id === bucket && data.name === bucket && data.public === false && Number(data.file_size_limit) === COMPANY_DOCUMENT_LIMIT && data.allowed_mime_types?.length === 1 && data.allowed_mime_types[0] === "application/pdf";
}
export async function POST(request: NextRequest) {
 try {
  const actor = await authorize(); if (!actor) return reply({error:"FORBIDDEN"},403);
  if (request.headers.get("origin") !== request.nextUrl.origin) return reply({error:"INVALID_ORIGIN"},403);
  if (request.headers.get("content-type") !== "application/pdf") return reply({error:"INVALID_INPUT"},400);
  let id,contractId,filename,bytes,meta;
  try { id=documentUuid(request.nextUrl.searchParams.get("requestId")); contractId=documentUuid(request.nextUrl.searchParams.get("contractId")); filename=documentFilename(request.nextUrl.searchParams.get("filename")); bytes=await readCompanyDocument(request.body); meta=inspectCompanyPdf(bytes); } catch { return reply({error:"INVALID_DOCUMENT"},400); }
  const admin=createAdminClient(); if(!admin) return reply({error:"UNAVAILABLE"},503);
  const row={id,contract_id:contractId,filename,...meta,object_key:documentObjectKey(contractId,id,meta.sha256),created_by:actor.id};
  const existing=await admin.from("touchline_company_documents").select("*").eq("id",id).maybeSingle();
  if(existing.error) return reply({error:"UNAVAILABLE"},503);
  if(existing.data) return exactDocument(existing.data,row) ? reply({record:existing.data}) : reply({error:"REQUEST_CONFLICT"},409);
  const contract=await admin.from("touchline_company_contracts").select("id").eq("id",contractId).maybeSingle();
  if(contract.error) return reply({error:"UNAVAILABLE"},503);
  if(!contract.data) return reply({error:"CONTRACT_NOT_FOUND"},404);
  if(!await privateBucket(admin)) return reply({error:"UNAVAILABLE"},503);
  const store=admin.storage.from(bucket);
  const uploaded=await store.upload(row.object_key,bytes,{contentType:"application/pdf",upsert:false});
  if(uploaded.error) {
   // A response may be lost after Storage committed. Verify the existing bytes; never overwrite.
   const prior=await store.download(row.object_key);
   if(prior.error || !prior.data || prior.data.size>COMPANY_DOCUMENT_LIMIT) return reply({error:"UPLOAD_NOT_CONFIRMED"},503);
   const check=inspectCompanyPdf(await readCompanyDocument(prior.data.stream()));
   if(check.sha256!==meta.sha256 || check.byte_size!==meta.byte_size) return reply({error:"STORAGE_CONFLICT"},409);
  }
  const saved=await admin.from("touchline_company_documents").insert(row).select("*").single();
  if(!saved.error) return reply({record:saved.data},201);
  if(saved.error.code==="23505") { const retry=await admin.from("touchline_company_documents").select("*").eq("id",id).maybeSingle(); if(!retry.error&&retry.data&&exactDocument(retry.data,row)) return reply({record:retry.data}); return reply({error:"REQUEST_CONFLICT"},409); }
  // Preserve a possible private orphan for reconciliation; do not risk deleting a concurrent committed link.
  return reply({error:"LINK_NOT_CONFIRMED"},503);
 } catch {return reply({error:"UNAVAILABLE"},503);}
}
export async function GET(request: NextRequest) {
 try {
  if(!await authorize()) return reply({error:"FORBIDDEN"},403);
  const admin=createAdminClient(); if(!admin) return reply({error:"UNAVAILABLE"},503);
  const raw=request.nextUrl.searchParams.get("id");
  if(!raw) {
   let contractId; try{contractId=documentUuid(request.nextUrl.searchParams.get("contractId"));}catch{return reply({error:"INVALID_INPUT"},400);}
   const pageRaw=request.nextUrl.searchParams.get("page")??"0",page=Number(pageRaw);
   if(!/^\d+$/.test(pageRaw)||!Number.isSafeInteger(page)||page>10000) return reply({error:"INVALID_INPUT"},400);
   const rows=await admin.from("touchline_company_documents").select("id,contract_id,filename,byte_size,created_at").eq("contract_id",contractId).order("id").range(page*50,page*50+50);
   return rows.error?reply({error:"UNAVAILABLE"},503):reply({rows:(rows.data??[]).slice(0,50),hasNext:(rows.data?.length??0)>50,page});
  }
  let id; try{id=documentUuid(raw);}catch{return reply({error:"INVALID_INPUT"},400);}
  const record=await admin.from("touchline_company_documents").select("*").eq("id",id).maybeSingle();
  if(record.error) return reply({error:"UNAVAILABLE"},503); if(!record.data) return reply({error:"NOT_FOUND"},404);
  const row=record.data;
  if(row.object_key!==documentObjectKey(row.contract_id,row.id,row.sha256)||!await privateBucket(admin)) return reply({error:"UNAVAILABLE"},503);
  const file=await admin.storage.from(bucket).download(row.object_key);
  if(file.error||!file.data||file.data.size>COMPANY_DOCUMENT_LIMIT) return reply({error:"UNAVAILABLE"},503);
  const bytes=await readCompanyDocument(file.data.stream()),meta=inspectCompanyPdf(bytes);
  if(meta.sha256!==row.sha256||meta.byte_size!==row.byte_size) return reply({error:"INTEGRITY_MISMATCH"},409);
  return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"application/pdf","Content-Length":String(bytes.length),"Content-Disposition":`attachment; filename="contract.pdf"; filename*=UTF-8''${encodeURIComponent(documentFilename(row.filename))}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox; default-src 'none'"}});
 }catch{return reply({error:"UNAVAILABLE"},503);}
}
