"use client";
import { useEffect, useRef, useState } from "react";
import { GamePanel } from "@/components/arena-admin-ui";
import styles from "../TouchlineGlobalNavigation.module.css";
import { CompanyMailReview } from "./CompanyMailReview";
type Row=Record<string,string|number|boolean|null>;
type Kind="evidence"|"scans"|"retries";
const names:Record<Kind,[string,string]>={evidence:["Documentos recebidos","Received documents"],scans:["Importações","Imports"],retries:["Pendências de leitura","Reading issues"]};
export default function CompanyMailPanel({portuguese}:{portuguese:boolean}){
 const t=(pt:string,en:string)=>portuguese?pt:en;
 const [kind,setKind]=useState<Kind>("evidence"),[page,setPage]=useState(0),[rows,setRows]=useState<Row[]>([]),[next,setNext]=useState(false),[revision,setRevision]=useState(0);
 const [reviewOpen,setReviewOpen]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 const [running,setRunning]=useState<string|null>(null),[notice,setNotice]=useState<"confirmed"|"disabled"|"busy"|"uncertain"|null>(null);
 const mutation=useRef<AbortController|null>(null);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;mutation.current?.abort();};},[]);
 useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);let active=true;
  void fetch(`/api/admin/company-finance/mail?kind=${kind}&page=${page}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
   if(!response.ok)throw Error("unavailable");const body=await response.json();
   if(!Array.isArray(body.rows)||typeof body.hasNext!=="boolean")throw Error("invalid");
   if(active){setRows(body.rows);setNext(body.hasNext);}
  }).catch(()=>{if(active)setFailed(true);}).finally(()=>{clearTimeout(timer);if(active)setLoading(false);});
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[kind,page,revision]);
 function refresh(){setNotice(null);setLoading(true);setFailed(false);setRevision(value=>value+1);}
 async function run(id:string){
  if(mutation.current)return;
  const controller=new AbortController();mutation.current=controller;setRunning(id);setNotice(null);
  const timer=setTimeout(()=>controller.abort(),150000);
  try{const response=await fetch("/api/admin/company-finance/mail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"run",scanId:id}),signal:controller.signal});
   if(!response.ok)throw Error("unconfirmed");const body=await response.json();
   const state=body?.result?.state;
   if(!["DISABLED","BUSY","STALE","SCAN_FINISHED","IMPORTED","REVIEW_REQUIRED"].includes(state))throw Error("invalid");
   if(mounted.current&&!controller.signal.aborted){refresh();setNotice(state==="DISABLED"?"disabled":state==="BUSY"?"busy":"confirmed");}
  }catch{if(mounted.current)setNotice("uncertain");}finally{clearTimeout(timer);mutation.current=null;if(mounted.current)setRunning(null);}
 }
 return <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
  <GamePanel className="space-y-4 p-6"><h1 className="text-3xl font-bold">{t("Documentos por e-mail","Documents by email")}</h1>
   <p>{t("Originais recebidos para conferência. Uma mensagem não confirma pagamento: os valores e comprovantes devem ser revisados na administração da empresa.","Original messages for review. A message does not confirm payment: amounts and evidence must be reviewed in company administration.")}</p>
   <nav className="flex flex-wrap gap-3">{(Object.keys(names) as Kind[]).map(item=><button key={item} className={styles.link} aria-pressed={item===kind} disabled={item===kind||running!==null} onClick={()=>{setKind(item);setPage(0);setLoading(true);setFailed(false);setNotice(null);}}>{names[item][portuguese?0:1]}</button>)}</nav>
  </GamePanel>
  <GamePanel className="space-y-4 p-6">
   {notice?<p role="status">{notice==="disabled"?t("Esta caixa ainda não está habilitada para importação.","This mailbox is not enabled for import yet."):notice==="busy"?t("Esta importação já está em execução. Aguarde e atualize os registros.","This import is already running. Wait and refresh the records."):notice==="uncertain"?t("Resultado não confirmado. Atualize os registros antes de tentar novamente.","Result not confirmed. Refresh records before retrying."):t("Lote processado. Confira os documentos e as pendências de leitura.","Batch processed. Review documents and outstanding reading issues.")}</p>:null}
   {loading?<p role="status">{t("Consultando registros…","Loading records…")}</p>:failed?<p role="alert">{t("Registros indisponíveis. Isso não significa que todos os e-mails foram importados.","Records unavailable. This does not mean all messages have been imported.")}</p>:rows.length===0?<p>{t("Nenhum registro nesta página. A conexão e a importação precisam estar configuradas para receber documentos.","No records on this page. Connection and import must be configured to receive documents.")}</p>:<ul className="divide-y divide-white/10">{rows.map((row,index)=><li key={String(row.id??`${row.scan_id}:${row.message_id}:${index}`)} className="space-y-3 py-5">
    {kind==="evidence"?<><h2 className="break-words text-lg font-semibold">{String(row.subject||t("Sem assunto","No subject"))}</h2><p className="break-words text-sm text-slate-300">{String(row.sender)} · {String(row.received_at)}</p><p className="text-sm">{row.review_action?t("Conferência registrada","Review recorded"):t("Aguardando conferência","Awaiting review")}</p><details><summary className="cursor-pointer">{t("Ver texto da mensagem","Read message text")}</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{String(row.plain_text??"")}</pre></details><a className={styles.link} href={`/api/admin/company-finance/mail/original?id=${encodeURIComponent(String(row.id))}`}>{t("Baixar original (.eml)","Download original (.eml)")}</a><button type="button" className={styles.link} aria-expanded={reviewOpen===String(row.id)} onClick={()=>setReviewOpen(current=>current===String(row.id)?null:String(row.id))}>{t("Conferir e organizar","Review and organize")}</button>{reviewOpen===String(row.id)?<CompanyMailReview evidenceId={String(row.id)} portuguese={portuguese} onConfirmed={refresh}/>:null}</>:kind==="scans"?<><h2 className="break-words font-semibold">{String(row.query)}</h2><p>{row.completed?t("Busca encerrada; confira as pendências de leitura.","Scan finished; check outstanding reading issues."):t("Importação em andamento ou aguardando execução.","Import in progress or awaiting execution.")}</p><p className="text-sm">{t("Última atualização: ","Last update: ")}{String(row.updated_at)}</p>{!row.completed?<button className={styles.link} disabled={running!==null||notice==="uncertain"} onClick={()=>void run(String(row.id))}>{running===row.id?t("Importando…","Importing…"):t("Importar próximo lote","Import next batch")}</button>:null}</>:<><h2 className="break-words font-semibold">{t("Mensagem: ","Message: ")}{String(row.message_id)}</h2><p>{row.resolved_at?t("Leitura recuperada","Reading recovered"):t("Leitura pendente; original ainda não confirmado.","Reading pending; original not yet confirmed.")}</p><p className="text-sm">{String(row.code)} · {t("Tentativas: ","Attempts: ")}{String(row.attempts)}</p></>}
   </li>)}</ul>}
   <div className="flex flex-wrap gap-3"><button className={styles.link} disabled={loading} onClick={refresh}>{t("Atualizar registros","Refresh records")}</button><button className={styles.link} disabled={page===0||loading} onClick={()=>{setPage(value=>value-1);setLoading(true);setFailed(false);}}>{t("Anterior","Previous")}</button><button className={styles.link} disabled={!next||loading||failed} onClick={()=>{setPage(value=>value+1);setLoading(true);setFailed(false);}}>{t("Próxima","Next")}</button></div>
  </GamePanel>
 </main>;
}
