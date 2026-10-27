import { createHash } from "node:crypto";
export const COMPANY_DOCUMENT_BUCKET = "touchline-company-documents";
export const COMPANY_DOCUMENT_LIMIT = 3 * 1024 * 1024;
export function documentUuid(value: string | null): string {
 if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("INVALID_INPUT");
 return value.toLowerCase();
}
export function documentFilename(value: string | null): string {
 if (!value || value.length < 5 || value.length > 160 || /[\x00-\x1f\x7f/\\]/.test(value) || !value.toLowerCase().endsWith(".pdf")) throw new Error("INVALID_INPUT");
 return value;
}
export async function readCompanyDocument(stream: ReadableStream<Uint8Array> | null): Promise<Buffer> {
 if (!stream) throw new Error("INVALID_INPUT");
 const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
 const deadline=Date.now()+30000;
 try { while (true) { let timer: ReturnType<typeof setTimeout> | undefined;
 let next: ReadableStreamReadResult<Uint8Array>;
 try { next=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("READ_TIMEOUT")),Math.max(0,deadline-Date.now()));})]); } catch(error) { void reader.cancel().catch(()=>undefined); throw error; } finally { if(timer)clearTimeout(timer); }
 if (next.done) break; size += next.value.byteLength;
 if (size > COMPANY_DOCUMENT_LIMIT) { await reader.cancel(); throw new Error("TOO_LARGE"); } chunks.push(next.value); }
 } finally { reader.releaseLock(); }
 return Buffer.concat(chunks);
}
// Structural admission checks only: this is not a complete PDF parser or malware scan.
export function inspectCompanyPdf(bytes: Uint8Array) {
 const data = Buffer.from(bytes);
 if (!data.length || data.length > COMPANY_DOCUMENT_LIMIT || !/^%PDF-(1\.[0-7]|2\.0)[\r\n ]/.test(data.subarray(0,12).toString("ascii")) || !/%%EOF\s*$/.test(data.subarray(-1024).toString("ascii"))) throw new Error("INVALID_PDF");
 return { byte_size: data.length, sha256: createHash("sha256").update(data).digest("hex"), mime_type: "application/pdf" };
}
export function documentObjectKey(contractId: string, requestId: string, sha256: string) {
 if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("INVALID_INPUT");
 return `contracts/${documentUuid(contractId)}/${documentUuid(requestId)}/${sha256}.pdf`;
}
export function exactDocument(existing: Record<string, unknown>, proposed: Record<string, unknown>) {
 return Object.keys(proposed).every(key => existing[key] === proposed[key]);
}
