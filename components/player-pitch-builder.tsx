"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clipboard,
  Copy,
  ExternalLink,
  FileSignature,
  Loader2,
  Mail,
  PlayCircle,
  Send,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, Meter, SectionHeader } from "@/components/game-ui";
import { cn } from "@/lib/utils";

export type PitchPlayer = {
  id: string;
  name: string;
  position?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  club?: string | null;
  marketValue?: number | null;
  currency?: string | null;
  photoUrl?: string | null;
  contractEndDate?: string | null;
  preferredFoot?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  externalUrl?: string | null;
  aiProfile?: {
    generated?: boolean;
    professional_biography?: string;
    scouting_summary?: string;
    strengths?: string[];
    market_recommendation?: string;
    club_recommendations?: string[];
  } | null;
  videoCount: number;
  documentCount: number;
  latestVideoUrl?: string | null;
};

const objectives = [
  "Transfer opportunity",
  "Loan opportunity",
  "Free agent proposal",
  "Trial request",
  "Scouting introduction",
  "Renewal / contract discussion",
];

const tones = ["Premium", "Direct", "Scouting", "Executive"];

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
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function embedUrl(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${parsed.pathname.replace("/", "")}`;
    if (host.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host.endsWith("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

function readiness(player?: PitchPlayer | null) {
  if (!player) return 0;
  return Math.min(
    100,
    (player.position ? 18 : 0) +
      (player.club ? 10 : 0) +
      (player.marketValue ? 12 : 0) +
      (player.contractEndDate ? 12 : 0) +
      (player.externalUrl ? 12 : 0) +
      (player.videoCount ? 13 : 0) +
      (player.aiProfile?.generated ? 13 : 0),
  );
}

function buildPitch({
  player,
  targetClub,
  recipient,
  objective,
  tone,
  notes,
}: {
  player: PitchPlayer;
  targetClub: string;
  recipient: string;
  objective: string;
  tone: string;
  notes: string;
}) {
  const age = calculateAge(player.dateOfBirth);
  const intro = recipient ? `Hi ${recipient},` : "Hi,";
  const clubLine = targetClub ? `for ${targetClub}` : "for your recruitment department";
  const value = formatMoney(player.marketValue, player.currency ?? "EUR");
  const facts = [
    player.position ? `Position: ${player.position}` : null,
    age ? `Age: ${age}` : null,
    player.nationality ? `Nationality: ${player.nationality}` : null,
    player.club ? `Current club: ${player.club}` : null,
    player.contractEndDate ? `Contract until: ${player.contractEndDate}` : null,
    player.marketValue ? `Market value: ${value}` : null,
  ].filter(Boolean);

  const strengths = player.aiProfile?.strengths?.length ? player.aiProfile.strengths.slice(0, 3) : [
    player.position ? `Clear fit for ${player.position} recruitment needs` : "Professional profile ready for review",
    player.videoCount ? "Video material available for scouting review" : "Video material can be attached on request",
    player.externalUrl ? "External football profile link available" : "Additional source links can be added",
  ];

  const summary =
    player.aiProfile?.scouting_summary ||
    `${player.name} is a ${age ? `${age}-year-old ` : ""}${player.position ?? "player"}${player.club ? ` currently connected to ${player.club}` : ""}.`;

  return `${intro}

I would like to introduce ${player.name} ${clubLine} as a potential ${objective.toLowerCase()}.

${summary}

Presentation style: ${tone}.

Key profile:
${facts.map((fact) => `- ${fact}`).join("\n") || "- Full profile available inside Touchline"}

Why this player is relevant:
${strengths.map((item) => `- ${item}`).join("\n")}

${notes ? `Additional context:\n${notes}\n\n` : ""}I can share the full Touchline player profile with videos, documents, market link and negotiation context if there is interest.

Best regards.`;
}

export function PlayerPitchBuilder({
  players,
  initialPlayerId,
  initialTargetClub = "",
  initialObjective,
}: {
  players: PitchPlayer[];
  initialPlayerId?: string | null;
  initialTargetClub?: string;
  initialObjective?: string;
}) {
  const [selectedId, setSelectedId] = useState(players.some((player) => player.id === initialPlayerId) ? (initialPlayerId ?? "") : (players[0]?.id ?? ""));
  const [targetClub, setTargetClub] = useState(initialTargetClub);
  const [recipient, setRecipient] = useState("");
  const [objective, setObjective] = useState(initialObjective || objectives[0]);
  const [tone, setTone] = useState(tones[0]);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedPlayer = players.find((player) => player.id === selectedId) ?? players[0] ?? null;
  const score = readiness(selectedPlayer);
  const videoEmbed = embedUrl(selectedPlayer?.latestVideoUrl);

  const pitchText = useMemo(() => {
    if (!selectedPlayer) return "";
    return buildPitch({ player: selectedPlayer, targetClub, recipient, objective, tone, notes });
  }, [selectedPlayer, targetClub, recipient, objective, tone, notes]);

  const mailto = selectedPlayer
    ? `mailto:?subject=${encodeURIComponent(`${selectedPlayer.name} — ${objective}`)}&body=${encodeURIComponent(pitchText)}`
    : "#";

  async function copyPitch() {
    if (!pitchText) return;
    await navigator.clipboard.writeText(pitchText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function savePitch() {
    if (!selectedPlayer) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/players/pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: selectedPlayer.id,
          targetClub,
          recipient,
          objective,
          tone,
          notes,
          pitchText,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not save pitch.");
      setMessage("Pitch saved to Touchline AI documents.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save pitch.");
    } finally {
      setSaving(false);
    }
  }

  if (!players.length) {
    return (
      <GamePanel className="mx-auto max-w-[1100px] p-8 text-center">
        <Users className="mx-auto text-slate-700" size={34} />
        <h1 className="mt-5 text-3xl font-black uppercase italic text-white">Pitch Player</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
          Add your first player before creating a professional club pitch.
        </p>
        <Link href="/players" className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#a3ff12] px-5 text-xs font-black uppercase text-[#071007]">
          Add player
        </Link>
      </GamePanel>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] min-w-0 animate-in space-y-6">
      <section className="af-mode-screen p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(163,255,18,.22)" } as React.CSSProperties}>
        <div className="relative z-10 grid min-w-0 gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] 2xl:items-end">
          <div className="min-w-0">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]">
                <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" /> Club-ready presentation
              </span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                {players.length} players available
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Pitch Player</p>
            <h1 className="af-mode-title font-display mt-3 max-w-full text-white">Pitch Player</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
              Select a player, choose the club context and generate a professional message/presentation for sporting
              directors, scouts and recruitment teams.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={savePitch} disabled={saving || !selectedPlayer}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />}
                Save Pitch
              </Button>
              <Button variant="secondary" onClick={copyPitch}>
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy Text"}
              </Button>
              <a href={mailto} className="relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-2xl border border-cyan-200/18 bg-white/[.055] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-slate-100 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-white/[.085]">
                <Mail size={14} /> Open email
              </a>
            </div>
          </div>

          <div className="stadium-scoreboard min-w-0 p-5">
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">Pitch readiness</p>
                <p className="font-display mt-2 text-7xl leading-none text-white">{score}</p>
              </div>
              <Target className="text-[#a3ff12]" size={34} />
            </div>
            <div className="relative z-10 mt-5">
              <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                <span>Profile completeness</span>
                <span>{score}%</span>
              </div>
              <Meter value={score} color={score >= 70 ? "lime" : "cyan"} />
            </div>
            <div className="relative z-10 mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/[.045] p-3"><PlayCircle size={15} className="mx-auto text-cyan-300" /><p className="mt-2 text-[8px] text-slate-500">Videos</p><p className="text-sm font-black">{selectedPlayer?.videoCount ?? 0}</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><Clipboard size={15} className="mx-auto text-[#a3ff12]" /><p className="mt-2 text-[8px] text-slate-500">Docs</p><p className="text-sm font-black">{selectedPlayer?.documentCount ?? 0}</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><Sparkles size={15} className="mx-auto text-amber-300" /><p className="mt-2 text-[8px] text-slate-500">AI</p><p className="text-sm font-black">{selectedPlayer?.aiProfile?.generated ? "YES" : "NO"}</p></div>
            </div>
          </div>
        </div>
      </section>

      {message && <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-sm font-bold text-[#caff72]">{message}</div>}
      {error && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</div>}

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        <GamePanel className="p-5">
          <SectionHeader kicker="Pitch setup" title="Choose player & club" />
          <div className="space-y-3">
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="h-12 w-full rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm text-white outline-none focus:border-cyan-300/45">
              {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
            </select>
            <Input value={targetClub} onChange={(event) => setTargetClub(event.target.value)} placeholder="Target club, ex: FC Copenhagen" />
            <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient, ex: Sporting Director" />
            <select value={objective} onChange={(event) => setObjective(event.target.value)} className="h-12 w-full rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm text-white outline-none focus:border-cyan-300/45">
              {objectives.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              {tones.map((item) => (
                <button
                  key={item}
                  onClick={() => setTone(item)}
                  className={cn(
                    "h-10 rounded-xl border px-3 text-[8px] font-black uppercase tracking-[.14em] transition",
                    tone === item ? "border-[#a3ff12]/35 bg-[#a3ff12]/10 text-[#caff72]" : "border-white/[.07] text-slate-600 hover:text-white",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Extra context: salary range, passport, availability, agent notes..."
              className="min-h-32 w-full rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45"
            />
          </div>
        </GamePanel>

        <GamePanel className="overflow-hidden">
          {selectedPlayer && (
            <>
              <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
                <div className="relative min-h-[360px] bg-cyan-300/[.035]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(163,255,18,.22),transparent_34%),linear-gradient(145deg,rgba(14,165,233,.16),rgba(2,6,23,.88))]" />
                  <div className="relative grid h-full min-h-[360px] place-items-center">
                    <div className="grid size-32 place-items-center rounded-[2.5rem] border border-cyan-300/20 bg-black/30 shadow-[0_0_70px_rgba(34,211,238,.18)]">
                      <span className="font-display text-6xl font-black text-cyan-200/70">{initials(selectedPlayer.name)}</span>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <p className="text-[8px] font-black uppercase tracking-[.22em] text-[#a3ff12]">{selectedPlayer.position ?? "Position open"}</p>
                    <h2 className="mt-1 text-3xl font-black uppercase italic tracking-[-.06em] text-white">{selectedPlayer.name}</h2>
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.14em] text-cyan-100">{selectedPlayer.club ?? "Club open"}</span>
                    <span className="rounded-full border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.14em] text-[#b7ff45]">{formatMoney(selectedPlayer.marketValue, selectedPlayer.currency ?? "EUR")}</span>
                    {selectedPlayer.externalUrl && (
                      <a href={selectedPlayer.externalUrl} target="_blank" rel="noreferrer" className="rounded-full border border-amber-300/20 bg-amber-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.14em] text-amber-200">
                        Source <ExternalLink size={10} className="inline" />
                      </a>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      ["Age", calculateAge(selectedPlayer.dateOfBirth) ?? "—"],
                      ["Nationality", selectedPlayer.nationality ?? "—"],
                      ["Foot", selectedPlayer.preferredFoot ?? "—"],
                      ["Height", selectedPlayer.heightCm ? `${selectedPlayer.heightCm} cm` : "—"],
                      ["Weight", selectedPlayer.weightKg ? `${selectedPlayer.weightKg} kg` : "—"],
                      ["Contract", selectedPlayer.contractEndDate ?? "—"],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-2xl border border-white/[.07] bg-black/20 p-3">
                        <p className="text-[7px] font-black uppercase tracking-[.16em] text-slate-600">{label}</p>
                        <p className="mt-1 text-sm font-black text-white">{String(value)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
                    <p className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-200">Scouting summary</p>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      {selectedPlayer.aiProfile?.scouting_summary || `${selectedPlayer.name} is ready for a professional club presentation. Add AI profile data to make this pitch stronger.`}
                    </p>
                  </div>
                </div>
              </div>

              {videoEmbed && (
                <div className="border-t border-white/[.07] p-5">
                  <div className="overflow-hidden rounded-3xl border border-white/[.08] bg-black/30">
                    <iframe src={videoEmbed} title={`${selectedPlayer.name} video`} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  </div>
                </div>
              )}
            </>
          )}
        </GamePanel>

        <GamePanel className="p-5">
          <SectionHeader kicker="Generated pitch" title="Club message" />
          <div className="rounded-3xl border border-white/[.07] bg-black/25 p-4">
            <pre className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{pitchText}</pre>
          </div>
          <div className="mt-4 grid gap-2">
            <Button className="w-full" onClick={copyPitch}>
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy pitch text"}
            </Button>
            <Button className="w-full" variant="secondary" onClick={savePitch} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Save to AI docs
            </Button>
            {selectedPlayer && (
              <Link href={`/players/${selectedPlayer.id}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-200/18 bg-white/[.055] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-slate-100 transition hover:-translate-y-0.5 hover:border-cyan-300/35">
                Open full profile <ArrowUpRight size={13} />
              </Link>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.045] p-4">
            <div className="flex gap-3">
              <Building2 size={16} className="shrink-0 text-amber-300" />
              <p className="text-[10px] leading-5 text-slate-500">
                Next phase: connect this pitch directly to club contacts, shortlists and private deal rooms.
              </p>
            </div>
          </div>
        </GamePanel>
      </div>
    </div>
  );
}
