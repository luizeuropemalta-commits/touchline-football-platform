// Presentation only: never feed translated labels into eligibility or scoring.
const PORTUGUESE_POSITIONS: Readonly<Record<string, string>> = {
  attacker: "Atacante", forward: "Atacante", striker: "Centroavante", defender: "Defensor",
  goalkeeper: "Goleiro", midfielder: "Meio-campista", winger: "Ponta", player: "Jogador",
  st: "Centroavante", cf: "Atacante", lw: "Ponta esquerda", rw: "Ponta direita",
  df: "Defensor", mf: "Meio-campista", fw: "Atacante",
  am: "Meia ofensivo", cam: "Meia ofensivo", cm: "Meio-campista", dm: "Volante", cdm: "Volante",
  cb: "Zagueiro", lb: "Lateral esquerdo", rb: "Lateral direito", gk: "Goleiro",
  lm: "Meia pela esquerda", rm: "Meia pela direita", lwb: "Ala esquerdo", rwb: "Ala direito",
  "attacking midfield": "Meia ofensivo", "attacking midfielder": "Meia ofensivo",
  "central midfield": "Meio-campista", "central midfielder": "Meio-campista",
  "defensive midfield": "Volante", "defensive midfielder": "Volante",
  "left midfield": "Meia pela esquerda", "left midfielder": "Meia pela esquerda",
  "right midfield": "Meia pela direita", "right midfielder": "Meia pela direita",
  "left wing": "Ponta esquerda", "left winger": "Ponta esquerda",
  "right wing": "Ponta direita", "right winger": "Ponta direita",
  "left back": "Lateral esquerdo", "right back": "Lateral direito",
  "left wing back": "Ala esquerdo", "right wing back": "Ala direito",
  "centre back": "Zagueiro", "center back": "Zagueiro",
  "centre forward": "Centroavante", "center forward": "Centroavante",
  "second striker": "Segundo atacante", "goal keeper": "Goleiro",
};

export function localizedPositionLabel(value: string | null | undefined, locale: string) {
  if (!value || locale !== "pt-BR") return value;
  const key = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return PORTUGUESE_POSITIONS[key] ?? value;
}
