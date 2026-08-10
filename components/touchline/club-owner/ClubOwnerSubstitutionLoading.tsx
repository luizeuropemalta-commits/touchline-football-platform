/**
 * Route-local handoff for the authenticated Quick Substitution route.
 * It replaces the opaque global black loader while the canonical ClubOwner
 * route is resolved. It reads no session, roster, or market data.
 */
export default function ClubOwnerSubstitutionLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="Preparing Quick Substitution"
      data-quick-substitution-route-loading="true"
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        padding: "24px",
        background: "radial-gradient(circle at 50% 18%, rgba(181,255,75,.16), transparent 32%), linear-gradient(145deg, #020806, #04090d 54%, #010303)",
        color: "#f5fff0",
      }}
    >
      <section
        style={{
          width: "min(520px, 100%)",
          display: "grid",
          justifyItems: "center",
          gap: "16px",
          border: "1px solid rgba(181,255,75,.3)",
          borderRadius: "24px",
          background: "rgba(3,14,10,.88)",
          padding: "clamp(32px, 7vw, 58px)",
          textAlign: "center",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.07), 0 28px 90px rgba(0,0,0,.5)",
        }}
      >
        <span style={{ width: 34, height: 34, border: "3px solid rgba(181,255,75,.25)", borderTopColor: "#b5ff4b", borderRadius: "50%", animation: "touchline-quick-sub-loading-spin .8s linear infinite" }} />
        <strong style={{ color: "#caff72", fontSize: 11, letterSpacing: ".14em" }}>SUBSTITUIÇÃO RÁPIDA</strong>
        <h1 style={{ margin: 0, fontSize: "clamp(30px, 6vw, 48px)", lineHeight: 1, letterSpacing: "-.045em" }}>Preparando sua escalação</h1>
        <p style={{ maxWidth: 360, margin: 0, color: "rgba(245,255,240,.72)", lineHeight: 1.6 }}>Confirmando o seu XI e banco antes de abrir a troca.</p>
      </section>
      <style>{`@keyframes touchline-quick-sub-loading-spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { [data-quick-substitution-route-loading] span { animation: none !important; } }`}</style>
    </main>
  );
}
