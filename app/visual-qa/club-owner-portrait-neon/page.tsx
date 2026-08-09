import { TouchlineSocialProfileHeader } from "@/components/touchline/social/TouchlineSocial";

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
export default function ClubOwnerPortraitNeonVisualQaPage() {
  return (
    <main
      data-club-owner-portrait-neon-fixture="static"
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
        <h1 style={{ margin: "9px 0 0", fontSize: "clamp(31px, 5vw, 56px)", letterSpacing: "-.05em", lineHeight: 1 }}>Club Owner portrait perimeter</h1>
        <p style={{ maxWidth: 720, margin: "15px 0 0", color: "rgba(226,232,240,.72)", fontSize: 15, lineHeight: 1.65 }}>
          Fixed TouchLine-green centre-line trace only. The portrait, identity and detail labels below are static visual fixtures with no account, roster, card or economy source.
        </p>
      </header>

      <section style={{ width: "min(1080px, 100%)", margin: "34px auto 0" }} aria-label="Static Club Owner portrait trace fixture">
        <TouchlineSocialProfileHeader
          kind="Club Owner"
          name="STATIC CLUB OWNER"
          subtitle="TouchLine England · Static local QA"
          avatarUrl={STATIC_OWNER_AVATAR}
          avatarAlt="Static Club Owner portrait fixture"
          accent={TOUCHLINE_LOGO_GREEN}
          backgroundAccent={TOUCHLINE_LOGO_GREEN}
          backgroundSecondary={TOUCHLINE_LOGO_GREEN}
          showCover={false}
          clubOwnerPortraitTrace
          profileDetails={[
            { label: "Fixture", value: "Static only" },
            { label: "Motion", value: "Automatic calm loop" },
          ]}
        />
      </section>

      <aside style={{ width: "min(1080px, 100%)", margin: "24px auto 0", border: "1px solid rgba(163,255,18,.28)", borderRadius: 16, padding: "14px 16px", color: "rgba(236,252,203,.9)", background: "rgba(77,124,15,.12)", fontSize: 13, lineHeight: 1.55 }}>
        The moving line completes a circular pass, rests as a soft residual perimeter, then restarts automatically. It is decorative and pointer-safe; reduced-motion users receive the static green perimeter with no animation. The fixture does not read or persist any product state.
      </aside>
    </main>
  );
}
