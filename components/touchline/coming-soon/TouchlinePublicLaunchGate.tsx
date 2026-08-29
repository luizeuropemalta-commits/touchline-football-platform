import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

import TouchlineClubPerimeterTrace from "@/components/touchline/TouchlineClubPerimeterTrace";
import {
  touchlineLaunchGateReturnTo,
  type TouchlinePublicLaunchGateMode,
} from "@/lib/touchlineArena/public-launch-gate";
import {
  touchLineAuthEntryHref,
} from "@/lib/touchlineArena/auth-i18n";
import type { TouchLinePresentationLocale } from "@/lib/touchlineArena/root-locale";

import styles from "./TouchlinePublicLaunchGate.module.css";

type LaunchCopy = Readonly<{
  aria: string;
  badge: string;
  eyebrow: string;
  title: string;
  lead: string;
  body: string;
  register: string;
  login: string;
  account: string;
  security: string;
}>;

const copyByLocale: Record<TouchLinePresentationLocale, LaunchCopy> = {
  "pt-BR": {
    aria: "Lançamento da TouchLine Arena",
    badge: "LANÇAMENTO EM BREVE",
    eyebrow: "TOUCHLINE · ACESSO FUNDADOR",
    title: "A ARENA ESTÁ QUASE PRONTA",
    lead: "Seu lugar já pode ser garantido.",
    body: "Crie sua conta agora e seja um dos primeiros a entrar em campo quando a TouchLine abrir oficialmente.",
    register: "Criar minha conta",
    login: "Já tenho uma conta",
    account: "Cadastro disponível agora",
    security: "Acesso seguro TouchLine",
  },
  "en-GB": {
    aria: "TouchLine Arena launch",
    badge: "LAUNCHING SOON",
    eyebrow: "TOUCHLINE · FOUNDER ACCESS",
    title: "THE ARENA IS ALMOST READY",
    lead: "Your place can already be secured.",
    body: "Create your account now and be among the first to step onto the pitch when TouchLine officially opens.",
    register: "Create my account",
    login: "I already have an account",
    account: "Registration is open",
    security: "Secure TouchLine access",
  },
};

export function TouchlinePublicLaunchGate({
  locale,
  mode,
}: {
  locale: TouchLinePresentationLocale;
  mode: Exclude<TouchlinePublicLaunchGateMode, "off">;
}) {
  const copy = copyByLocale[locale];
  const returnTo = touchlineLaunchGateReturnTo(locale, mode);
  const loginHref = touchLineAuthEntryHref("/login", locale, returnTo);
  const registerHref = touchLineAuthEntryHref("/register", locale, returnTo);

  return (
    <main className={styles.root} aria-label={copy.aria} data-testid="touchline-public-launch-gate">
      <Image
        className={styles.poster}
        src="/touchlineArena/arena/touchline-arena-poster-20260722.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
      />
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />

      <section className={styles.panel} aria-labelledby="touchline-launch-title">
        <TouchlineClubPerimeterTrace accent="#a3ff12" className={styles.trace} />

        <div className={styles.brand}>
          <span className={styles.logoShell}>
            <Image
              src="/touchlineArena/brand/tl-shield-lime.png"
              alt="TouchLine"
              width={112}
              height={112}
              priority
            />
          </span>
          <span className={styles.badge}><Sparkles aria-hidden="true" size={15} />{copy.badge}</span>
        </div>

        <div className={styles.message}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id="touchline-launch-title">{copy.title}</h1>
          <p className={styles.lead}>{copy.lead}</p>
          <p className={styles.body}>{copy.body}</p>
        </div>

        <div className={styles.actions} aria-label={locale === "pt-BR" ? "Acesso à conta" : "Account access"}>
          <Link className={styles.primaryAction} href={registerHref}>
            {copy.register}<ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link className={styles.secondaryAction} href={loginHref}>
            {copy.login}
          </Link>
        </div>

        <div className={styles.trust}>
          <span><ShieldCheck aria-hidden="true" size={16} />{copy.security}</span>
          <span>{copy.account}</span>
        </div>
      </section>
    </main>
  );
}
