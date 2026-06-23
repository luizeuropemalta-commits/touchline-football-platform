"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  DatabaseZap,
  ExternalLink,
  FileUp,
  Link2,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Video,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, Meter, SectionHeader } from "@/components/game-ui";
import { cn } from "@/lib/utils";

export type RealPlayer = {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  position?: string | null;
  preferredFoot?: string | null;
  status?: string | null;
  marketValue?: number | null;
  currency?: string | null;
  photoUrl?: string | null;
  contractEndDate?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  club?: string | null;
  externalProvider?: string | null;
  externalPlayerId?: string | null;
  externalUrl?: string | null;
  aiProfile?: {
    generated?: boolean;
    professional_biography?: string;
    scouting_summary?: string;
    strengths?: string[];
    weaknesses?: string[];
    market_recommendation?: string;
    club_recommendations?: string[];
  } | null;
};

const emptyForm = {
  name: "",
  position: "",
  dateOfBirth: "",
  nationality: "",
  currentClub: "",
  contractEndDate: "",
  preferredFoot: "",
  heightCm: "",
  weightKg: "",
  marketValue: "",
  currency: "EUR",
  transfermarktUrl: "",
  photoUrl: "",
};

const documentFolders = [
  ["passport", "Passport"],
  ["fifa_documents", "FIFA Documents"],
  ["contracts", "Contracts"],
  ["medical_reports", "Medical Reports"],
  ["work_permits", "Work Permits"],
  ["residence_documents", "Residence Documents"],
  ["agency_agreements", "Agency Agreements"],
  ["performance_reports", "Performance Reports"],
  ["other", "Other"],
];

function formatMoney(value?: number | null, currency = "EUR") {
  if (!value) return "Value open";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function calculateAge(date?: string | null) {
  if (!date) return null;
  const birth = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const month = today.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function embedUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${parsed.pathname.replace("/", "")}`;
    if (host.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (host.endsWith("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : url;
    }
    return url;
  } catch {
    return url;
  }
}

export function PlayerManagement({ initialPlayers }: { initialPlayers: RealPlayer[] }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState(initialPlayers[0]?.id ?? "");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [savingVideo, setSavingVideo] = useState(false);
  const [documentCategory, setDocumentCategory] = useState("passport");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState("");

  const activePlayer = players.find((player) => player.id === selectedPlayerId) ?? players[0] ?? null;

  const filtered = useMemo(() => {
    return players.filter((player) => {
      const text = `${player.name} ${player.club ?? ""} ${player.position ?? ""} ${player.nationality ?? ""}`.toLowerCase();
      const matchesSearch = text.includes(query.toLowerCase());
      const matchesFilter =
        filter === "ALL" ||
        (filter === "LINKED" && Boolean(player.externalUrl)) ||
        (filter === "EXPIRING" && Boolean(player.contractEndDate)) ||
        (filter === "AI_READY" && Boolean(player.aiProfile?.generated));
      return matchesSearch && matchesFilter;
    });
  }, [filter, players, query]);

  const totalValue = players.reduce((sum, player) => sum + (Number(player.marketValue) || 0), 0);
  const linkedCount = players.filter((player) => player.externalUrl).length;
  const aiReady = players.filter((player) => player.aiProfile?.generated).length;

  async function reloadPlayers() {
    const response = await fetch("/api/players");
    const data = (await response.json()) as { players?: RealPlayer[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not reload players.");
    setPlayers(data.players ?? []);
    if (!selectedPlayerId && data.players?.[0]) setSelectedPlayerId(data.players[0].id);
  }

  async function createPlayer() {
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const required = ["name", "position", "dateOfBirth", "nationality", "currentClub", "contractEndDate", "preferredFoot", "heightCm", "weightKg", "marketValue"] as const;
      const missing = required.filter((key) => !form[key]);
      if (missing.length) throw new Error(`Complete required fields: ${missing.join(", ")}`);

      const response = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as { ok?: boolean; playerId?: string; error?: string; photoUrl?: string | null };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not create player.");
      setMessage(data.photoUrl ? "Player created with automatic photo/link preview." : "Player created. Add/upload a photo when ready.");
      setForm(emptyForm);
      await reloadPlayers();
      if (data.playerId) setSelectedPlayerId(data.playerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create player.");
    } finally {
      setCreating(false);
    }
  }

  async function saveVideo() {
    if (!activePlayer) return;
    setSavingVideo(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/players/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: activePlayer.id, title: videoTitle, url: videoUrl }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not save video.");
      setPreviewVideoUrl(videoUrl);
      setVideoTitle("");
      setVideoUrl("");
      setMessage("Video saved to the player profile.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save video.");
    } finally {
      setSavingVideo(false);
    }
  }

  async function uploadDocument(file?: File | null) {
    if (!activePlayer || !file) return;
    setUploadingDocument(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("playerId", activePlayer.id);
      formData.append("category", documentCategory);
      formData.append("file", file);
      const response = await fetch("/api/players/documents", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not upload document.");
      setMessage("Document uploaded to the secure player vault.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload document.");
    } finally {
      setUploadingDocument(false);
    }
  }

  async function generateAiProfile(playerId: string) {
    setGeneratingId(playerId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/players/ai-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not generate AI profile.");
      setMessage("AI player profile generated and saved.");
      await reloadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate AI profile.");
    } finally {
      setGeneratingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1760px] animate-in space-y-6">
      <section className="af-mode-screen p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(34,211,238,.30)" } as React.CSSProperties}>
        <div className="relative z-10 grid gap-8 xl:grid-cols-[1fr_420px] xl:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]">
                <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" />
                {players.length} real player profiles
              </span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                Portfolio value {formatMoney(totalValue)}
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Player Management</p>
            <h1 className="af-mode-title font-display mt-3 text-white">Player Management</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300/80">
              Add real players, import Transfermarkt link previews, store documents, embed videos and generate professional AI player profiles.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={createPlayer} disabled={creating}>
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add Player
              </Button>
              <Link href="/players/api-search" className="relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-2xl border border-cyan-200/18 bg-white/[.055] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-slate-100 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-white/[.085]">
                <DatabaseZap size={14} />
                External Search
              </Link>
            </div>
          </div>

          <div className="stadium-scoreboard p-5">
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">Portfolio readiness</p>
                <p className="font-display mt-2 text-7xl leading-none text-white">{players.length ? Math.min(99, 40 + linkedCount * 15 + aiReady * 10) : 0}</p>
              </div>
              <ShieldCheck className="text-[#a3ff12]" size={34} />
            </div>
            <div className="relative z-10 mt-5">
              <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                <span>Data completeness</span>
                <span>{players.length ? Math.min(100, Math.round(((linkedCount + aiReady) / Math.max(players.length * 2, 1)) * 100)) : 0}%</span>
              </div>
              <Meter value={players.length ? Math.min(100, Math.round(((linkedCount + aiReady) / Math.max(players.length * 2, 1)) * 100)) : 0} color="lime" />
            </div>
            <div className="relative z-10 mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/[.045] p-3"><Users size={15} className="mx-auto text-cyan-300" /><p className="mt-2 text-[8px] text-slate-500">Players</p><p className="text-sm font-black">{players.length}</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><Link2 size={15} className="mx-auto text-[#a3ff12]" /><p className="mt-2 text-[8px] text-slate-500">Linked</p><p className="text-sm font-black">{linkedCount}</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><BrainCircuit size={15} className="mx-auto text-amber-300" /><p className="mt-2 text-[8px] text-slate-500">AI</p><p className="text-sm font-black">{aiReady}</p></div>
            </div>
          </div>
        </div>
      </section>

      {message && <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-sm font-bold text-[#caff72]">{message}</div>}
      {error && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</div>}

      <GamePanel className="p-5 sm:p-6">
        <SectionHeader kicker="Add player" title="Professional player record" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name *" />
          <Input value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="Position *" />
          <Input type="date" value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} placeholder="Date of Birth *" />
          <Input value={form.nationality} maxLength={2} onChange={(event) => setForm({ ...form, nationality: event.target.value.toUpperCase() })} placeholder="Nationality, ex: BR *" />
          <Input value={form.currentClub} onChange={(event) => setForm({ ...form, currentClub: event.target.value })} placeholder="Current Club *" />
          <Input type="date" value={form.contractEndDate} onChange={(event) => setForm({ ...form, contractEndDate: event.target.value })} placeholder="Contract End Date *" />
          <select value={form.preferredFoot} onChange={(event) => setForm({ ...form, preferredFoot: event.target.value })} className="h-12 rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm text-white outline-none focus:border-cyan-300/45">
            <option value="">Preferred Foot *</option>
            <option value="right">Right</option>
            <option value="left">Left</option>
            <option value="both">Both</option>
          </select>
          <Input value={form.heightCm} onChange={(event) => setForm({ ...form, heightCm: event.target.value })} placeholder="Height cm *" />
          <Input value={form.weightKg} onChange={(event) => setForm({ ...form, weightKg: event.target.value })} placeholder="Weight kg *" />
          <Input value={form.marketValue} onChange={(event) => setForm({ ...form, marketValue: event.target.value })} placeholder="Market Value *" />
          <Input value={form.transfermarktUrl} onChange={(event) => setForm({ ...form, transfermarktUrl: event.target.value })} placeholder="Transfermarkt URL for auto photo/import" className="xl:col-span-3" />
          <Input value={form.photoUrl} onChange={(event) => setForm({ ...form, photoUrl: event.target.value })} placeholder="Photo URL optional" className="xl:col-span-2" />
        </div>
        <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4 text-xs leading-6 text-slate-400">
          Transfermarkt import uses public preview metadata. If the source blocks the preview image, upload or paste an authorized photo URL.
        </div>
      </GamePanel>

      <div className="af-strip flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search real players, club or position..." className="h-10 w-full rounded-lg border border-white/[.07] bg-black/20 pl-9 pr-4 text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {["ALL", "LINKED", "EXPIRING", "AI_READY"].map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={cn("h-9 shrink-0 rounded-lg px-3 text-[8px] font-black tracking-[.12em] transition", filter === item ? "border border-cyan-300/30 bg-cyan-300/10 text-cyan-200" : "border border-white/[.07] text-slate-600 hover:text-white")}>
              {item.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_430px]">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-600"><span className="text-slate-200">{filtered.length}</span> real player profiles found</p>
            <button className="flex items-center gap-2 text-[8px] font-black uppercase tracking-wider text-slate-600">Sort by <span className="text-cyan-300">Updated</span><ChevronDown size={11} /></button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((player) => {
              const age = calculateAge(player.dateOfBirth);
              return (
                <GamePanel key={player.id} className="glass-hover overflow-hidden">
                  <div className="relative h-64 bg-cyan-300/[.035]">
                    {player.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover object-top" />
                    ) : (
                      <div className="grid h-full place-items-center text-5xl font-black text-cyan-300/25">{initials(player.name)}</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-[#07111b]/20 to-transparent" />
                    <div className="absolute left-4 top-4 flex gap-2">
                      {player.externalUrl && <span className="rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 py-1 text-[8px] font-black uppercase text-[#caff72]">Linked</span>}
                      {player.aiProfile?.generated && <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[8px] font-black uppercase text-amber-200">AI Ready</span>}
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/players/${player.id}`} className="truncate text-xl font-black uppercase italic tracking-[-.05em] text-white hover:text-cyan-200">
                          {player.name}
                        </Link>
                        <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          {player.position ?? "Position open"} · {player.club ?? "Club open"} {age ? `· ${age}` : ""}
                        </p>
                      </div>
                      <button onClick={() => setSelectedPlayerId(player.id)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] text-cyan-200">
                        <Crosshair size={15} />
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-white/[.045] p-3"><p className="text-[8px] text-slate-500">VALUE</p><p className="mt-1 text-xs font-black text-[#a3ff12]">{formatMoney(player.marketValue, player.currency ?? "EUR")}</p></div>
                      <div className="rounded-xl bg-white/[.045] p-3"><p className="text-[8px] text-slate-500">FOOT</p><p className="mt-1 text-xs font-black text-cyan-300">{player.preferredFoot ?? "—"}</p></div>
                      <div className="rounded-xl bg-white/[.045] p-3"><p className="text-[8px] text-slate-500">CONTRACT</p><p className="mt-1 text-xs font-black text-amber-300">{player.contractEndDate ?? "—"}</p></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => void generateAiProfile(player.id)} disabled={generatingId === player.id}>
                        {generatingId === player.id ? <Loader2 size={13} className="animate-spin" /> : <BrainCircuit size={13} />}
                        AI Profile
                      </Button>
                      {player.externalUrl && (
                        <a href={player.externalUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-wider text-[#caff72]">
                          Transfermarkt <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                </GamePanel>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="glass mt-4 flex min-h-72 flex-col items-center justify-center rounded-2xl text-center">
              <Crosshair size={28} className="text-slate-700" />
              <p className="mt-4 text-xs font-black uppercase">No real players detected</p>
              <p className="mt-1 text-[9px] text-slate-600">Add your first player using the form above.</p>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Secure vault" title={activePlayer ? activePlayer.name : "Select player"} />
            {!activePlayer ? (
              <p className="text-sm text-slate-500">Create a player first to activate video and document vault.</p>
            ) : (
              <div className="space-y-4">
                <select value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)} className="h-11 w-full rounded-2xl border border-white/[.08] bg-[#07111b] px-3 text-[10px] font-bold uppercase tracking-wider text-slate-200 outline-none">
                  {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                </select>

                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
                  <div className="mb-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-[.18em] text-cyan-200"><Video size={14} /> Video Integration</div>
                  <Input value={videoTitle} onChange={(event) => setVideoTitle(event.target.value)} placeholder="Video title" />
                  <Input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="YouTube, Vimeo, Hudl, Wyscout, Veo URL" className="mt-2" />
                  <Button className="mt-3 w-full" onClick={saveVideo} disabled={savingVideo}>
                    {savingVideo ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Save video
                  </Button>
                  {previewVideoUrl && (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-white/[.08] bg-black/30">
                      <iframe src={embedUrl(previewVideoUrl)} title="Player video preview" className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.045] p-4">
                  <div className="mb-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-[.18em] text-amber-200"><FileUp size={14} /> Player Documents</div>
                  <select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value)} className="h-11 w-full rounded-2xl border border-white/[.08] bg-[#07111b] px-3 text-[10px] font-bold uppercase tracking-wider text-slate-200 outline-none">
                    {documentFolders.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <label className={cn("mt-3 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-cyan-200/18 bg-white/[.055] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-slate-100 transition hover:border-cyan-300/35", uploadingDocument && "pointer-events-none opacity-60")}>
                    {uploadingDocument ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Upload secure document
                    <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.mp4,.webm" onChange={(event) => {
                      void uploadDocument(event.currentTarget.files?.[0]);
                      event.currentTarget.value = "";
                    }} />
                  </label>
                </div>

                <div className="rounded-2xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.045] p-4">
                  <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[.18em] text-[#caff72]"><Sparkles size={14} /> AI Player Profile</div>
                  {activePlayer.aiProfile?.generated ? (
                    <div className="space-y-3 text-xs leading-6 text-slate-300">
                      <p>{activePlayer.aiProfile.professional_biography}</p>
                      <p className="text-slate-500">{activePlayer.aiProfile.market_recommendation}</p>
                    </div>
                  ) : (
                    <p className="text-xs leading-6 text-slate-500">Generate biography, scouting summary, strengths, weaknesses, market and club recommendations.</p>
                  )}
                </div>
              </div>
            )}
          </GamePanel>
        </aside>
      </div>
    </div>
  );
}
