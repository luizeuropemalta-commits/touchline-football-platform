"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { CLUB_PLANS } from "@/lib/touchlineFantasy/club-market-rules";
import controls from "@/components/touchline/TouchlineGlobalNavigation.module.css";

type GuestPlan = "standard" | "master" | "vip";
type VipCommand = Readonly<{ email: string; reason: string; commandId: string; planKey: GuestPlan }>;
type VipGrant = Readonly<{ commandId: string; targetUserId: string; planKey: GuestPlan; status: "active";
  source: "owner_vip_grant" | "owner_guest_grant"; expiresAt: null; grantedAt: string; accessReady: true }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_REJECTIONS = new Set(["VIP_INVALID_COMMAND", "VIP_FORBIDDEN", "VIP_CROSS_ORIGIN", "VIP_TARGET_NOT_REGISTERED",
  "VIP_TARGET_EMAIL_UNVERIFIED", "VIP_TARGET_AMBIGUOUS", "VIP_IDEMPOTENCY_CONFLICT", "VIP_OWNER_EXCLUDED", "VIP_TARGET_METADATA_INVALID",
  "VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED", "VIP_COLLECTION_PLAN_CHANGE_REQUIRED"]);

export function confirmedVipGrant(value: unknown, commandId: string, planKey: GuestPlan = "vip"): VipGrant | null {
  if (!value || typeof value !== "object") return null;
  const result = value as { ok?: unknown; replay?: unknown; grant?: Partial<VipGrant> };
  const grant = result.grant;
  if (result.ok !== true || typeof result.replay !== "boolean" || !grant || grant.commandId !== commandId
    || !UUID.test(grant.commandId) || typeof grant.targetUserId !== "string" || !UUID.test(grant.targetUserId)
    || grant.planKey !== planKey || grant.status !== "active" || grant.source !== (planKey === "vip" ? "owner_vip_grant" : "owner_guest_grant")
    || grant.expiresAt !== null || grant.accessReady !== true || typeof grant.grantedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T/.test(grant.grantedAt) || !Number.isFinite(Date.parse(grant.grantedAt))) return null;
  return grant as VipGrant;
}

const COPY = {
  "en-GB": {
    plan: "Guest plan", budget: "Normal starting budget", lowBalance: "The normal low-balance warning starts at 1 million. No automatic credit refill.",
    email: "Registered account email", reason: "Reason for granting guest access", confirm: "I confirm guest access under the selected plan for this registered account, without a charge or configured expiry date.",
    note: "This does not create an account, send an invitation, charge a payment, grant credits or cancel an existing subscription. The reason is recorded in the private admin audit.",
    grant: "Grant Guest access", saving: "Waiting for server confirmation…", retry: "Retry the same request", revise: "Review request", another: "Grant to another account",
    success: "Server confirmed guest access.", noExpiry: "No expiry date configured.", receipt: "Request reference", keepOpen: "The outcome is not confirmed. Keep this page open and retry the same request; do not create a replacement request.",
    errors: {
      VIP_INVALID_COMMAND: "Enter a valid email, a reason from 2 to 240 characters, and confirm the grant.",
      VIP_FORBIDDEN: "Only the authorised owner can grant guest access.", VIP_CROSS_ORIGIN: "This request was not accepted from the current page.",
      VIP_TARGET_NOT_REGISTERED: "No registered account was found for this email. The person must register first; no account or invitation was created.",
      VIP_TARGET_EMAIL_UNVERIFIED: "This account must verify its email before receiving guest access.",
      VIP_TARGET_AMBIGUOUS: "The account could not be identified uniquely. Review the registered account before trying again.",
      VIP_IDEMPOTENCY_CONFLICT: "This request reference is already bound to different details. No new grant is confirmed.",
      VIP_OWNER_EXCLUDED: "Owner and administration-only accounts cannot receive player guest access.",
      VIP_TARGET_METADATA_INVALID: "This account's access configuration requires review before guest access can be granted.",
      VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED: "This account has a paid subscription. Stop future renewals and verify the billing receipt before granting Guest access; no account or payment was changed.",
      VIP_COLLECTION_PLAN_CHANGE_REQUIRED: "This account already has a roster under another plan. Its budget must be reviewed separately; nothing was changed.",
      VIP_UNAVAILABLE: "The server has not confirmed the outcome. Retry with the same request reference.",
    },
  },
  "pt-BR": {
    plan: "Plano do convidado", budget: "Orçamento inicial normal", lowBalance: "O aviso normal de saldo baixo começa em 1 milhão. Sem reposição automática de créditos.",
    email: "E-mail da conta cadastrada", reason: "Motivo da concessão de acesso", confirm: "Confirmo o acesso de convidado no plano selecionado para esta conta cadastrada, sem cobrança nem data de expiração configurada.",
    note: "Esta ação não cria conta, envia convite, cobra pagamento, concede créditos nem cancela uma assinatura existente. O motivo fica registrado na auditoria privada do administrador.",
    grant: "Conceder Acesso Convidado", saving: "Aguardando confirmação do servidor…", retry: "Repetir a mesma solicitação", revise: "Revisar solicitação", another: "Conceder a outra conta",
    success: "O servidor confirmou o acesso de convidado.", noExpiry: "Sem data de expiração configurada.", receipt: "Referência da solicitação", keepOpen: "O resultado ainda não foi confirmado. Mantenha esta página aberta e repita a mesma solicitação; não crie outra para substituí-la.",
    errors: {
      VIP_INVALID_COMMAND: "Informe um e-mail válido, um motivo de 2 a 240 caracteres e confirme a concessão.",
      VIP_FORBIDDEN: "Somente o proprietário autorizado pode conceder acesso de convidado.", VIP_CROSS_ORIGIN: "A solicitação não foi aceita a partir desta página.",
      VIP_TARGET_NOT_REGISTERED: "Não há conta cadastrada para este e-mail. A pessoa precisa se cadastrar primeiro; nenhuma conta ou convite foi criado.",
      VIP_TARGET_EMAIL_UNVERIFIED: "Esta conta precisa confirmar seu e-mail antes de receber acesso de convidado.",
      VIP_TARGET_AMBIGUOUS: "Não foi possível identificar uma única conta. Revise o cadastro antes de tentar novamente.",
      VIP_IDEMPOTENCY_CONFLICT: "Esta referência já está vinculada a outros dados. Nenhuma nova concessão foi confirmada.",
      VIP_OWNER_EXCLUDED: "Contas de proprietário e de uso exclusivo da administração não podem receber acesso de jogador.",
      VIP_TARGET_METADATA_INVALID: "A configuração de acesso desta conta precisa ser revisada antes da concessão de acesso.",
      VIP_PAID_SUBSCRIPTION_CANCELLATION_REQUIRED: "Esta conta possui assinatura paga. Interrompa as renovações futuras e confirme o recibo antes de conceder Acesso Convidado; nenhuma conta ou cobrança foi alterada.",
      VIP_COLLECTION_PLAN_CHANGE_REQUIRED: "Esta conta já tem elenco em outro plano. O orçamento precisa de revisão separada; nada foi alterado.",
      VIP_UNAVAILABLE: "O servidor ainda não confirmou o resultado. Repita com a mesma referência de solicitação.",
    },
  },
} as const;

export default function AdminVipAccess({ locale = "en-GB" }: { locale?: string }) {
  const labels = COPY[locale === "pt-BR" ? "pt-BR" : "en-GB"];
  const id = useId();
  const [planKey, setPlanKey] = useState<GuestPlan>("vip");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [command, setCommand] = useState<VipCommand | null>(null);
  const [grant, setGrant] = useState<VipGrant | null>(null);
  const [error, setError] = useState<keyof typeof labels.errors | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [canRevise, setCanRevise] = useState(false);
  const commandRef = useRef<VipCommand | null>(null);
  const busyRef = useRef(false);
  const uncertainRef = useRef(false);
  const grantRef = useRef<VipGrant | null>(null);
  useEffect(() => {
    if ((!busy && !uncertain) || grant) return;
    const protectPendingRequest = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectPendingRequest);
    return () => window.removeEventListener("beforeunload", protectPendingRequest);
  }, [busy, uncertain, grant]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || grantRef.current) return;
    let captured = commandRef.current;
    if (!captured) {
      const normalizedEmail = email.trim().toLowerCase(), normalizedReason = reason.trim();
      if (!confirmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254
        || normalizedReason.length < 2 || normalizedReason.length > 240) { setError("VIP_INVALID_COMMAND"); return; }
      try { captured = Object.freeze({ email: normalizedEmail, reason: normalizedReason, planKey, commandId: crypto.randomUUID() }); }
      catch { setError("VIP_UNAVAILABLE"); return; }
      commandRef.current = captured;
      setCommand(captured);
    }
    busyRef.current = true; setBusy(true); setError(null); setCanRevise(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/admin/vip-access", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(captured), signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      const persisted = response.ok ? confirmedVipGrant(payload, captured.commandId, captured.planKey) : null;
      if (persisted) {
        grantRef.current = persisted; setGrant(persisted); setUncertain(false); uncertainRef.current = false;
        return;
      }
      const errorCode = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "VIP_UNAVAILABLE";
      const rejected = !response.ok && response.status >= 400 && response.status < 500 && SAFE_REJECTIONS.has(errorCode);
      if (!rejected) { uncertainRef.current = true; setUncertain(true); }
      setCanRevise(rejected && !uncertainRef.current);
      setError(rejected && Object.hasOwn(labels.errors, errorCode) ? errorCode as keyof typeof labels.errors : "VIP_UNAVAILABLE");
    } catch {
      uncertainRef.current = true; setUncertain(true); setError("VIP_UNAVAILABLE");
    } finally {
      window.clearTimeout(timeout); busyRef.current = false; setBusy(false);
    }
  }

  function reset() {
    if (busyRef.current || (!grantRef.current && (uncertainRef.current || !canRevise))) return;
    if (grantRef.current) { setEmail(""); setReason(""); }
    commandRef.current = null; grantRef.current = null; uncertainRef.current = false;
    setCommand(null); setGrant(null); setConfirmed(false); setError(null); setUncertain(false); setCanRevise(false);
  }

  const locked = busy || command !== null;
  return <form onSubmit={submit} className="grid max-w-2xl gap-5" aria-busy={busy} data-admin-vip-access="true">
    <p id={`${id}-note`} className="text-sm leading-6 text-slate-300">{labels.note}</p>
    <label className="grid gap-2 text-sm text-white" htmlFor={`${id}-plan`}>{labels.plan}
      <select id={`${id}-plan`} name="planKey" value={planKey} disabled={locked} required
        onChange={event => { const value=event.target.value; if(value==="standard"||value==="master"||value==="vip") {setPlanKey(value);setConfirmed(false);} }}
        aria-describedby={`${id}-budget`} className="min-h-11 min-w-0 rounded-xl border border-white/20 bg-black/30 px-3 text-white disabled:opacity-70">
        <option value="standard">Standard</option><option value="master">Master</option><option value="vip">VIP</option>
      </select>
    </label>
    <div id={`${id}-budget`} className="grid gap-1 rounded-xl border border-white/10 p-3 text-sm text-slate-200">
      <p>{labels.budget}: {new Intl.NumberFormat(locale === "pt-BR" ? "pt-BR" : "en-GB").format(CLUB_PLANS[planKey].budget)} TC</p>
      <p>{labels.lowBalance}</p>
    </div>
    <label className="grid gap-2 text-sm text-white" htmlFor={`${id}-email`}>{labels.email}
      <input id={`${id}-email`} name="email" type="email" autoComplete="off" required maxLength={254} value={email} disabled={locked}
        onChange={event => setEmail(event.target.value)} aria-describedby={`${id}-note`} className="min-h-11 min-w-0 rounded-xl border border-white/20 bg-black/30 px-3 text-white disabled:opacity-70" />
    </label>
    <label className="grid gap-2 text-sm text-white" htmlFor={`${id}-reason`}>{labels.reason}
      <textarea id={`${id}-reason`} name="reason" required minLength={2} maxLength={240} rows={3} value={reason} disabled={locked}
        onChange={event => setReason(event.target.value)} className="min-w-0 rounded-xl border border-white/20 bg-black/30 p-3 text-white disabled:opacity-70" />
    </label>
    <label className="flex items-start gap-3 text-sm leading-6 text-slate-200" htmlFor={`${id}-confirm`}>
      <input id={`${id}-confirm`} name="confirm" type="checkbox" required checked={confirmed} disabled={locked}
        onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-5 shrink-0" />{labels.confirm}
    </label>
    {command ? <p className="break-words text-xs leading-5 text-slate-300">{labels.receipt}: <code>{command.commandId}</code></p> : null}
    {uncertain && !grant ? <p className="text-sm leading-6 text-amber-200" role="status">{labels.keepOpen}</p> : null}
    {error ? <p className="text-sm leading-6 text-rose-200" role="alert">{labels.errors[error]}</p> : null}
    {grant ? <div role="status" className="grid gap-2 text-sm text-emerald-200" data-vip-confirmed="true">
      <p className="flex items-center gap-2"><CheckCircle2 size={18} aria-hidden="true" />{labels.success}</p>
      <p className="break-words">{command?.email} · {grant.planKey === "vip" ? "VIP" : grant.planKey === "master" ? "Master" : "Standard"}</p><p>{labels.noExpiry}</p>
    </div> : <button type="submit" className={`${controls.arena} w-fit max-w-full`} disabled={busy || (!command && (!confirmed || !email.trim() || reason.trim().length < 2))}>
      {busy ? <Loader2 size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}{busy ? labels.saving : command ? labels.retry : labels.grant}
    </button>}
    {grant || canRevise ? <button type="button" className={`${controls.link} w-fit max-w-full`} onClick={reset} disabled={busy}>{grant ? labels.another : labels.revise}</button> : null}
  </form>;
}
