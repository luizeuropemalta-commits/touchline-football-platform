import https from "node:https";

// Read-only diagnostic. Supply the existing QA env with Node --env-file;
// credentials never enter output, arguments, artifacts or a browser DTO.
const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
if (base !== "https://xgxbwqxjssxxuihuwmgy.supabase.co") throw new Error("EXACT_QA_PROJECT_REQUIRED");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error("QA_SERVICE_ROLE_UNAVAILABLE");
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const urlFor = (table, columns, idColumn, ids) => {
  const url = new URL(`${base}/rest/v1/${table}`);
  url.searchParams.set("select", columns);
  if (ids) url.searchParams.set(idColumn, `in.(${ids.join(",")})`);
  if (table === "touchline_card_publications") { url.searchParams.set("publication_status", "eq.published"); url.searchParams.set("limit", "751"); }
  if (table === "football_squad_members") url.searchParams.set("status", "eq.active");
  if (table === "football_player_season_statistics") url.searchParams.set("scoring_version", "eq.player_scoring_v3");
  return url;
};
const publication = await fetch(urlFor("touchline_card_publications", "player_id"), { headers, signal: AbortSignal.timeout(15000) });
if (!publication.ok) throw new Error(`QA_PUBLICATION_READ_FAILED:${publication.status}`);
const ids = [...new Set((await publication.json()).map(row => row.player_id))];
const probes = [];
for (const size of [ids.length, Math.min(150, ids.length)]) {
  for (const [table, columns, idColumn] of [
    ["football_players", "id,provider_player_id,display_name,name,current_club_id,nationality,country_id,position,provider_position,detailed_position", "id"],
    ["football_squad_members", "player_id,club_id,jersey_number,position,status,source_updated_at", "player_id"],
    ["football_player_season_statistics", "football_player_id,summary_payload,position_statistics_payload,source_synced_at", "football_player_id"],
  ]) {
    const url = urlFor(table, columns, idColumn, ids.slice(0, size));
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      probes.push({ table, ids: size, urlLength: url.href.length, status: response.status, rows: Array.isArray(body) ? body.length : null });
    } catch (error) {
      probes.push({ table, ids: size, urlLength: url.href.length, errorName: error.name, causeCode: error.cause?.code ?? null, causeName: error.cause?.name ?? null });
    }
  }
}
const wideUrl = urlFor("football_players", "id", "id", ids);
const wide = await new Promise((resolve, reject) => {
  const request = https.get(wideUrl, { headers, maxHeaderSize: 65536, timeout: 15000 }, response => {
    let body = "";
    response.on("data", chunk => { body += chunk; });
    response.on("end", () => resolve({ diagnosticOnly: true, maxHeaderSize: 65536, status: response.statusCode,
      rows: JSON.parse(body).length, contentLocationCharacters: String(response.headers["content-location"] ?? "").length }));
  });
  request.on("timeout", () => request.destroy(new Error("DIAGNOSTIC_TIMEOUT")));
  request.on("error", reject);
});
console.log(JSON.stringify({ fetchedAt: new Date().toISOString(), projectId: "xgxbwqxjssxxuihuwmgy", readOnly: true,
  publishedPlayerIds: ids.length, probes, wideHeaderDiagnostic: wide,
  fixPolicy: "Chunk <=150 via existing canonical publication/card readers; do not raise the application header limit.",
}, null, 2));
