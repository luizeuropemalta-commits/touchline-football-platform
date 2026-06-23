"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Check, Copy, DatabaseZap, ExternalLink, ImageIcon, Link2, Loader2, PlusCircle, Save, Search, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, Meter, SectionHeader } from "@/components/game-ui";

type ApiFootballPlayer = {
  id?: number;
  name?: string;
  age?: number;
  nationality?: string;
  photo?: string;
  injured?: boolean;
  team?: { id?: number; name?: string; logo?: string };
  league?: { id?: number; name?: string; country?: string; logo?: string; season?: number };
  position?: string;
  appearances?: number;
  rating?: string;
  goals?: number;
  assists?: number;
};

type SearchResponse = {
  query: string;
  season: string;
  players: ApiFootballPlayer[];
  error?: string;
};

type TouchlinePlayerOption = {
  id: string;
  name: string;
  club?: string | null;
  position?: string | null;
  photoUrl?: string | null;
  externalProvider?: string | null;
  externalPlayerId?: string | null;
  externalUrl?: string | null;
};

type LinkPreview = {
  ok?: boolean;
  url?: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
  error?: string;
};

function titleFromTransfermarktUrl(profileUrl: string, fallback: string) {
  try {
    const url = new URL(profileUrl);
    const slug = url.pathname.split("/").filter(Boolean)[0];
    if (!slug) return fallback || "Transfermarkt player profile";
    return slug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return fallback || "Transfermarkt player profile";
  }
}

function transfermarktIdFromUrl(profileUrl: string) {
  const match = profileUrl.match(/\/spieler\/(\d+)/i);
  return match?.[1] ?? null;
}

export function PlayerApiSearch() {
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState(() => String(new Date().getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [players, setPlayers] = useState<ApiFootballPlayer[]>([]);
  const [profileOptions, setProfileOptions] = useState<TouchlinePlayerOption[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<Record<number, string>>({});
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [transfermarktPlayerName, setTransfermarktPlayerName] = useState("");
  const [transfermarktProfileUrl, setTransfermarktProfileUrl] = useState("");
  const [transfermarktPhotoUrl, setTransfermarktPhotoUrl] = useState("");
  const [transfermarktTarget, setTransfermarktTarget] = useState("__create__");
  const [savingTransfermarkt, setSavingTransfermarkt] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [loadingLinkPreview, setLoadingLinkPreview] = useState(false);
  const [autoPreviewPhotoUrl, setAutoPreviewPhotoUrl] = useState("");

  useEffect(() => {
    void loadProfiles();
  }, []);

  const trimmedQuery = query.trim();
  const transfermarktSearchUrl = trimmedQuery
    ? `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(trimmedQuery)}`
    : "https://www.transfermarkt.com/";
  const transfermarktPreviewTitle = titleFromTransfermarktUrl(transfermarktProfileUrl, transfermarktPlayerName || trimmedQuery);
  const transfermarktPreviewId = transfermarktIdFromUrl(transfermarktProfileUrl);
  const previewTitle = linkPreview?.title || transfermarktPreviewTitle;
  const previewDescription = linkPreview?.description || "Transfermarkt player profile";
  const previewSiteName = linkPreview?.siteName || "transfermarkt.com";

  async function loadProfiles() {
    setProfilesLoading(true);
    try {
      const response = await fetch("/api/players/link-options");
      const data = (await response.json()) as { players?: TouchlinePlayerOption[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load player profiles");
      setProfileOptions(data.players ?? []);
      setTransfermarktTarget((current) => current || "__create__");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui carregar os perfis Touchline.");
    } finally {
      setProfilesLoading(false);
    }
  }

  useEffect(() => {
    const url = transfermarktProfileUrl.trim();
    if (!url || !url.startsWith("https://")) {
      setLinkPreview(null);
      setLoadingLinkPreview(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoadingLinkPreview(true);
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        const data = (await response.json()) as LinkPreview;
        if (cancelled) return;
        setLinkPreview(data);

        if (data.ok && data.image && (!transfermarktPhotoUrl || transfermarktPhotoUrl === autoPreviewPhotoUrl)) {
          setTransfermarktPhotoUrl(data.image);
          setAutoPreviewPhotoUrl(data.image);
        }
      } catch (err) {
        if (!cancelled) {
          setLinkPreview({ ok: false, error: err instanceof Error ? err.message : "Preview unavailable." });
        }
      } finally {
        if (!cancelled) setLoadingLinkPreview(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [transfermarktProfileUrl, transfermarktPhotoUrl, autoPreviewPhotoUrl]);

  function openTransfermarktSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmedQuery.length < 2) {
      setError("Escreve pelo menos 2 letras do nome do atleta.");
      return;
    }
    setError("");
    setSaveMessage("Transfermarkt aberto em nova aba. Escolhe o atleta correto lá e copia o link do perfil se quiser guardar no Touchline.");
    window.open(transfermarktSearchUrl, "_blank", "noopener,noreferrer");
  }

  async function searchPlayers() {
    if (trimmedQuery.length < 2) {
      setError("Escreve pelo menos 2 letras do nome do atleta.");
      return;
    }
    setLoading(true);
    setError("");
    setCopiedId(null);

    try {
      const response = await fetch(`/api/api-football/players/search?q=${encodeURIComponent(trimmedQuery)}&season=${encodeURIComponent(season)}`);
      const data = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(data.error || "Search failed");
      setPlayers(data.players ?? []);
      const defaultTarget = profileOptions[0]?.id ?? "__create__";
      setSelectedTargets(Object.fromEntries((data.players ?? []).filter((player) => player.id).map((player) => [player.id!, defaultTarget])));
      if (!data.players?.length) setError("A API opcional não encontrou esse atleta. Usa o botão principal para abrir a busca grátis no Transfermarkt.");
    } catch (err) {
      setPlayers([]);
      setError(err instanceof Error ? err.message : "Não consegui buscar agora.");
    } finally {
      setLoading(false);
    }
  }

  async function copyId(id?: number) {
    if (!id) return;
    await navigator.clipboard.writeText(String(id));
    setCopiedId(id);
  }

  async function uploadPlayerPhoto(file?: File | null) {
    if (!file) return;
    setUploadingPhoto(true);
    setError("");
    setSaveMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/players/photo-upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { ok?: boolean; photoUrl?: string; error?: string };
      if (!response.ok || !data.ok || !data.photoUrl) throw new Error(data.error || "Não consegui enviar a foto.");
      setAutoPreviewPhotoUrl("");
      setTransfermarktPhotoUrl(data.photoUrl);
      setSaveMessage("Foto enviada. Agora clica em “Salvar no banco” para gravar no perfil do atleta.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar foto.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveDirectToProfile(player: ApiFootballPlayer) {
    if (!player.id) return;
    setSavingId(player.id);
    setSaveMessage("");
    setError("");

    try {
      const target = selectedTargets[player.id] ?? profileOptions[0]?.id ?? "__create__";
      const response = await fetch("/api/players/external-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: target,
          apiFootballPlayer: player,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; created?: boolean; playerId?: string; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Não consegui salvar no perfil.");
      setSaveMessage(data.created ? `Perfil criado e ligado: ${player.name}` : `ID salvo direto no perfil: ${player.name}`);
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar no perfil.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveTransfermarktLink() {
    setSavingTransfermarkt(true);
    setSaveMessage("");
    setError("");

    try {
      const response = await fetch("/api/players/transfermarkt-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: transfermarktTarget,
          playerName: transfermarktPlayerName || trimmedQuery,
          profileUrl: transfermarktProfileUrl,
          photoUrl: transfermarktPhotoUrl,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; created?: boolean; playerId?: string; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Não consegui salvar o link do Transfermarkt.");
      setSaveMessage(data.created ? "Atleta criado no banco real com link do Transfermarkt." : "Link do Transfermarkt salvo no perfil do atleta.");
      setTransfermarktProfileUrl("");
      setTransfermarktPhotoUrl("");
      if (data.created) setTransfermarktPlayerName("");
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar o link do Transfermarkt.");
    } finally {
      setSavingTransfermarkt(false);
    }
  }

  return (
    <div className="space-y-6">
      <GamePanel className="p-5 sm:p-7">
        <SectionHeader
          kicker="Transfermarkt free search"
          title="Open real player profiles fast"
          action={<Sparkles size={16} className="text-[#a3ff12]" />}
        />
        <p className="max-w-3xl text-sm leading-7 text-slate-400">
          Pesquisa pelo nome e abre o Transfermarkt em nova aba. É mais simples, grátis e funcional para encontrar o perfil
          correto do atleta sem depender da API opcional. Não copiamos dados automaticamente; apenas abrimos a página oficial para consulta.
        </p>

        <form onSubmit={openTransfermarktSearch} className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex: full player name..."
              className="pl-11"
            />
          </div>
          <Button type="submit">
            <ExternalLink size={15} />
            Abrir Transfermarkt
          </Button>
        </form>

        <div className="mt-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <Input value={season} onChange={(event) => setSeason(event.target.value)} placeholder="Season" />
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void searchPlayers()}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <DatabaseZap size={15} />}
              API opcional
            </Button>
          </div>
          <p className="mt-2 text-[9px] font-bold uppercase tracking-[.16em] text-slate-600">
            A API opcional fica como opção secundária. O fluxo principal agora abre o Transfermarkt sem custo.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] px-4 py-3 text-xs leading-6 text-amber-100/80">
            {error}
            {trimmedQuery.length >= 2 && (
              <a
                href={transfermarktSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-flex items-center gap-1 font-black text-[#caff72] underline decoration-[#caff72]/30 underline-offset-4"
              >
                Abrir no Transfermarkt <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}

        {saveMessage && (
          <div className="mt-4 rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] px-4 py-3 text-xs font-bold leading-6 text-[#caff72]">
            {saveMessage}
          </div>
        )}

        <div className="mt-6 rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[.07] via-white/[.025] to-[#a3ff12]/[.045] p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                <Link2 size={12} />
                Banco real Touchline
              </div>
              <h3 className="mt-3 text-xl font-black uppercase italic text-white">Salvar link do Transfermarkt no perfil</h3>
              <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-400">
                Cola o link oficial do atleta. O clube verá o botão para abrir o Transfermarkt no navegador. A foto dentro do Touchline
                deve ser uma foto enviada/autorizada pelo agente ou um link HTTPS com permissão de uso.
              </p>
            </div>
            {transfermarktProfileUrl && (
              <a
                href={transfermarktProfileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-wider text-[#caff72] transition hover:bg-[#a3ff12]/15"
              >
                Testar link <ExternalLink size={13} />
              </a>
            )}
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="space-y-3">
              <Input
                value={transfermarktPlayerName}
                onChange={(event) => setTransfermarktPlayerName(event.target.value)}
                placeholder="Nome do atleta para criar perfil"
              />
              <Input
                value={transfermarktProfileUrl}
                onChange={(event) => setTransfermarktProfileUrl(event.target.value)}
                placeholder="Link Transfermarkt. Ex: https://www.transfermarkt.com/neymar/profil/spieler/68290"
              />
            </div>
            <div className="space-y-3">
              <Input
                value={transfermarktPhotoUrl}
                onChange={(event) => {
                  setAutoPreviewPhotoUrl("");
                  setTransfermarktPhotoUrl(event.target.value);
                }}
                placeholder="Foto do preview aparece automática; ou cola/envia foto aqui"
              />
              <label className={`relative flex min-h-12 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl border border-cyan-200/18 bg-white/[.055] px-5 text-xs font-extrabold uppercase tracking-[.09em] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-white/[.085] ${uploadingPhoto ? "pointer-events-none opacity-60" : ""}`}>
                {uploadingPhoto ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {uploadingPhoto ? "Enviando foto" : "Enviar foto do computador"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={uploadingPhoto}
                  onChange={(event) => {
                    void uploadPlayerPhoto(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={transfermarktTarget}
                  onChange={(event) => setTransfermarktTarget(event.target.value)}
                  disabled={profilesLoading || savingTransfermarkt}
                  className="h-11 rounded-2xl border border-white/[.08] bg-[#07111b] px-3 text-[10px] font-bold uppercase tracking-wider text-slate-200 outline-none focus:border-cyan-300/35"
                >
                  <option value="__create__">Criar novo atleta</option>
                  {profileOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} {option.position ? `· ${option.position}` : ""} {option.club ? `· ${option.club}` : ""}
                    </option>
                  ))}
                </select>
                <Button type="button" disabled={savingTransfermarkt} onClick={() => void saveTransfermarktLink()}>
                  {savingTransfermarkt ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Salvar no banco
                </Button>
              </div>
            </div>
          </div>

          {transfermarktProfileUrl && (
            <div className="mt-5 overflow-hidden rounded-3xl border border-white/[.1] bg-[#0b1521]/80 shadow-[0_22px_80px_rgba(0,0,0,.35)] backdrop-blur-xl">
              <div className="grid md:grid-cols-[180px_1fr]">
                <div className="relative min-h-44 overflow-hidden bg-gradient-to-br from-cyan-300/[.12] via-slate-950 to-[#a3ff12]/[.08]">
                  {transfermarktPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={transfermarktPhotoUrl} alt={transfermarktPreviewTitle} className="h-full w-full object-cover object-top" />
                  ) : (
                    <div className="flex h-full min-h-44 flex-col items-center justify-center gap-3 text-center text-cyan-200/70">
                      {loadingLinkPreview ? <Loader2 size={28} className="animate-spin" /> : <ImageIcon size={28} />}
                      <p className="max-w-28 text-[8px] font-black uppercase leading-4 tracking-[.18em]">
                        {loadingLinkPreview ? "Buscando preview" : "Sem imagem pública no preview"}
                      </p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-transparent" />
                  <div className="absolute left-3 top-3 rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-2.5 py-1 text-[7px] font-black uppercase tracking-[.16em] text-[#caff72]">
                    {transfermarktPhotoUrl && transfermarktPhotoUrl === autoPreviewPhotoUrl ? "Preview público" : "Link preview"}
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.16em] text-cyan-100">
                      <Link2 size={11} />
                      {previewSiteName}
                    </span>
                    {loadingLinkPreview && (
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/[.08] bg-white/[.035] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.16em] text-slate-400">
                        <Loader2 size={10} className="animate-spin" />
                        lendo preview
                      </span>
                    )}
                    {transfermarktPreviewId && (
                      <span className="rounded-full border border-white/[.08] bg-white/[.035] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.16em] text-slate-400">
                        Player ID #{transfermarktPreviewId}
                      </span>
                    )}
                  </div>
                  <h4 className="mt-4 text-2xl font-black uppercase italic tracking-[-.04em] text-white">
                    {previewTitle}
                  </h4>
                  <p className="mt-2 text-[10px] font-bold leading-5 text-slate-500">{previewDescription}</p>
                  <p className="mt-2 break-all text-[10px] font-bold leading-5 text-slate-600">{transfermarktProfileUrl}</p>
                  {linkPreview?.ok === false && (
                    <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[.055] px-3 py-2 text-[8px] font-bold uppercase leading-4 tracking-wider text-amber-100/75">
                      O site bloqueou o preview automático agora. Se isso acontecer, envia uma foto do computador.
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <a
                      href={transfermarktProfileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-wider text-[#caff72] transition hover:bg-[#a3ff12]/15"
                    >
                      Abrir Transfermarkt <ExternalLink size={13} />
                    </a>
                    <span className="inline-flex h-10 items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.055] px-4 text-[9px] font-black uppercase tracking-wider text-cyan-100">
                      Preview estilo WhatsApp
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.05] px-4 py-3 text-[9px] font-bold uppercase leading-5 tracking-wider text-amber-100/75">
            Modo seguro: o Touchline salva o link e mostra a foto autorizada. Não copiamos automaticamente a página/foto do Transfermarkt.
          </div>
        </div>
      </GamePanel>

      <GamePanel className="p-5 sm:p-6">
        <SectionHeader
          kicker="Database preview"
          title="Perfis reais salvos no banco"
          action={<DatabaseZap size={16} className="text-cyan-300" />}
        />
        {profileOptions.length === 0 ? (
          <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5 text-xs leading-6 text-slate-500">
            Nenhum atleta real salvo ainda. Cola um link do Transfermarkt acima e clica em “Salvar no banco”.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {profileOptions.map((player) => (
              <div key={player.id} className="group overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.025] transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-white/[.04]">
                <div className="grid grid-cols-[86px_1fr]">
                  <div className="relative min-h-28 overflow-hidden bg-cyan-300/[.04]">
                    {player.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={player.photoUrl} alt={player.name} className="h-full w-full object-cover object-top" />
                    ) : (
                      <div className="grid h-full place-items-center text-cyan-300/40">
                        <ImageIcon size={22} />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/15 bg-cyan-300/[.06] px-2.5 py-1 text-[7px] font-black uppercase tracking-[.16em] text-cyan-100">
                      <Link2 size={10} />
                      Link preview
                    </div>
                    <p className="truncate text-sm font-black uppercase italic text-white">{player.name}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                      {player.position ?? "Position open"} {player.club ? `· ${player.club}` : ""}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {player.externalUrl ? (
                        <a
                          href={player.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase tracking-wider text-[#caff72] transition hover:bg-[#a3ff12]/15"
                        >
                          Transfermarkt <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="inline-flex h-8 items-center rounded-lg border border-white/[.08] px-3 text-[8px] font-black uppercase tracking-wider text-slate-600">
                          Sem link externo
                        </span>
                      )}
                      <span className="inline-flex h-8 items-center rounded-lg border border-cyan-300/15 bg-cyan-300/[.06] px-3 text-[8px] font-black uppercase tracking-wider text-cyan-200">
                        {player.externalProvider ?? "manual"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GamePanel>

      <div className="grid gap-4 xl:grid-cols-2">
        {players.map((player) => (
          <GamePanel key={`${player.id}-${player.team?.id}-${player.league?.id}`} className="overflow-hidden">
            <div className="grid sm:grid-cols-[160px_1fr]">
              <div className="relative min-h-48 overflow-hidden border-b border-white/[.07] bg-cyan-300/[.035] sm:border-b-0 sm:border-r">
                {player.photo ? (
                  <Image src={player.photo} alt={player.name ?? "Player"} fill sizes="180px" className="object-cover object-top" />
                ) : (
                  <div className="grid h-full place-items-center text-4xl font-black text-cyan-300/30">{player.name?.slice(0, 2) ?? "PL"}</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-transparent to-transparent" />
              </div>

              <div className="p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[.2em] text-cyan-300">API-Football ID #{player.id}</p>
                    <h2 className="mt-2 text-2xl font-black uppercase italic text-white">{player.name}</h2>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                      {player.nationality ?? "Unknown"} {player.age ? `· ${player.age} years` : ""} {player.position ? `· ${player.position}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyId(player.id)}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-wider text-[#b8ff4d] transition hover:bg-[#a3ff12]/15"
                  >
                    {copiedId === player.id ? <Check size={14} /> : <Copy size={14} />}
                    {copiedId === player.id ? "Copied" : "Copy ID"}
                  </button>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
                    <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">Club</p>
                    <p className="mt-1 text-sm font-black text-white">{player.team?.name ?? "No club data"}</p>
                  </div>
                  <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
                    <p className="text-[8px] font-black uppercase tracking-wider text-slate-600">League</p>
                    <p className="mt-1 text-sm font-black text-white">{player.league?.name ?? "No league data"}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["APP", player.appearances ?? "—"],
                    ["G", player.goals ?? "—"],
                    ["A", player.assists ?? "—"],
                    ["RAT", player.rating ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/[.06] bg-black/20 p-3">
                      <p className="text-[8px] font-black text-slate-600">{label}</p>
                      <p className="mt-1 text-sm font-black text-cyan-100">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                    <span>Match confidence</span>
                    <span>{player.team?.name ? "92%" : "70%"}</span>
                  </div>
                  <Meter value={player.team?.name ? 92 : 70} color="lime" />
                </div>

                <div className="mt-5 rounded-2xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.045] p-3">
                  <div className="mb-2 flex items-center gap-2 text-[8px] font-black uppercase tracking-[.18em] text-[#b8ff4d]">
                    <DatabaseZap size={13} />
                    Salvar direto no perfil
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select
                      value={selectedTargets[player.id ?? 0] ?? profileOptions[0]?.id ?? "__create__"}
                      onChange={(event) =>
                        player.id && setSelectedTargets((current) => ({ ...current, [player.id!]: event.target.value }))
                      }
                      disabled={profilesLoading || savingId === player.id}
                      className="h-10 rounded-xl border border-white/[.08] bg-[#07111b] px-3 text-[10px] font-bold uppercase tracking-wider text-slate-200 outline-none focus:border-cyan-300/35"
                    >
                      <option value="__create__">Criar novo perfil Touchline</option>
                      {profileOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} {option.position ? `· ${option.position}` : ""} {option.club ? `· ${option.club}` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => saveDirectToProfile(player)}
                      disabled={!player.id || savingId === player.id}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#a3ff12]/30 bg-[#a3ff12] px-4 text-[9px] font-black uppercase tracking-wider text-[#071007] transition hover:bg-[#bcff52] disabled:opacity-50"
                    >
                      {savingId === player.id ? <Loader2 size={14} className="animate-spin" /> : profileOptions.length ? <Save size={14} /> : <PlusCircle size={14} />}
                      {savingId === player.id ? "Saving" : "Salvar no perfil"}
                    </button>
                  </div>
                  <p className="mt-2 text-[8px] leading-4 text-slate-500">
                    {profileOptions.length
                      ? "Escolhe um perfil existente ou cria um novo perfil automaticamente."
                      : "Nenhum perfil real encontrado ainda. O botão cria o perfil e já salva o ID externo."}
                  </p>
                </div>
              </div>
            </div>
          </GamePanel>
        ))}
      </div>

      <GamePanel className="border-cyan-300/15 p-5">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.08] text-cyan-200">
            <ShieldCheck size={17} />
          </span>
          <div>
            <h3 className="text-sm font-black uppercase italic text-white">Como linkar no banco</h3>
            <p className="mt-2 text-xs leading-6 text-slate-500">
              O fluxo principal abre o Transfermarkt para consulta rápida e grátis. Quando a API opcional encontrar o jogador,
              o botão <span className="mx-1 text-cyan-300">Salvar no perfil</span> ainda pode gravar
              <span className="mx-1 text-cyan-300">external_market_provider = api-football</span> e
              <span className="mx-1 text-cyan-300">external_market_player_id</span> direto no perfil.
            </p>
          </div>
        </div>
      </GamePanel>
    </div>
  );
}
