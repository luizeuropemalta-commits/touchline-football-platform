"use client";

import TouchlineEliteExactCard, { type TouchlineEliteExactPlayer } from "@/components/touchline/cards/TouchlineEliteExactCard";
import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  TOUCHLINE_CARD_STUDIO_LAYOUT_KEY,
  touchlineArenaClubTemplateForTierPreview,
} from "@/lib/touchlineArena/card-rules";

const MASTER_PREVIEW_PLAYER: TouchlineEliteExactPlayer = {
  sportmonksPlayerId: "touchline-master-card-alexander-isak",
  formationPlayerId: "demo-alexander-isak",
  overall: 14,
  shirtNumber: 14,
  role: "Forward",
  position: "ATA",
  flagUrl: null,
  countryCode3: "SWE",
  name: "Alexander Isak",
  clubName: "Newcastle United",
  clubLogoUrl: "/touchlineArena/shared/club-logos/2026-27/newcastle-united.png",
  leagueName: "Premier League",
  leagueLogoUrl: null,
  marketValue: "€75m",
  marketValueSource: "verified-cache",
  cardTier: "emerald-green",
  cardPriceVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  updatedAt: "TouchLine Card Master",
  age: 26,
  height: "1.92m",
  foot: "Right",
  contract: "2028",
  nationality: "Sweden",
  stadiumName: "St James' Park",
  avatarImageUrl: null,
  avatarStatus: "master-preview",
  sourcePhotoUrl: null,
  frameUrl: null,
  cardTemplateUrl: touchlineArenaClubTemplateForTierPreview("Newcastle United", "emerald-green"),
  avatarImageScale: 1,
  avatarObjectPosition: "center top",
  totalRating: 128,
  seasonStats: {
    goals: 12,
    assists: 7,
    defense: 18,
    cleanSheets: 3,
    yellowCards: 2,
    redCards: 0,
  },
};

export default function TouchlineMasterCardPage() {
  return (
    <main
      style={{
        minHeight: "var(--touchline-available-height, 100dvh)",
        background:
          "radial-gradient(circle at 16% 10%, rgba(100,255,125,.13), transparent 30%), radial-gradient(circle at 84% 28%, rgba(64,190,255,.12), transparent 30%), linear-gradient(145deg, #030806, #07140f 52%, #020504)",
        color: "#f8fafc",
        padding: "clamp(22px, 4vw, 58px)",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ width: "min(1120px, 100%)", margin: "0 auto" }}>
        <header style={{ borderBottom: "1px solid rgba(190,242,100,.18)", paddingBottom: 22 }}>
          <div style={{ color: "#bef264", fontSize: 12, fontWeight: 900, letterSpacing: ".16em" }}>
            TOUCHLINE · CONTROLE VISUAL
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: "clamp(32px, 5vw, 58px)", lineHeight: .96, letterSpacing: "-.045em" }}>
            Card Mestre
          </h1>
          <p style={{ maxWidth: 760, margin: "15px 0 0", color: "rgba(241,245,249,.68)", fontSize: 15, lineHeight: 1.65 }}>
            Este é o único card que controla a posição e o tamanho das informações de todos os cards TouchLine.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 430px) minmax(260px, 1fr)",
            alignItems: "start",
            gap: "clamp(28px, 6vw, 76px)",
            marginTop: 34,
          }}
        >
          <div style={{ width: "min(430px, 100%)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginBottom: 14,
                borderRadius: 12,
                border: "1px solid rgba(190,242,100,.42)",
                background: "rgba(77,124,15,.20)",
                boxShadow: "0 0 22px rgba(132,204,22,.10)",
                color: "#d9f99d",
                padding: "10px 12px",
                fontSize: 11,
                fontWeight: 950,
                letterSpacing: ".06em",
                textAlign: "center",
              }}
            >
              MODO EDIÇÃO ATIVO · ARRASTE OS BLOCOS MARCADOS
            </div>
            <TouchlineEliteExactCard
              player={MASTER_PREVIEW_PLAYER}
              avatarImageFit="cover"
              isEditable
              layoutStorageKey={TOUCHLINE_CARD_STUDIO_LAYOUT_KEY}
              persistLayoutToMaster
              startUnlocked
              rankingMode="preview"
              showSocialMetrics
            />
          </div>

          <aside
            style={{
              position: "sticky",
              top: 28,
              borderRadius: 24,
              border: "1px solid rgba(190,242,100,.22)",
              background: "linear-gradient(145deg, rgba(17,30,24,.90), rgba(3,8,6,.94))",
              boxShadow: "0 28px 80px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.05)",
              padding: "clamp(22px, 4vw, 34px)",
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, border: "1px solid rgba(190,242,100,.28)", background: "rgba(132,204,22,.10)", color: "#d9f99d", padding: "7px 11px", fontSize: 11, fontWeight: 900 }}>
              UM PADRÃO · TODOS OS CARDS
            </div>
            <h2 style={{ margin: "20px 0 0", fontSize: 25, letterSpacing: "-.025em" }}>Como ajustar</h2>
            <ol style={{ margin: "16px 0 0", paddingLeft: 20, color: "rgba(241,245,249,.72)", fontSize: 14, lineHeight: 1.72 }}>
              <li>Arraste qualquer informação diretamente sobre o card.</li>
              <li>Use os controles abaixo do card para aumentar ou diminuir cada item.</li>
              <li>Confira nome, número, bandeira, preço, botões sociais e estatísticas.</li>
              <li>Pressione o botão verde para aplicar o desenho atual em todos os cards.</li>
            </ol>

            <div style={{ marginTop: 24, borderRadius: 16, border: "1px solid rgba(251,191,36,.30)", background: "rgba(120,53,15,.16)", padding: 16 }}>
              <div style={{ color: "#fde68a", fontSize: 12, fontWeight: 950 }}>SALVAR COMO PADRÃO</div>
              <p style={{ margin: "7px 0 0", color: "rgba(254,243,199,.72)", fontSize: 13, lineHeight: 1.55 }}>
                Ao salvar, este layout vira o padrão de todos os jogadores. Você pode continuar editando e salvar novamente sempre que quiser atualizar o padrão.
              </p>
            </div>

            <div style={{ marginTop: 18, color: "rgba(226,232,240,.48)", fontSize: 12, lineHeight: 1.55 }}>
              Nenhuma informação real de jogador é alterada aqui. Apenas a organização visual do Card Mestre é salva.
            </div>
          </aside>
        </section>
      </div>

      <style>{`
        [data-card-field] {
          outline: 1px dashed rgba(217, 249, 157, .52);
          outline-offset: 2px;
          border-radius: 5px;
        }
        [data-card-field]:hover {
          outline: 2px solid rgba(190, 242, 100, .95);
          background: rgba(132, 204, 22, .08);
          box-shadow: 0 0 18px rgba(132, 204, 22, .22);
        }
        @media (max-width: 860px) {
          section { grid-template-columns: minmax(0, 430px) !important; justify-content: center; }
          aside { position: static !important; }
        }
      `}</style>
    </main>
  );
}
