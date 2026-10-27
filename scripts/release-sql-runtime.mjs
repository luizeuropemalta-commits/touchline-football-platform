import { isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const runtimeKeys = [
  "TOUCHLINE_FANTASY_PGLITE_MODULE",
  "TOUCHLINE_STUDIO_PGLITE_MODULE",
  "TOUCHLINE_GOLDEN_BOOT_PGLITE_MODULE",
  "TOUCHLINE_COMPANY_PGLITE_MODULE",
];

// Release SQL proofs must execute, not silently skip when a local-only path is absent.
// Browser opt-ins and the caller's environment are preserved unchanged.
export async function releaseSqlEnvironment(source = process.env, {
  resolveRuntime = () => fileURLToPath(import.meta.resolve("@electric-sql/pglite")),
  load = (url) => import(url),
} = {}) {
  const env = { ...source };
  const compatibility = env.TOUCHLINE_AVATAR_QA_COMPATIBILITY;
  if (compatibility !== undefined && compatibility !== "1") {
    throw new Error("Release requires TOUCHLINE_AVATAR_QA_COMPATIBILITY=1");
  }
  let fallback;
  const validated = new Set();
  for (const key of runtimeKeys) {
    const supplied = env[key];
    const path = supplied === undefined || supplied === ""
      ? (fallback ??= resolveRuntime()) : supplied;
    if (!isAbsolute(path)) throw new Error(`Release SQL runtime must be an absolute path: ${key}`);
    env[key] = path;
    const url = pathToFileURL(path);
    if (!validated.has(path)) {
      const runtimeExports = await load(url.href);
      if (typeof runtimeExports.PGlite !== "function") throw new Error(`Release SQL runtime has no PGlite: ${key}`);
      validated.add(path);
    }
    if (key === "TOUCHLINE_FANTASY_PGLITE_MODULE") {
      for (const extension of ["pgcrypto", "pg_trgm"]) {
        const extensionExports = await load(new URL(`./contrib/${extension}.js`, url).href);
        if (!extensionExports[extension]) throw new Error(`Release SQL extension missing: ${extension}`);
      }
    }
  }
  env.TOUCHLINE_AVATAR_QA_COMPATIBILITY = "1";
  return env;
}
