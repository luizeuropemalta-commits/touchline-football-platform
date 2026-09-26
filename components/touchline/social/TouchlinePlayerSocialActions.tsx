"use client";

import { Heart, UserPlus } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { type PlayerSocialKind, type PlayerSocialSummary } from "@/lib/touchlineArena/player-social-contract";
import { normalizePlayerSocialSubject, requestPlayerSocial } from "@/lib/touchlineArena/player-social-client";
import { playerSocialInvalidation } from "@/lib/touchlineArena/player-social-invalidation";
import shared from "./TouchlineSocial.module.css";
import styles from "./TouchlinePlayerSocialActions.module.css";

type Props = { providerId: string; playerName: string; locale: string; accent?: string; purchaseHref?: string; purchaseLabel?: string };

export default function TouchlinePlayerSocialActions(props: Props) {
  const id = normalizePlayerSocialSubject(props.providerId);
  return id ? <PlayerSocialActions key={id} {...props} providerId={id} /> : props.purchaseHref
    ? <div className={shared.profileActions}><a href={props.purchaseHref}>{props.purchaseLabel ?? (props.locale === "pt-BR" ? "Contratar jogador" : "Contract player")}</a></div>
    : null;
}

function PlayerSocialActions({ providerId, playerName, locale, accent = "#b9ff56", purchaseHref, purchaseLabel }: Props) {
  const pt = locale === "pt-BR";
  const [summary, setSummary] = useState<PlayerSocialSummary | null>(null);
  const [canReact, setCanReact] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "error" | "signed-out">("loading");
  const [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const mutationBusy = useRef(false);
  const invalidationPending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    const refresh = () => {
      if (mutationBusy.current) { invalidationPending.current = true; return; }
      setSummary(null); setCanReact(false); setPhase("loading");
      setRevision((value) => value + 1);
    };
    const unsubscribe = playerSocialInvalidation.subscribe(providerId, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, [providerId]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let disposed = false;
    void requestPlayerSocial(providerId, { signal: controller.signal }).then((result) => {
      if (disposed) return;
      setSummary(result.summary); setCanReact(result.canReact);
      setPhase(result.canReact ? "ready" : "signed-out");
    }).catch((error) => {
      if (!disposed) {
        setSummary(null); setCanReact(false);
        setPhase(error instanceof Error && error.message === "AUTHENTICATION_REQUIRED" ? "signed-out" : "error");
      }
    }).finally(() => clearTimeout(timeout));
    return () => { disposed = true; mounted.current = false; clearTimeout(timeout); pending.current?.abort(); };
  }, [providerId, revision]);

  async function mutate(kind: PlayerSocialKind) {
    if (!summary || !canReact || phase !== "ready" || mutationBusy.current) return;
    mutationBusy.current = true;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setPhase("saving");
    try {
      const result = await requestPlayerSocial(providerId, { signal: controller.signal,
        mutation: { kind, active: !(kind === "follow" ? summary.following : summary.liked) } });
      if (controller.signal.aborted) return;
      setSummary(result.summary); setCanReact(result.canReact);
      setPhase(result.canReact ? "ready" : "signed-out");
      playerSocialInvalidation.publish(providerId);
    } catch (error) {
      // A timeout may have committed. Retry is a fresh GET, never a blind toggle.
      if (!mounted.current) return;
      setSummary(null); setCanReact(false);
      setPhase(error instanceof Error && error.message === "AUTHENTICATION_REQUIRED" ? "signed-out" : "error");
    } finally {
      clearTimeout(timeout); mutationBusy.current = false;
      // A second instance may have committed while this response was in flight.
      // Our own success also invalidates, so every acknowledged write reconciles.
      if (invalidationPending.current && mounted.current) {
        invalidationPending.current = false;
        setSummary(null); setCanReact(false); setPhase("loading");
        setRevision((value) => value + 1);
      }
    }
  }

  const count = (value?: number) => value === undefined ? "—" : new Intl.NumberFormat(pt ? "pt-BR" : "en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const disabled = phase !== "ready" || !canReact;
  return (
    <section className={styles.toolbar} aria-label={pt ? `Interações com ${playerName}` : `Interactions with ${playerName}`} style={{ "--social-accent": accent } as CSSProperties} onClick={(event) => event.stopPropagation()}>
      <div className={`${shared.profileActions} ${styles.actions}`} aria-busy={phase === "loading" || phase === "saving"}>
        <button type="button" disabled={disabled} aria-pressed={summary?.following ?? false} onClick={() => void mutate("follow")}>
          <UserPlus aria-hidden="true" size={18} />
          <span>{summary?.following ? (pt ? "Seguindo" : "Following") : (pt ? "Seguir" : "Follow")}</span>
          <strong title={summary ? String(summary.followerCount) : undefined}>{count(summary?.followerCount)}</strong>
        </button>
        <button type="button" disabled={disabled} aria-pressed={summary?.liked ?? false} onClick={() => void mutate("like")}>
          <Heart aria-hidden="true" size={18} fill={summary?.liked ? "currentColor" : "none"} />
          <span>{summary?.liked ? (pt ? "Curtiu" : "Liked") : (pt ? "Curtir" : "Like")}</span>
          <strong title={summary ? String(summary.likeCount) : undefined}>{count(summary?.likeCount)}</strong>
        </button>
      </div>
      <p className={styles.status} role="status">
        {phase === "loading" ? (pt ? "Carregando interações…" : "Loading interactions…") : phase === "saving" ? (pt ? "Salvando…" : "Saving…") : phase === "error" ? (pt ? "Interações indisponíveis. Nenhuma confirmação recebida." : "Interactions unavailable. No confirmation received.") : phase === "signed-out" ? (pt ? "Entre em uma conta com acesso à Arena para interagir." : "Sign in with Arena access to interact.") : (pt ? "Interações salvas na sua conta." : "Interactions saved to your account.")}
      </p>
      {phase === "error" ? <button type="button" className={styles.retry} onClick={() => { setPhase("loading"); setRevision((value) => value + 1); }}>{pt ? "Consultar novamente" : "Check again"}</button> : null}
      {phase === "signed-out" ? <a className={styles.retry} href={`/login?lang=${encodeURIComponent(locale)}`}>{pt ? "Entrar na Arena" : "Sign in to Arena"}</a> : null}
      {purchaseHref ? <div className={shared.profileActions}><a href={purchaseHref}>{purchaseLabel ?? (pt ? "Contratar jogador" : "Contract player")}</a></div> : null}
    </section>
  );
}
