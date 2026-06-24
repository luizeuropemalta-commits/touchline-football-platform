"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeEuro,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  FileText,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  XCircle,
  Zap,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, Meter, SectionHeader } from "@/components/game-ui";
import { cn } from "@/lib/utils";

export type DealRoomMessage = {
  id: string;
  body: string;
  createdAt: string;
};

export type DealRoomFile = {
  id: string;
  name: string;
  storagePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
};

export type DealRoomDocument = {
  id: string;
  title: string;
  documentType: string;
  status: string;
  createdAt: string;
};

export type DealRoomData = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  playerId?: string | null;
  playerName: string;
  playerPosition?: string | null;
  playerPhotoUrl?: string | null;
  clubName: string;
  clubLeague?: string | null;
  interestStatus?: string | null;
  interestMessage?: string | null;
  dealTitle?: string | null;
  dealStatus?: string | null;
  dealValue?: number | null;
  currency?: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatMoney(value?: number | null, currency = "EUR") {
  if (!value) return "Value open";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function formatBytes(value?: number | null) {
  if (!value) return "—";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function cleanBody(body: string) {
  return body.replace(/^\[(NOTE|SYSTEM)\]\s*/i, "");
}

export function DealRoomWorkspace({
  room,
  messages,
  files,
  documents,
}: {
  room: DealRoomData;
  messages: DealRoomMessage[];
  files: DealRoomFile[];
  documents: DealRoomDocument[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [fileName, setFileName] = useState("");
  const [filePath, setFilePath] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const regularMessages = useMemo(() => messages.filter((item) => !item.body.startsWith("[NOTE]") && !item.body.startsWith("[SYSTEM]")), [messages]);
  const notes = useMemo(() => messages.filter((item) => item.body.startsWith("[NOTE]")), [messages]);
  const timeline = useMemo(() => messages.filter((item) => item.body.startsWith("[SYSTEM]")), [messages]);
  const readiness = Math.min(100, 20 + regularMessages.length * 12 + notes.length * 8 + files.length * 10 + documents.length * 14 + (room.status === "closed" ? 20 : 0));

  async function postAction(payload: Record<string, unknown>, success: string) {
    setBusyAction(String(payload.action ?? "action"));
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/deal-rooms/${room.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not update deal room.");
      setNotice(success);
      setMessage("");
      setNote("");
      setFileName("");
      setFilePath("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update deal room.");
    } finally {
      setBusyAction("");
    }
  }

  async function uploadFile(file?: File | null) {
    if (!file) return;
    setBusyAction("upload_file");
    setNotice("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/deal-rooms/${room.id}/files`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not upload file.");
      setNotice("Document uploaded to private deal room.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload file.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] animate-in space-y-6">
      <Link href="/deals" className="inline-flex items-center gap-2 text-[8px] font-black uppercase tracking-[.14em] text-slate-600 hover:text-cyan-300">
        <ArrowLeft size={12} /> Return to Deal Rooms
      </Link>

      <section className="af-mode-screen p-5 sm:p-7 xl:p-9" style={{ "--mode-aura": "rgba(34,211,238,.28)" } as React.CSSProperties}>
        <div className="relative z-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-[#b7ff45]">
                <span className="pulse-live size-1.5 rounded-full bg-[#a3ff12]" /> Private negotiation room
              </span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                {room.status}
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Club Deal Room</p>
            <h1 className="af-mode-title font-display mt-3 text-white">{room.title}</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
              Private room for club interest, player pitch, files, notes, messages and negotiation status.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {room.playerId && (
                <Link href={`/players/${room.playerId}`} className="continue-career-button inline-flex min-h-[52px] items-center gap-3 px-5 text-[9px] font-black uppercase tracking-[.16em] text-[#071007]">
                  Open Player <UserRound size={15} />
                </Link>
              )}
              <Link href="/players/pitch" className="console-mini-card inline-flex min-h-[52px] items-center gap-3 px-5 text-[9px] font-black uppercase tracking-[.16em] text-cyan-100">
                Create Pitch <Sparkles size={15} />
              </Link>
            </div>
          </div>
          <div className="stadium-scoreboard p-5">
            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.22em] text-cyan-300">Deal readiness</p>
                <p className="font-display mt-2 text-7xl leading-none text-white">{readiness}</p>
              </div>
              <LockKeyhole className="text-[#a3ff12]" size={34} />
            </div>
            <div className="relative z-10 mt-5">
              <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                <span>Room completeness</span>
                <span>{readiness}%</span>
              </div>
              <Meter value={readiness} color={readiness >= 70 ? "lime" : "cyan"} />
            </div>
            <div className="relative z-10 mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/[.045] p-3"><MessageSquare size={15} className="mx-auto text-cyan-300" /><p className="mt-2 text-[8px] text-slate-500">Messages</p><p className="text-sm font-black">{regularMessages.length}</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><FileText size={15} className="mx-auto text-[#a3ff12]" /><p className="mt-2 text-[8px] text-slate-500">Files</p><p className="text-sm font-black">{files.length}</p></div>
              <div className="rounded-xl bg-white/[.045] p-3"><Sparkles size={15} className="mx-auto text-amber-300" /><p className="mt-2 text-[8px] text-slate-500">Pitches</p><p className="text-sm font-black">{documents.length}</p></div>
            </div>
          </div>
        </div>
      </section>

      {notice && <div className="rounded-2xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 py-3 text-sm font-bold text-[#caff72]">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm font-bold text-rose-200">{error}</div>}

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)_420px]">
        <aside className="space-y-5">
          <GamePanel className="overflow-hidden">
            <div className="relative h-72 bg-cyan-300/[.035]">
              {room.playerPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={room.playerPhotoUrl} alt={room.playerName} className="h-full w-full object-cover object-top" />
              ) : (
                <div className="grid h-full place-items-center text-6xl font-black text-cyan-300/25">{initials(room.playerName)}</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-transparent" />
              <div className="absolute bottom-5 left-5 right-5">
                <p className="text-[8px] font-black uppercase tracking-[.22em] text-[#a3ff12]">{room.playerPosition || "Player profile"}</p>
                <h2 className="mt-1 text-3xl font-black uppercase italic tracking-[-.06em] text-white">{room.playerName}</h2>
              </div>
            </div>
            <div className="space-y-3 p-5">
              <div className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                <p className="text-[8px] font-black uppercase tracking-[.16em] text-slate-600">Club</p>
                <p className="mt-1 text-lg font-black uppercase italic text-white">{room.clubName}</p>
                <p className="mt-1 text-[9px] text-slate-500">{room.clubLeague || "League open"}</p>
              </div>
              <div className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                <p className="text-[8px] font-black uppercase tracking-[.16em] text-slate-600">Deal value</p>
                <p className="mt-1 text-lg font-black text-[#a3ff12]">{formatMoney(room.dealValue, room.currency ?? "EUR")}</p>
                <p className="mt-1 text-[9px] text-slate-500">{room.dealStatus || room.interestStatus || "Negotiation status open"}</p>
              </div>
              {room.interestMessage && (
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4">
                  <p className="text-[8px] font-black uppercase tracking-[.16em] text-cyan-300">Original interest</p>
                  <p className="mt-2 text-xs leading-6 text-slate-300">{room.interestMessage}</p>
                </div>
              )}
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Room status" title="Negotiation actions" />
            <div className="grid gap-2">
              <Button className="w-full" onClick={() => void postAction({ action: "mark_proposal_sent" }, "Proposal marked as sent.")} disabled={busyAction === "mark_proposal_sent"}>
                {busyAction === "mark_proposal_sent" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Proposal sent
              </Button>
              {[
                ["active", "Mark negotiation", Zap],
                ["paused", "Pause", ClipboardList],
                ["closed", "Closed won", CheckCircle2],
                ["archived", "Closed lost", XCircle],
              ].map(([status, label, Icon]) => {
                const StatusIcon = Icon as typeof Zap;
                return (
                  <button
                    key={String(status)}
                    onClick={() => void postAction({ action: "update_status", status }, `Room marked as ${String(label).toLowerCase()}.`)}
                    disabled={busyAction === "update_status"}
                    className={cn(
                      "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border px-4 text-[9px] font-black uppercase tracking-[.12em] transition",
                      room.status === status ? "border-[#a3ff12]/35 bg-[#a3ff12]/10 text-[#caff72]" : "border-white/[.07] bg-white/[.035] text-slate-400 hover:text-white",
                    )}
                  >
                    <StatusIcon size={13} /> {String(label)}
                  </button>
                );
              })}
            </div>
          </GamePanel>
        </aside>

        <main className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Messages" title="Private communication" action={<ShieldCheck size={15} className="text-[#a3ff12]" />} />
            <div className="space-y-3">
              {regularMessages.length ? regularMessages.map((item) => (
                <div key={item.id} className="rounded-3xl border border-white/[.07] bg-white/[.025] p-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06] text-cyan-300"><MessageSquare size={14} /></span>
                    <div>
                      <p className="text-xs leading-6 text-slate-300">{item.body}</p>
                      <p className="mt-2 text-[8px] font-bold uppercase tracking-wider text-slate-600">{formatDate(item.createdAt)}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-300/[.035] p-8 text-center">
                  <MessageSquare className="mx-auto text-slate-700" />
                  <p className="mt-4 text-xs font-black uppercase text-white">No messages yet</p>
                  <p className="mt-2 text-[10px] leading-5 text-slate-500">Add the first negotiation update below.</p>
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write negotiation message..." />
              <Button onClick={() => void postAction({ action: "add_message", body: message }, "Message saved.")} disabled={busyAction === "add_message" || !message}>
                {busyAction === "add_message" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Add message
              </Button>
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Timeline" title="Automatic room history" />
            <div className="space-y-3">
              {timeline.length ? timeline.map((item) => (
                <div key={item.id} className="flex gap-3 rounded-2xl border border-white/[.07] bg-black/20 p-4">
                  <span className="mt-1 size-2 rounded-full bg-[#a3ff12] shadow-[0_0_10px_#a3ff12]" />
                  <div>
                    <p className="text-[10px] font-black uppercase text-white">{cleanBody(item.body)}</p>
                    <p className="mt-1 text-[8px] text-slate-600">{formatDate(item.createdAt)}</p>
                  </div>
                </div>
              )) : (
                <p className="rounded-2xl border border-white/[.07] bg-black/20 p-5 text-xs text-slate-500">No system events yet.</p>
              )}
            </div>
          </GamePanel>
        </main>

        <aside className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Notes" title="Internal agent notes" />
            <div className="space-y-3">
              {notes.length ? notes.map((item) => (
                <div key={item.id} className="rounded-2xl border border-amber-300/15 bg-amber-300/[.045] p-4">
                  <p className="text-xs leading-6 text-slate-300">{cleanBody(item.body)}</p>
                  <p className="mt-2 text-[8px] text-slate-600">{formatDate(item.createdAt)}</p>
                </div>
              )) : <p className="rounded-2xl border border-white/[.07] bg-black/20 p-5 text-xs text-slate-500">No internal notes yet.</p>}
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Private note: salary, club mood, next call, risk..." className="min-h-28 w-full rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/45" />
              <Button className="w-full" variant="secondary" onClick={() => void postAction({ action: "add_note", body: note }, "Note saved.")} disabled={busyAction === "add_note" || !note}>
                {busyAction === "add_note" ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />} Add note
              </Button>
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Documents" title="Private room files" />
            <div className="space-y-3">
              {files.length ? files.map((file) => (
                <div key={file.id} className="rounded-2xl border border-white/[.07] bg-black/20 p-4">
                  <div className="flex gap-3">
                    <FileText size={16} className="shrink-0 text-cyan-300" />
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-black uppercase text-white">{file.name}</p>
                      <p className="mt-1 text-[8px] text-slate-600">{formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}</p>
                    </div>
                  </div>
                </div>
              )) : <p className="rounded-2xl border border-white/[.07] bg-black/20 p-5 text-xs text-slate-500">No files uploaded yet.</p>}
              <label className={cn("inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-cyan-200/18 bg-white/[.055] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-slate-100 transition hover:border-cyan-300/35", busyAction === "upload_file" && "pointer-events-none opacity-60")}>
                {busyAction === "upload_file" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload document
                <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.mp4,.webm" onChange={(event) => {
                  void uploadFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }} />
              </label>
              <div className="grid gap-2">
                <Input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="Or add file reference name" />
                <Input value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="Storage path / external authorized path" />
                <Button variant="secondary" className="w-full" onClick={() => void postAction({ action: "add_file_reference", name: fileName, storagePath: filePath }, "File reference saved.")} disabled={busyAction === "add_file_reference" || !fileName || !filePath}>
                  <FileSignature size={14} /> Add file reference
                </Button>
              </div>
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Connected AI docs" title="Pitches & proposals" />
            <div className="space-y-3">
              {documents.length ? documents.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.045] p-4">
                  <div className="flex gap-3">
                    <Sparkles size={16} className="shrink-0 text-[#a3ff12]" />
                    <div>
                      <p className="text-[10px] font-black uppercase text-white">{doc.title}</p>
                      <p className="mt-1 text-[8px] text-slate-600">{doc.documentType.replaceAll("_", " ")} · {doc.status}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-white/[.07] bg-black/20 p-5">
                  <p className="text-xs text-slate-500">No pitch connected yet.</p>
                  <Link href="/players/pitch" className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase text-[#caff72]">
                    Create Pitch <Sparkles size={12} />
                  </Link>
                </div>
              )}
            </div>
          </GamePanel>

          <GamePanel className="p-5">
            <SectionHeader kicker="Finance signal" title="Deal economics" />
            <div className="rounded-2xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.045] p-4">
              <BadgeEuro className="text-[#a3ff12]" size={18} />
              <p className="mt-3 font-display text-3xl text-white">{formatMoney(room.dealValue, room.currency ?? "EUR")}</p>
              <p className="mt-2 text-[9px] leading-5 text-slate-500">Next phase connects closed rooms to contract and invoice generation.</p>
            </div>
          </GamePanel>
        </aside>
      </div>
    </div>
  );
}
