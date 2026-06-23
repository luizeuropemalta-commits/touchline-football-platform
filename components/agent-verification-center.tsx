"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileUp,
  Filter,
  Globe2,
  IdCard,
  Loader2,
  LockKeyhole,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, LivePill, Meter, SectionHeader } from "@/components/game-ui";
import { cn } from "@/lib/utils";

const LEGAL_WARNING =
  "Only add players for whom you have valid representation rights, written authorization, or a legally recognized relationship.";

type VerificationStatus = "unverified_agent" | "verified_agent" | "fifa_licensed_agent" | "agency_verified";
type AssociationStatus =
  | "suggested"
  | "pending_verification"
  | "verified_representation"
  | "expired_representation"
  | "rejected"
  | "former_client"
  | "prospect";

type Verification = {
  id: string | null;
  fifa_agent_id: string | null;
  fifa_license_number: string | null;
  legal_name: string;
  country_code: string | null;
  agency_name: string | null;
  verification_status: VerificationStatus;
  license_expires_on: string | null;
  official_document_path: string | null;
  official_document_name: string | null;
  official_document_uploaded_at: string | null;
};

type RepresentationDocument = {
  id: string;
  document_type: string;
  name: string;
  ai_validation_status: string;
  ai_validation_notes?: string | null;
  created_at: string;
};

type Association = {
  id: string;
  player_id?: string | null;
  suggested_name: string;
  suggested_position?: string | null;
  suggested_nationality?: string | null;
  suggested_club?: string | null;
  suggested_photo_url?: string | null;
  external_source?: string | null;
  external_reference_url?: string | null;
  confidence_score?: number | null;
  status: AssociationStatus;
  representation_starts_on?: string | null;
  representation_expires_on?: string | null;
  public_visible: boolean;
  ai_validation_status: string;
  created_at: string;
  updated_at: string;
  players?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    position?: string | null;
    nationality?: string | null;
    photo_url?: string | null;
    market_value?: number | null;
    currency?: string | null;
    external_market_url?: string | null;
    clubs?: { name?: string | null } | null;
  } | null;
  representation_documents?: RepresentationDocument[];
};

const defaultVerification: Verification = {
  id: null,
  fifa_agent_id: "",
  fifa_license_number: "",
  legal_name: "",
  country_code: "MT",
  agency_name: "",
  verification_status: "unverified_agent",
  license_expires_on: null,
  official_document_path: null,
  official_document_name: null,
  official_document_uploaded_at: null,
};

const verificationLabels: Record<VerificationStatus, string> = {
  unverified_agent: "Unverified Agent",
  verified_agent: "Verified Agent",
  fifa_licensed_agent: "FIFA Licensed Agent",
  agency_verified: "Agency Verified",
};

const associationLabels: Record<AssociationStatus, string> = {
  suggested: "Suggested",
  pending_verification: "Pending Verification",
  verified_representation: "Verified Representation",
  expired_representation: "Expired Representation",
  rejected: "Rejected",
  former_client: "Former Client",
  prospect: "Prospect",
};

const tabs: Array<{ key: string; label: string; statuses: AssociationStatus[]; icon: typeof Users }> = [
  { key: "verified", label: "Verified Players", statuses: ["verified_representation"], icon: ShieldCheck },
  { key: "suggested", label: "Suggested Players", statuses: ["suggested"], icon: Sparkles },
  { key: "pending", label: "Pending Verification", statuses: ["pending_verification"], icon: Clock3 },
  { key: "former", label: "Former Clients", statuses: ["former_client", "expired_representation"], icon: FileCheck2 },
  { key: "prospects", label: "Prospects", statuses: ["prospect"], icon: UserCheck },
];

const documentTypes = [
  { value: "representation_agreement", label: "Representation Agreement" },
  { value: "authorization_letter", label: "Authorization Letter" },
  { value: "agency_contract", label: "Agency Contract" },
  { value: "supporting_document", label: "Supporting Document" },
];

function statusTone(status: AssociationStatus) {
  if (status === "verified_representation") return "border-[#a3ff12]/30 bg-[#a3ff12]/10 text-[#caff72]";
  if (status === "pending_verification") return "border-amber-300/30 bg-amber-300/10 text-amber-200";
  if (status === "suggested") return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
  if (status === "expired_representation" || status === "former_client") return "border-slate-300/15 bg-white/[.05] text-slate-300";
  if (status === "prospect") return "border-violet-300/30 bg-violet-300/10 text-violet-100";
  return "border-rose-300/30 bg-rose-300/10 text-rose-200";
}

function verificationTone(status: VerificationStatus) {
  if (status === "agency_verified") return "from-amber-300 to-[#a3ff12]";
  if (status === "fifa_licensed_agent") return "from-[#a3ff12] to-cyan-300";
  if (status === "verified_agent") return "from-cyan-300 to-blue-400";
  return "from-slate-500 to-slate-700";
}

function associationName(association: Association) {
  const playerName = `${association.players?.first_name ?? ""} ${association.players?.last_name ?? ""}`.trim();
  return playerName || association.suggested_name || "Suggested player";
}

function associationMeta(association: Association) {
  return {
    position: association.players?.position || association.suggested_position || "Position open",
    nationality: association.players?.nationality || association.suggested_nationality || "Global",
    club: association.players?.clubs?.name || association.suggested_club || "Club not linked",
    photo: association.players?.photo_url || association.suggested_photo_url || null,
    externalUrl: association.players?.external_market_url || association.external_reference_url || null,
  };
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isExpiring(dateValue?: string | null) {
  if (!dateValue) return false;
  const target = new Date(`${dateValue}T00:00:00Z`).getTime();
  const today = Date.now();
  const ninetyDays = 1000 * 60 * 60 * 24 * 90;
  return target >= today && target - today <= ninetyDays;
}

function isExpired(dateValue?: string | null) {
  if (!dateValue) return false;
  return new Date(`${dateValue}T23:59:59Z`).getTime() < Date.now();
}

export function AgentVerificationCenter() {
  const [verification, setVerification] = useState<Verification>(defaultVerification);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [activeTab, setActiveTab] = useState("verified");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [documentTypeByAssociation, setDocumentTypeByAssociation] = useState<Record<string, string>>({});

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [verificationResponse, associationsResponse] = await Promise.all([
        fetch("/api/agent-verification"),
        fetch("/api/agent-verification/associations"),
      ]);

      const verificationData = (await verificationResponse.json()) as { verification?: Verification; error?: string };
      const associationsData = (await associationsResponse.json()) as { associations?: Association[]; error?: string };

      if (!verificationResponse.ok) throw new Error(verificationData.error || "Could not load verification.");
      if (!associationsResponse.ok) throw new Error(associationsData.error || "Could not load associations.");

      setVerification({ ...defaultVerification, ...(verificationData.verification ?? {}) });
      setAssociations(associationsData.associations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui carregar a verificação.");
    } finally {
      setLoading(false);
    }
  }

  async function saveIdentity() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/agent-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fifaAgentId: verification.fifa_agent_id,
          fifaLicenseNumber: verification.fifa_license_number,
          legalName: verification.legal_name,
          countryCode: verification.country_code,
          agencyName: verification.agency_name,
          verificationStatus: verification.verification_status,
          licenseExpiresOn: verification.license_expires_on,
        }),
      });
      const data = (await response.json()) as { verification?: Verification; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save identity.");
      setVerification({ ...defaultVerification, ...(data.verification ?? {}) });
      setMessage("Agent identity saved. Smart player suggestions can now run safely.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar identidade.");
    } finally {
      setSaving(false);
    }
  }

  async function runSmartScan() {
    setScanning(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/agent-verification/suggestions", { method: "POST" });
      const data = (await response.json()) as { created?: number; message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not run smart scan.");
      setMessage(data.message || `${data.created ?? 0} suggestions created.`);
      await load();
      setActiveTab("suggested");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao procurar sugestões.");
    } finally {
      setScanning(false);
    }
  }

  async function updateAssociation(associationId: string, action: string) {
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/agent-verification/associations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ associationId, action }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update association.");
      setMessage("Player representation status updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar representação.");
    }
  }

  async function uploadIdentityDocument(file?: File | null) {
    if (!file) return;
    setUploading("identity");
    setMessage("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("scope", "identity");
      formData.append("file", file);
      const response = await fetch("/api/agent-verification/documents", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not upload document.");
      setMessage("Official documentation uploaded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setUploading(null);
    }
  }

  async function uploadRepresentationDocument(associationId: string, file?: File | null) {
    if (!file) return;
    setUploading(associationId);
    setMessage("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("scope", "representation");
      formData.append("associationId", associationId);
      formData.append("documentType", documentTypeByAssociation[associationId] || "supporting_document");
      formData.append("file", file);
      const response = await fetch("/api/agent-verification/documents", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not upload document.");
      setMessage("Representation document uploaded and sent to compliance review.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setUploading(null);
    }
  }

  const counts = useMemo(() => {
    return associations.reduce(
      (acc, association) => {
        acc.total += 1;
        acc[association.status] += 1;
        if (association.public_visible) acc.publicVisible += 1;
        return acc;
      },
      {
        total: 0,
        publicVisible: 0,
        suggested: 0,
        pending_verification: 0,
        verified_representation: 0,
        expired_representation: 0,
        rejected: 0,
        former_client: 0,
        prospect: 0,
      } as Record<AssociationStatus | "total" | "publicVisible", number>,
    );
  }, [associations]);

  const filteredAssociations = useMemo(() => {
    const tab = tabs.find((item) => item.key === activeTab) ?? tabs[0];
    const search = query.toLowerCase();
    return associations.filter((association) => {
      const meta = associationMeta(association);
      const text = `${associationName(association)} ${meta.position} ${meta.club} ${meta.nationality}`.toLowerCase();
      return tab.statuses.includes(association.status) && text.includes(search);
    });
  }, [activeTab, associations, query]);

  const complianceAlerts = useMemo(() => {
    const alerts: Array<{ tone: string; title: string; body: string; icon: typeof AlertTriangle }> = [];

    if (!verification.official_document_path) {
      alerts.push({
        tone: "amber",
        title: "Official documentation missing",
        body: "Upload the FIFA license or federation documentation to strengthen trust.",
        icon: FileUp,
      });
    }

    if (verification.license_expires_on && isExpiring(verification.license_expires_on)) {
      alerts.push({
        tone: "amber",
        title: "License renewal approaching",
        body: "Your license expiration date is within the next 90 days.",
        icon: Clock3,
      });
    }

    if (verification.license_expires_on && isExpired(verification.license_expires_on)) {
      alerts.push({
        tone: "rose",
        title: "License appears expired",
        body: "Update license details before making new verified representation claims.",
        icon: ShieldAlert,
      });
    }

    associations
      .filter((association) => association.status === "pending_verification")
      .slice(0, 4)
      .forEach((association) => {
        if (!association.representation_documents?.length) {
          alerts.push({
            tone: "cyan",
            title: `${associationName(association)} needs proof`,
            body: "Pending representation has no agreement, authorization letter or contract attached yet.",
            icon: AlertTriangle,
          });
        }
      });

    associations
      .filter((association) => isExpiring(association.representation_expires_on))
      .slice(0, 4)
      .forEach((association) => {
        alerts.push({
          tone: "amber",
          title: `${associationName(association)} renewal reminder`,
          body: "Representation may need renewal soon.",
          icon: Clock3,
        });
      });

    return alerts.slice(0, 6);
  }, [associations, verification.license_expires_on, verification.official_document_path]);

  const verificationProgress =
    verification.verification_status === "agency_verified"
      ? 100
      : verification.verification_status === "fifa_licensed_agent"
        ? 82
        : verification.verification_status === "verified_agent"
          ? 58
          : 24;

  return (
    <div className="mx-auto max-w-[1760px] animate-in space-y-6">
      <GamePanel className="relative overflow-hidden p-5 sm:p-7 xl:p-9">
        <div className="absolute -right-24 -top-24 size-[460px] rounded-full border border-cyan-300/[.08] bg-cyan-400/[.035] blur-sm" />
        <div className="absolute bottom-0 left-10 h-px w-2/3 bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
        <div className="relative z-10 grid gap-8 xl:grid-cols-[1fr_430px] xl:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <LivePill>Representation control online</LivePill>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                Legal-first player claims
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Trust Layer</p>
            <h1 className="af-mode-title font-display mt-3 text-white">Agent Verification Center</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
              Connect your profile to your official football identity, discover possible player relationships and
              confirm representation only when you have legal rights.
            </p>
            <div className="mt-8 grid max-w-4xl gap-3 sm:grid-cols-3">
              {[
                ["Verified players", counts.verified_representation, ShieldCheck, "lime"],
                ["Pending review", counts.pending_verification, Clock3, "amber"],
                ["Private suggestions", counts.suggested, Sparkles, "cyan"],
              ].map(([label, value, Icon, tone]) => {
                const CardIcon = Icon as typeof ShieldCheck;
                return (
                  <div key={String(label)} className="console-mini-card p-4">
                    <CardIcon
                      size={18}
                      className={cn(
                        tone === "lime" && "text-[#a3ff12]",
                        tone === "amber" && "text-amber-300",
                        tone === "cyan" && "text-cyan-300",
                      )}
                    />
                    <p className="mt-4 text-[8px] font-black uppercase tracking-[.18em] text-slate-500">{String(label)}</p>
                    <p className="font-display mt-1 text-4xl text-white">{String(value)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="stadium-scoreboard p-5">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">Verification level</p>
                <h2 className="mt-2 text-2xl font-black uppercase italic text-white">
                  {verificationLabels[verification.verification_status]}
                </h2>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {verification.fifa_agent_id || "FIFA Agent ID not linked"}
                </p>
              </div>
              <div
                className={cn(
                  "grid size-16 place-items-center rounded-3xl bg-gradient-to-br text-[#06100a] shadow-[0_0_28px_rgba(163,255,18,.14)]",
                  verificationTone(verification.verification_status),
                )}
              >
                <BadgeCheck size={30} />
              </div>
            </div>
            <div className="relative z-10 mt-6">
              <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                <span>Trust score</span>
                <span>{verificationProgress}%</span>
              </div>
              <Meter value={verificationProgress} color={verificationProgress > 80 ? "lime" : "cyan"} />
            </div>
            <div className="relative z-10 mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[.07] p-4">
              <div className="flex gap-3">
                <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-300" />
                <p className="text-xs leading-6 text-amber-50/90">&quot;{LEGAL_WARNING}&quot;</p>
              </div>
            </div>
          </div>
        </div>
      </GamePanel>

      {message && (
        <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-sm font-bold text-[#caff72]">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-200">
          {error}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <GamePanel className="p-5 sm:p-6">
          <SectionHeader kicker="Official identity" title="Agent license profile" />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-[9px] font-black uppercase tracking-[.18em] text-slate-500">FIFA Agent ID</span>
              <Input
                value={verification.fifa_agent_id ?? ""}
                onChange={(event) => setVerification((current) => ({ ...current, fifa_agent_id: event.target.value }))}
                placeholder="Example: FIFA-AGENT-0000"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[9px] font-black uppercase tracking-[.18em] text-slate-500">FIFA License Number</span>
              <Input
                value={verification.fifa_license_number ?? ""}
                onChange={(event) =>
                  setVerification((current) => ({ ...current, fifa_license_number: event.target.value }))
                }
                placeholder="License number"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[9px] font-black uppercase tracking-[.18em] text-slate-500">Full Legal Name</span>
              <Input
                value={verification.legal_name}
                onChange={(event) => setVerification((current) => ({ ...current, legal_name: event.target.value }))}
                placeholder="Legal name"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[9px] font-black uppercase tracking-[.18em] text-slate-500">Agency</span>
              <Input
                value={verification.agency_name ?? ""}
                onChange={(event) => setVerification((current) => ({ ...current, agency_name: event.target.value }))}
                placeholder="Agency name"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[9px] font-black uppercase tracking-[.18em] text-slate-500">Country</span>
              <Input
                value={verification.country_code ?? ""}
                maxLength={2}
                onChange={(event) =>
                  setVerification((current) => ({ ...current, country_code: event.target.value.toUpperCase() }))
                }
                placeholder="MT"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[9px] font-black uppercase tracking-[.18em] text-slate-500">License Expiration Date</span>
              <Input
                type="date"
                value={verification.license_expires_on ?? ""}
                onChange={(event) =>
                  setVerification((current) => ({ ...current, license_expires_on: event.target.value }))
                }
              />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-[9px] font-black uppercase tracking-[.18em] text-slate-500">Verification Status</span>
              <select
                value={verification.verification_status}
                onChange={(event) =>
                  setVerification((current) => ({
                    ...current,
                    verification_status: event.target.value as VerificationStatus,
                  }))
                }
                className="h-12 w-full rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm font-bold uppercase tracking-wider text-white outline-none transition focus:border-cyan-300/45"
              >
                {Object.entries(verificationLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={saveIdentity} disabled={saving || loading}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <IdCard size={14} />}
              Save identity
            </Button>
            <label className="relative inline-flex h-11 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl border border-cyan-200/18 bg-white/[.055] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-slate-100 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-white/[.085]">
              {uploading === "identity" ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              Upload official documentation
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                onChange={(event) => void uploadIdentityDocument(event.currentTarget.files?.[0])}
              />
            </label>
            {verification.official_document_name && (
              <span className="inline-flex items-center gap-2 rounded-xl border border-[#a3ff12]/20 bg-[#a3ff12]/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#caff72]">
                <FileCheck2 size={13} />
                {verification.official_document_name}
              </span>
            )}
          </div>
        </GamePanel>

        <GamePanel className="p-5 sm:p-6">
          <SectionHeader kicker="External integrations" title="Trusted data connectors" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Transfermarkt", "Link preview and click-through profile references.", "Active preview"],
              ["FIFA Agent Registry", "Prepared for official registry connection.", "Future connector"],
              ["National Federations", "License checks by country and federation.", "Future connector"],
              ["Licensed Providers", "Recommended path for professional live market data.", "Ready architecture"],
            ].map(([name, body, status]) => (
              <div key={name} className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Globe2 size={17} className="text-cyan-300" />
                  <span className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[8px] font-black uppercase text-cyan-100">
                    {status}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-black uppercase italic text-white">{name}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/[.07] p-4">
            <div className="flex gap-3">
              <LockKeyhole size={17} className="mt-0.5 shrink-0 text-rose-200" />
              <p className="text-xs leading-6 text-rose-100/90">
                Touchline does not scrape or claim third-party ownership data automatically. External data creates
                suggestions only; the agent must confirm and prove representation.
              </p>
            </div>
          </div>
        </GamePanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_390px]">
        <GamePanel className="p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeader kicker="Agent dashboard" title="My Players" />
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search players..."
                  className="h-11 w-full rounded-2xl border border-white/[.07] bg-black/20 pl-9 pr-4 text-xs text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25 sm:w-[260px]"
                />
              </div>
              <Button onClick={runSmartScan} disabled={scanning || loading} variant="secondary">
                {scanning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Smart scan
              </Button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {tabs.map(({ key, label, statuses, icon: Icon }) => {
              const count = statuses.reduce((total, status) => total + counts[status], 0);
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    "shrink-0 rounded-2xl border px-4 py-3 text-left transition duration-300",
                    activeTab === key
                      ? "border-cyan-300/35 bg-cyan-300/[.09] text-white shadow-[0_0_22px_rgba(34,211,238,.12)]"
                      : "border-white/[.07] bg-white/[.025] text-slate-500 hover:border-white/[.14] hover:text-slate-200",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} />
                    <span className="text-[9px] font-black uppercase tracking-[.14em]">{label}</span>
                    <span className="rounded-lg bg-white/[.07] px-2 py-1 text-[8px] font-black">{count}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="flex min-h-72 items-center justify-center rounded-3xl border border-white/[.07] bg-black/20">
                <Loader2 className="animate-spin text-cyan-300" />
              </div>
            ) : filteredAssociations.length ? (
              filteredAssociations.map((association) => {
                const name = associationName(association);
                const meta = associationMeta(association);
                const documents = association.representation_documents ?? [];
                return (
                  <div
                    key={association.id}
                    className="group overflow-hidden rounded-3xl border border-white/[.075] bg-gradient-to-br from-white/[.055] to-white/[.02] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/20"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                      <div className="relative size-20 shrink-0 overflow-hidden rounded-3xl border border-cyan-300/20 bg-cyan-300/[.07]">
                        {meta.photo ? (
                          <Image src={meta.photo} alt={name} fill sizes="80px" className="object-cover object-top" />
                        ) : (
                          <div className="grid h-full place-items-center text-xl font-black text-cyan-100">{initials(name)}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-xl font-black uppercase italic tracking-[-.05em] text-white">{name}</h3>
                              <span className={cn("rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-wider", statusTone(association.status))}>
                                {associationLabels[association.status]}
                              </span>
                            </div>
                            <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                              {meta.position} · {meta.nationality} · {meta.club}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">Confidence</p>
                            <p className="font-display text-2xl text-cyan-100">{association.confidence_score ?? 0}%</p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-white/[.06] bg-black/20 p-3">
                            <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">Club visibility</p>
                            <p className={cn("mt-1 text-xs font-black uppercase", association.public_visible ? "text-[#a3ff12]" : "text-amber-200")}>
                              {association.public_visible ? "Visible to clubs" : "Private until verified"}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-white/[.06] bg-black/20 p-3">
                            <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">Documents</p>
                            <p className="mt-1 text-xs font-black uppercase text-white">{documents.length} uploaded</p>
                          </div>
                          <div className="rounded-2xl border border-white/[.06] bg-black/20 p-3">
                            <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">AI review</p>
                            <p className="mt-1 text-xs font-black uppercase text-cyan-200">{association.ai_validation_status.replaceAll("_", " ")}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {association.status === "suggested" && (
                            <>
                              <Button onClick={() => void updateAssociation(association.id, "confirm")}>
                                <CheckCircle2 size={14} />
                                Confirm Representation
                              </Button>
                              <Button variant="secondary" onClick={() => void updateAssociation(association.id, "prospect")}>
                                <UserCheck size={14} />
                                Mark Prospect
                              </Button>
                              <Button variant="ghost" onClick={() => void updateAssociation(association.id, "reject")}>
                                <XCircle size={14} />
                                Reject
                              </Button>
                            </>
                          )}
                          {association.status === "pending_verification" && (
                            <>
                              <Button onClick={() => void updateAssociation(association.id, "verify")}>
                                <ShieldCheck size={14} />
                                Mark Verified
                              </Button>
                              <Button variant="secondary" onClick={() => void updateAssociation(association.id, "expire")}>
                                <Clock3 size={14} />
                                Expire
                              </Button>
                            </>
                          )}
                          {association.status === "verified_representation" && (
                            <>
                              <Button variant="secondary" onClick={() => void updateAssociation(association.id, "former")}>
                                <FileCheck2 size={14} />
                                Mark Former
                              </Button>
                              <Button variant="ghost" onClick={() => void updateAssociation(association.id, "expire")}>
                                <Clock3 size={14} />
                                Expire
                              </Button>
                            </>
                          )}
                          {(association.status === "prospect" || association.status === "former_client" || association.status === "expired_representation") && (
                            <Button onClick={() => void updateAssociation(association.id, "confirm")}>
                              <CheckCircle2 size={14} />
                              Move to Pending
                            </Button>
                          )}
                          {meta.externalUrl && (
                            <a
                              href={meta.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-200/18 bg-white/[.045] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-slate-100 transition hover:-translate-y-0.5 hover:border-cyan-300/35"
                            >
                              <ExternalLink size={14} />
                              Open source
                            </a>
                          )}
                        </div>

                        <div className="mt-4 grid gap-3 rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-3 md:grid-cols-[190px_1fr]">
                          <select
                            value={documentTypeByAssociation[association.id] || "supporting_document"}
                            onChange={(event) =>
                              setDocumentTypeByAssociation((current) => ({
                                ...current,
                                [association.id]: event.target.value,
                              }))
                            }
                            className="h-10 rounded-xl border border-white/[.08] bg-[#07111b] px-3 text-[10px] font-bold uppercase tracking-wider text-white outline-none"
                          >
                            {documentTypes.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[.08] bg-white/[.045] px-3 text-[10px] font-black uppercase tracking-wider text-slate-200 transition hover:border-cyan-300/25">
                            {uploading === association.id ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
                            Upload representation document
                            <input
                              type="file"
                              className="sr-only"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                              onChange={(event) => void uploadRepresentationDocument(association.id, event.currentTarget.files?.[0])}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-white/[.07] bg-black/20 text-center">
                <Filter size={28} className="text-slate-700" />
                <p className="mt-4 text-sm font-black uppercase text-white">No players in this category yet</p>
                <p className="mt-2 max-w-md text-xs leading-6 text-slate-500">
                  Save your identity, add players or save player links in Market Radar, then run Smart Scan.
                </p>
              </div>
            )}
          </div>
        </GamePanel>

        <aside className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="AI Compliance Assistant" title="Representation monitor" />
            <div className="mb-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.05] p-4">
              <div className="flex gap-3">
                <Bot size={19} className="mt-0.5 shrink-0 text-cyan-300" />
                <p className="text-xs leading-6 text-slate-300">
                  Monitoring contract expiration, missing documentation, renewal reminders and false-claim risk signals.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {complianceAlerts.length ? (
                complianceAlerts.map(({ title, body, icon: Icon, tone }) => (
                  <div key={`${title}-${body}`} className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                    <div className="flex gap-3">
                      <Icon
                        size={17}
                        className={cn(
                          "mt-0.5 shrink-0",
                          tone === "rose" && "text-rose-300",
                          tone === "amber" && "text-amber-300",
                          tone === "cyan" && "text-cyan-300",
                        )}
                      />
                      <div>
                        <p className="text-[11px] font-black uppercase italic text-white">{title}</p>
                        <p className="mt-1 text-[10px] leading-5 text-slate-500">{body}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] p-4 text-sm font-bold text-[#caff72]">
                  No active compliance alerts.
                </div>
              )}
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Club visibility" title="What clubs can see" />
            <div className="space-y-3 text-sm leading-6 text-slate-400">
              <p>
                Clubs viewing your profile see verified players only. Suggested, pending, prospect and former statuses
                remain private.
              </p>
              <div className="rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] p-4">
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-[#caff72]">Public now</p>
                <p className="font-display mt-1 text-4xl text-white">{counts.publicVisible}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">verified player profiles</p>
              </div>
            </div>
          </GamePanel>
        </aside>
      </section>
    </div>
  );
}
