import { TouchlineSocialProfileHeader } from "@/components/touchline/social/TouchlineSocial";
import { resolveTouchlineVisualQaLocale } from "@/lib/touchlineArena/visual-qa-locale";

export const metadata = {
  title: "TouchLine · Club Owner portrait perimeter visual QA",
  robots: { index: false, follow: false },
};

const TOUCHLINE_LOGO_GREEN = "#a3ff12";
const STATIC_OWNER_AVATAR = "/touchlineArena/club-owner/avatars/luiz-lopez-owner-avatar-v1.png";

/**
 * This is deliberately static: it exercises the decorative portrait trace
 * without reading a Club Owner account, commercial, roster or market data.
 */
type VisualQaPageProps = Readonly<{
  searchParams: Promise<Readonly<{ lang?: string }>>;
}>;

export default async function ClubOwnerPortraitNeonVisualQaPage({ searchParams }: VisualQaPageProps) {
  const locale = resolveTouchlineVisualQaLocale((await searchParams).lang);
  const copy = locale === "pt-BR"
    ? {
      title: "Perímetro do retrato do Club Owner",
      description: "Apenas traço pelo centro da borda em verde fixo TouchLine. O retrato, identidade e rótulos abaixo são fixtures visuais estáticos, sem fonte de conta, elenco, card ou economia.",
      kind: "Club Owner",
      subtitle: "TouchLine England · QA local estático",
      avatarAlt: "Fixture estático do retrato Club Owner",
      fixtureLabel: "Fixture",
      fixtureValue: "Somente estático",
      motionLabel: "Movimento",
      motionValue: "Loop calmo automático",
      boundary: "A linha em movimento completa uma volta circular, descansa como perímetro residual suave e reinicia automaticamente. É decorativa e segura para ponteiro; usuários com redução de movimento recebem o perímetro verde estático, sem animação. O fixture não lê nem persiste estado do produto.",
      fixtureAria: "Fixture estático de traço do retrato Club Owner",
    }
    : {
      title: "Club Owner portrait perimeter",
      description: "Fixed TouchLine-green centre-line trace only. The portrait, identity and detail labels below are static visual fixtures with no account, roster, card or economy source.",
      kind: "Club Owner",
      subtitle: "TouchLine England · Static local QA",
      avatarAlt: "Static Club Owner portrait fixture",
      fixtureLabel: "Fixture",
      fixtureValue: "Static only",
      motionLabel: "Motion",
      motionValue: "Automatic calm loop",
      boundary: "The moving line completes a circular pass, rests as a soft residual perimeter, then restarts automatically. It is decorative and pointer-safe; reduced-motion users receive the static green perimeter with no animation. The fixture does not read or persist any product state.",
      fixtureAria: "Static Club Owner portrait trace fixture",
    };

  return (
    <main
      data-club-owner-portrait-neon-fixture="static"
      data-visual-qa-locale={locale}
      lang={locale}
      style={{
        minHeight: "100dvh",
        overflowX: "clip",
        padding: "clamp(18px, 4vw, 56px)",
        color: "#f8fafc",
        background: "radial-gradient(circle at 50% 0%, rgba(163,255,18,.14), transparent 36%), linear-gradient(145deg, #03070d, #07120f 54%, #020406)",
      }}
    >
      <header style={{ width: "min(1080px, 100%)", margin: "0 auto", borderBottom: "1px solid rgba(163,255,18,.28)", paddingBottom: 22 }}>
        <p style={{ margin: 0, color: TOUCHLINE_LOGO_GREEN, fontSize: 12, fontWeight: 900, letterSpacing: ".14em" }}>ADMIN-GATED · STATIC LOCAL VISUAL QA</p>
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>{copy.title}</h1>
        <p style={{ maxWidth: 720, margin: "15px 0 0", color: "rgba(226,232,240,.72)", fontSize: 15, lineHeight: 1.65 }}>
          {copy.description}
        </p>
      </header>

      <section style={{ width: "min(1080px, 100%)", margin: "34px auto 0" }} aria-label={copy.fixtureAria}>
        <TouchlineSocialProfileHeader
          kind={copy.kind}
          name="OWNER"
          subtitle={copy.subtitle}
          avatarUrl={STATIC_OWNER_AVATAR}
          avatarAlt={copy.avatarAlt}
          accent={TOUCHLINE_LOGO_GREEN}
          backgroundAccent={TOUCHLINE_LOGO_GREEN}
          backgroundSecondary={TOUCHLINE_LOGO_GREEN}
          showCover={false}
          clubOwnerPortraitTrace
          profileDetails={[
            { label: copy.fixtureLabel, value: copy.fixtureValue },
            { label: copy.motionLabel, value: copy.motionValue },
          ]}
        />
      </section>

      <aside style={{ width: "min(1080px, 100%)", margin: "24px auto 0", border: "1px solid rgba(163,255,18,.28)", borderRadius: 16, padding: "14px 16px", color: "rgba(236,252,203,.9)", background: "rgba(77,124,15,.12)", fontSize: 13, lineHeight: 1.55 }}>
        {copy.boundary}
      </aside>
    </main>
  );
}
