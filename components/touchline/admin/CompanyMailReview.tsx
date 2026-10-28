"use client";
import { useEffect,useRef,useState } from "react";
import styles from "../TouchlineGlobalNavigation.module.css";
type Kind="contracts"|"obligations"|"settlements";
export function CompanyMailReview({evidenceId,portuguese,onConfirmed}:{evidenceId:string;portuguese:boolean;onConfirmed:()=>void}){
 const t=(pt:string,en:string)=>portuguese?pt:en;
 const [action,setAction]=useState("LINK"),[kind,setKind]=useState<Kind>("obligations"),[target,setTarget]=useState(""),[note,setNote]=useState("");
 const [rows,setRows]=useState<{id:string;label:string}[]>([]),[page,setPage]=useState(0),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState<"confirmed"|"uncertain"|null>(null);
 const receipt=useRef<{signature:string;id:string}|null>(null),mutation=useRef<AbortController|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;mutation.current?.abort();};},[]);
 useEffect(()=>{if(action!=="LINK")return;const controller=new AbortController();let active=true;const timer=setTimeout(()=>controller.abort(),15000);
  void fetch(`/api/admin/company-finance?kind=${kind}&page=${page}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
   if(!response.ok)throw Error("unavailable");const body=await response.json();if(!Array.isArray(body.rows))throw Error("invalid");
   const options=body.rows.map((row:Record<string,unknown>)=>{if(typeof row.id!=="string")throw Error("invalid");return {id:row.id,label:String(row.title??row.source_reference??row.id)};});
   if(active){setRows(current=>page===0?options:[...current,...options.filter((item:{id:string})=>!current.some(row=>row.id===item.id))]);setMore(body.hasNext===true);}
  }).catch(()=>{if(active)setFailed(true);}).finally(()=>{clearTimeout(timer);if(active)setLoading(false);});return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[action,kind,page,revision]);
 async function save(event:React.FormEvent){event.preventDefault();if(mutation.current)return;
  const command={evidenceId,action,kind:action==="LINK"?kind:null,targetId:action==="LINK"?target:null,note};
  const signature=JSON.stringify(command);if(receipt.current?.signature!==signature)receipt.current={signature,id:crypto.randomUUID()};
  const controller=new AbortController();mutation.current=controller;setSaving(true);setNotice(null);const timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetch("/api/admin/company-finance/mail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"review",command:{...command,requestId:receipt.current.id}}),signal:controller.signal});
   if(!response.ok)throw Error("unconfirmed");const body=await response.json();if(body?.review?.id!==receipt.current.id||body?.review?.evidence_id!==evidenceId)throw Error("unconfirmed");
   if(mounted.current){setNotice("confirmed");onConfirmed();}
  }catch{if(mounted.current)setNotice("uncertain");}finally{clearTimeout(timer);mutation.current=null;if(mounted.current)setSaving(false);}
 }
 return <form onSubmit={event=>void save(event)} className="mt-4 grid gap-3 rounded-xl border border-white/15 p-4">
  <p className="text-sm">{t("Vincule a mensagem a um registro já conferido. Esta ação não cria despesas, não confirma pagamentos e não movimenta dinheiro.","Link this message to an already reviewed record. This action does not create expenses, confirm payments or move money.")}</p>
  <label className="grid gap-1">{t("Destino","Disposition")}<select aria-label={t("Destino","Disposition")} disabled={saving} value={action} onChange={event=>{setAction(event.target.value);setLoading(true);setFailed(false);}} className="rounded-lg bg-slate-900 p-2"><option value="LINK">{t("Vincular a registro","Link to record")}</option><option value="IGNORE">{t("Arquivar sem vínculo financeiro","Archive without financial link")}</option></select></label>
  {action==="LINK"?<><label className="grid gap-1">{t("Tipo de registro","Record type")}<select aria-label={t("Tipo de registro","Record type")} disabled={saving} value={kind} onChange={event=>{setKind(event.target.value as Kind);setTarget("");setPage(0);setRows([]);setLoading(true);setFailed(false);}} className="rounded-lg bg-slate-900 p-2"><option value="obligations">{t("Conta a pagar","Payable")}</option><option value="contracts">{t("Contrato","Contract")}</option><option value="settlements">{t("Pagamento já confirmado","Already confirmed payment")}</option></select></label>
   <label className="grid gap-1">{t("Registro","Record")}<select aria-label={t("Registro","Record")} required disabled={saving||loading||failed} value={target} onChange={event=>setTarget(event.target.value)} className="min-w-0 rounded-lg bg-slate-900 p-2"><option value="">{t("Selecione…","Select…")}</option>{rows.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
   {loading?<p role="status">{t("Carregando opções…","Loading options…")}</p>:failed?<p role="alert">{t("Não foi possível carregar os registros.","Records could not be loaded.")}</p>:null}
   {failed?<button type="button" className={styles.link} onClick={()=>{setFailed(false);setLoading(true);setRevision(value=>value+1);}}>{t("Recarregar opções","Reload options")}</button>:more?<button type="button" className={styles.link} disabled={loading||saving} onClick={()=>{setPage(value=>value+1);setLoading(true);}}>{t("Mais registros","More records")}</button>:null}</>:null}
  <label className="grid gap-1">{t("Observação da conferência","Review note")}<textarea required maxLength={2000} disabled={saving} value={note} onChange={event=>setNote(event.target.value)} className="rounded-lg bg-slate-900 p-2"/></label>
  <button className={styles.link} disabled={saving||!note.trim()||(action==="LINK"&&(!target||loading||failed))}>{saving?t("Salvando…","Saving…"):t("Registrar conferência","Record review")}</button>
  {notice?<p role="status">{notice==="confirmed"?t("Conferência registrada.","Review recorded."):t("Conferência não confirmada. Uma nova tentativa com os mesmos dados não duplica o registro.","Review not confirmed. Retrying the same details does not duplicate the record.")}</p>:null}
 </form>;
}
