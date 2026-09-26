const PORTUGUESE_COUNTRY_LABELS: Readonly<Record<string, string>> = {
  brazil: "Brasil", england: "Inglaterra", france: "França", norway: "Noruega",
  spain: "Espanha", portugal: "Portugal", italy: "Itália", germany: "Alemanha",
  netherlands: "Holanda", sweden: "Suécia", denmark: "Dinamarca", croatia: "Croácia",
  argentina: "Argentina", belgium: "Bélgica", ecuador: "Equador", egypt: "Egito",
  cameroon: "Camarões", japan: "Japão", "south korea": "Coreia do Sul",
  "korea republic": "Coreia do Sul", "united states": "Estados Unidos", usa: "Estados Unidos",
  austria: "Áustria", scotland: "Escócia", "republic of ireland": "República da Irlanda",
  "bosnia and herzegovina": "Bósnia e Herzegovina",
};

/** Presentation only: unknown values and authoritative identity stay untouched. */
export function localizedCountryLabel(value: string | null | undefined, locale: string) {
  if (!value || locale !== "pt-BR") return value;
  const key = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return PORTUGUESE_COUNTRY_LABELS[key] ?? value;
}
