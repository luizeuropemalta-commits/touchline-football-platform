"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Check, Copy, DatabaseZap, Loader2, PlusCircle, Save, Search, ShieldCheck, Sparkles } from "lucide-react";
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
  externalProvider?: string | null;
  externalPlayerId?: string | null;
};

export function PlayerApiSearch() {
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("2025");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [players, setPlayers] = useState<ApiFootballPlayer[]>([]);
  const [profileOptions, setProfileOptions] = useState<TouchlinePlayerOption[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<Record<number, string>>({});
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    void loadProfiles();
  }, []);

  async function loadProfiles() {
    setProfilesLoading(true);
    try {
      const response = await fetch("/api/players/link-options");
      const data = (await response.json()) as { players?: TouchlinePlayerOption[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load player profiles");
      setProfileOptions(data.players ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não consegui carregar os perfis Touchline.");
    } finally {
      setProfilesLoading(false);
    }
  }

  async function searchPlayers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length < 2) {
      setError("Escreve pelo menos 2 letras do nome do atleta.");
      return;
    }
    setLoading(true);
    setError("");
    setCopiedId(null);

    try {
      const response = await fetch(`/api/api-football/players/search?q=${encodeURIComponent(query)}&season=${encodeURIComponent(season)}`);
      const data = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(data.error || "Search failed");
      setPlayers(data.players ?? []);
      const defaultTarget = profileOptions[0]?.id ?? "__create__";
      setSelectedTargets(Object.fromEntries((data.players ?? []).filter((player) => player.id).map((player) => [player.id!, defaultTarget])));
      if (!data.players?.length) setError("Nenhum atleta encontrado. Tenta nome completo ou outro ano.");
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

  return (
    <div className="space-y-6">
      <GamePanel className="p-5 sm:p-7">
        <SectionHeader
          kicker="API-Football live search"
          title="Find and link real player IDs"
          action={<Sparkles size={16} className="text-[#a3ff12]" />}
        />
        <p className="max-w-3xl text-sm leading-7 text-slate-400">
          Pesquisa o atleta na API-Football, escolhe o resultado correto e copia o ID. Esse ID é o que liga o perfil do
          Touchline à sincronização diária automática.
        </p>

        <form onSubmit={searchPlayers} className="mt-6 grid gap-3 lg:grid-cols-[1fr_150px_auto]">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex: Marcus Rashford, Cristiano Ronaldo, Mbappe..."
              className="pl-11"
            />
          </div>
          <Input value={season} onChange={(event) => setSeason(event.target.value)} placeholder="Season" />
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Search
          </Button>
        </form>

        {error && (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] px-4 py-3 text-xs leading-6 text-amber-100/80">
            {error}
          </div>
        )}

        {saveMessage && (
          <div className="mt-4 rounded-2xl border border-[#a3ff12]/20 bg-[#a3ff12]/[.07] px-4 py-3 text-xs font-bold leading-6 text-[#caff72]">
            {saveMessage}
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
              Agora não precisas abrir o Supabase para linkar manualmente. O botão
              <span className="mx-1 text-cyan-300">Salvar no perfil</span>
              grava <span className="mx-1 text-cyan-300">external_market_provider = api-football</span>
              e <span className="mx-1 text-cyan-300">external_market_player_id</span>
              direto no perfil real do jogador.
            </p>
          </div>
        </div>
      </GamePanel>
    </div>
  );
}
