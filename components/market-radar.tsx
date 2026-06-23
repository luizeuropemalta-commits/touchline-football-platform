"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Filter, Flame, Link2, Loader2, Newspaper, Radar, Save, Search, ShieldCheck, Sparkles, Tags, Zap } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { GamePanel, LivePill, SectionHeader } from "@/components/game-ui";

type LinkPreview = {
  ok?: boolean;
  url?: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
  error?: string;
};

type RadarLink = {
  id: string;
  url: string;
  source_domain?: string | null;
  category: string;
  title?: string | null;
  description?: string | null;
  image_url?: string | null;
  site_name?: string | null;
  transfermarkt_player_id?: string | null;
  tags?: string[];
  note?: string | null;
  last_previewed_at?: string | null;
  created_at?: string | null;
};

const categories = [
  { value: "rumor", label: "Rumor" },
  { value: "player", label: "Player" },
  { value: "club", label: "Club" },
  { value: "news", label: "News" },
  { value: "scout", label: "Scout" },
  { value: "other", label: "Other" },
];

const categoryColors: Record<string, string> = {
  rumor: "border-rose-300/20 bg-rose-300/[.07] text-rose-200",
  player: "border-[#a3ff12]/20 bg-[#a3ff12]/[.07] text-[#caff72]",
  club: "border-cyan-300/20 bg-cyan-300/[.07] text-cyan-100",
  news: "border-amber-300/20 bg-amber-300/[.07] text-amber-100",
  scout: "border-violet-300/20 bg-violet-300/[.07] text-violet-100",
  other: "border-white/[.1] bg-white/[.04] text-slate-300",
};

function safeHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "external link";
  }
}

function categoryLabel(value: string) {
  return categories.find((category) => category.value === value)?.label ?? "Link";
}

export function MarketRadar() {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("rumor");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [links, setLinks] = useState<RadarLink[]>([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const trimmedUrl = url.trim();

  useEffect(() => {
    void loadLinks();
  }, []);

  function updateUrl(value: string) {
    setUrl(value);
    if (!value.trim().startsWith("https://")) {
      setPreview(null);
      setLoadingPreview(false);
    }
  }

  useEffect(() => {
    if (!trimmedUrl.startsWith("https://")) return;

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoadingPreview(true);
      setError("");
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(trimmedUrl)}`);
        const data = (await response.json()) as LinkPreview;
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setPreview({ ok: false, error: err instanceof Error ? err.message : "Preview unavailable." });
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [trimmedUrl]);

  const filteredLinks = useMemo(() => {
    return links.filter((link) => {
      const categoryMatch = filter === "all" || link.category === filter;
      const text = `${link.title ?? ""} ${link.description ?? ""} ${link.source_domain ?? ""} ${link.url}`.toLowerCase();
      return categoryMatch && text.includes(query.toLowerCase());
    });
  }, [links, filter, query]);

  async function loadLinks() {
    setLoadingLinks(true);
    try {
      const response = await fetch("/api/radar/links");
      const data = (await response.json()) as { links?: RadarLink[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load radar links.");
      setLinks(data.links ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui carregar o Radar.");
    } finally {
      setLoadingLinks(false);
    }
  }

  async function saveLink() {
    if (!trimmedUrl.startsWith("https://")) {
      setError("Cola um link HTTPS válido.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/radar/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmedUrl,
          category,
          note,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      const data = (await response.json()) as { ok?: boolean; link?: RadarLink; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "Não consegui salvar esse link.");

      setMessage("Link salvo no Market Radar com preview automático.");
      setUrl("");
      setNote("");
      setTags("");
      setPreview(null);
      await loadLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar link.");
    } finally {
      setSaving(false);
    }
  }

  const previewTitle = preview?.title || "Link preview";
  const previewDescription = preview?.description || "Cole um link público para gerar preview automático.";
  const previewImage = preview?.image;
  const previewDomain = preview?.siteName || (trimmedUrl ? safeHostname(trimmedUrl) : "transfermarkt.com");

  return (
    <div className="space-y-6">
      <GamePanel className="relative overflow-hidden p-5 sm:p-7 xl:p-8">
        <div className="absolute right-[-12%] top-[-50%] size-[460px] rounded-full border border-cyan-300/[.08]" />
        <div className="relative z-10 grid gap-7 xl:grid-cols-[1fr_420px] xl:items-start">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <LivePill>Radar online</LivePill>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.18em] text-cyan-100">
                Link preview · no full copy
              </span>
            </div>
            <p className="af-mode-kicker">Touchline / Market Radar</p>
            <h1 className="af-mode-title font-display mt-3 text-white">Transfermarkt & Rumor Radar</h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300/80">
              Salva links públicos de jogadores, rumores e notícias como cartões de preview. O Touchline guarda apenas
              metadados e leva clique para a fonte original.
            </p>

            <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_170px]">
              <div className="relative">
                <Link2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
                <Input
                  value={url}
                  onChange={(event) => updateUrl(event.target.value)}
                  placeholder="Cola link do Transfermarkt, rumor ou notícia..."
                  className="pl-11"
                />
              </div>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-12 rounded-2xl border border-cyan-100/10 bg-[#07111b]/80 px-4 text-sm font-bold uppercase tracking-wider text-white outline-none transition focus:border-cyan-300/45"
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags opcionais: atleta, clube, rumor..." />
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nota interna opcional" />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => void saveLink()} disabled={saving || loadingPreview}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Salvar no Radar
              </Button>
              <Button variant="secondary" onClick={() => void loadLinks()} disabled={loadingLinks}>
                {loadingLinks ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
                Atualizar lista
              </Button>
            </div>

            {message && <div className="mt-4 rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] px-4 py-3 text-xs font-bold leading-6 text-[#caff72]">{message}</div>}
            {error && <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] px-4 py-3 text-xs leading-6 text-amber-100/80">{error}</div>}
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/[.1] bg-[#0b1521]/80 shadow-[0_22px_80px_rgba(0,0,0,.35)] backdrop-blur-xl">
            <div className="relative overflow-hidden bg-gradient-to-br from-cyan-300/[.12] via-slate-950 to-[#a3ff12]/[.08] p-5">
              <div className="flex items-start gap-4">
                <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/[.12] bg-black/30 shadow-[0_18px_45px_rgba(0,0,0,.35)]">
                  {previewImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewImage} alt={previewTitle} className="h-full w-full object-cover object-top opacity-95" />
                  ) : (
                    <div className="grid h-full place-items-center text-cyan-200/70">
                      {loadingPreview ? <Loader2 size={24} className="animate-spin" /> : <Newspaper size={24} />}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent" />
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="inline-flex rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-[.16em] text-[#caff72]">
                    {loadingPreview ? "Lendo preview" : "Foto pequena"}
                  </div>
                  <p className="mt-3 text-[9px] font-bold uppercase tracking-[.18em] text-slate-500">
                    Estilo perfil Transfermarkt
                  </p>
                  <p className="mt-2 text-[10px] leading-5 text-slate-400">
                    A imagem fica salva como link público, mas aparece no Touchline em miniatura profissional.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.08] px-3 py-1.5 text-[8px] font-black uppercase tracking-[.16em] text-cyan-100">
                  <Link2 size={11} />
                  {previewDomain}
                </span>
                <span className={`rounded-full border px-3 py-1.5 text-[8px] font-black uppercase tracking-[.16em] ${categoryColors[category] ?? categoryColors.other}`}>
                  {categoryLabel(category)}
                </span>
              </div>
              <h2 className="mt-4 line-clamp-2 text-2xl font-black uppercase italic tracking-[-.04em] text-white">{previewTitle}</h2>
              <p className="mt-2 line-clamp-3 text-[10px] font-bold leading-5 text-slate-500">{previewDescription}</p>
              {trimmedUrl && (
                <a href={trimmedUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-[9px] font-black uppercase tracking-wider text-[#caff72] transition hover:bg-[#a3ff12]/15">
                  Abrir fonte <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        </div>
      </GamePanel>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <GamePanel className="p-5 sm:p-6">
          <SectionHeader kicker="Saved intelligence" title="Radar feed" action={<Zap size={16} className="text-[#a3ff12]" />} />
          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search saved links..."
                className="h-10 w-full rounded-xl border border-white/[.07] bg-black/20 pl-9 pr-4 text-[10px] text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/25"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {["all", ...categories.map((item) => item.value)].map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`h-10 shrink-0 rounded-xl border px-3 text-[8px] font-black uppercase tracking-[.12em] transition ${
                    filter === item ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-200" : "border-white/[.07] text-slate-600 hover:text-white"
                  }`}
                >
                  {item === "all" ? "All" : categoryLabel(item)}
                </button>
              ))}
            </div>
          </div>

          {loadingLinks ? (
            <div className="grid min-h-64 place-items-center text-cyan-200/60">
              <Loader2 className="animate-spin" />
            </div>
          ) : filteredLinks.length === 0 ? (
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-6 text-center">
              <Flame className="mx-auto text-slate-700" />
              <p className="mt-3 text-xs font-black uppercase text-white">Nenhum link salvo ainda</p>
              <p className="mt-2 text-[10px] leading-5 text-slate-500">Cola um link do Transfermarkt ou rumor e clica em salvar.</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredLinks.map((link) => (
                <article key={link.id} className="group rounded-3xl border border-white/[.08] bg-white/[.025] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-white/[.04]">
                  <div className="flex gap-4">
                    <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/[.1] bg-cyan-300/[.04] shadow-[0_14px_38px_rgba(0,0,0,.25)]">
                      {link.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={link.image_url} alt={link.title ?? "Radar link"} className="h-full w-full object-cover object-top opacity-95 transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="grid h-full place-items-center text-cyan-300/40">
                          <Newspaper size={22} />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#07111b]/90 to-transparent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[7px] font-black uppercase tracking-[.16em] ${categoryColors[link.category] ?? categoryColors.other}`}>
                          {categoryLabel(link.category)}
                        </span>
                        {link.transfermarkt_player_id && (
                          <span className="rounded-full border border-white/[.08] px-2.5 py-1 text-[7px] font-black uppercase tracking-[.16em] text-slate-500">
                            TM #{link.transfermarkt_player_id}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 flex items-center gap-2 text-[8px] font-black uppercase tracking-[.16em] text-cyan-300">
                        <Link2 size={11} />
                        {link.site_name ?? link.source_domain ?? safeHostname(link.url)}
                      </p>
                      <h3 className="mt-2 line-clamp-2 text-base font-black uppercase italic text-white">{link.title ?? "External link"}</h3>
                      <p className="mt-2 line-clamp-2 text-[9px] leading-5 text-slate-500">{link.description ?? link.url}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-3 text-[8px] font-black uppercase tracking-wider text-[#caff72] transition hover:bg-[#a3ff12]/15">
                        Abrir fonte <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </GamePanel>

        <aside className="space-y-5">
          <GamePanel className="p-5">
            <SectionHeader kicker="Safe mode" title="Legal workflow" action={<ShieldCheck size={15} className="text-[#a3ff12]" />} />
            <div className="space-y-3 text-[9px] font-bold uppercase leading-5 tracking-wider text-slate-500">
              <p className="rounded-xl border border-[#a3ff12]/15 bg-[#a3ff12]/[.045] p-3 text-[#caff72]">Salva link + preview público.</p>
              <p className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">Não copia artigo completo nem banco inteiro.</p>
              <p className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">Usuário clica e vai para a fonte original.</p>
            </div>
          </GamePanel>
          <GamePanel className="p-5">
            <SectionHeader kicker="Categories" title="Radar types" action={<Filter size={15} className="text-cyan-300" />} />
            <div className="space-y-2">
              {categories.map((item) => (
                <button key={item.value} onClick={() => setFilter(item.value)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[8px] font-black uppercase tracking-wider transition ${categoryColors[item.value]}`}>
                  <span>{item.label}</span>
                  <Tags size={11} />
                </button>
              ))}
            </div>
          </GamePanel>
          <GamePanel className="border-amber-300/15 p-5">
            <Sparkles size={15} className="text-amber-300" />
            <p className="mt-3 text-[9px] font-black uppercase">Next upgrade</p>
            <p className="mt-2 text-[8px] leading-4 text-slate-600">
              Depois podemos adicionar fontes RSS/licenciadas para descobrir novos links automaticamente sem raspar site bloqueado.
            </p>
          </GamePanel>
        </aside>
      </div>
    </div>
  );
}
