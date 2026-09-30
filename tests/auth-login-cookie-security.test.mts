import assert from "node:assert/strict";
import test from "node:test";
import { shouldSecureLoginCookie } from "../lib/server/login-cookie-security.ts";
import { TOUCHLINE_QA_SUPABASE_ORIGIN } from "../lib/touchlineArena/qa-canonical-persona.ts";

const localQa = {
  NODE_ENV: "development",
  TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
  NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: "qa-preview",
  NEXT_PUBLIC_SUPABASE_URL: TOUCHLINE_QA_SUPABASE_ORIGIN,
};
function request(url = "http://localhost:3219/login/submit", host = new URL(url).host) {
  return { url, headers: new Headers({ host }) };
}

test("local HTTP QA login can persist a cookie in Safari", () => {
  assert.equal(shouldSecureLoginCookie(request(), localQa), false);
});

test("published, HTTPS, non-local and non-QA login cookies remain secure", () => {
  for (const url of ["https://localhost:3219/login/submit", "https://touchline.com.br/login/submit", "http://touchline.com.br/login/submit", "http://localhost.evil.example/login/submit", "http://192.168.1.2:3219/login/submit", "http://127.0.0.1:3219/login/submit", "http://user:pass@localhost:3219/login/submit"]) {
    assert.equal(shouldSecureLoginCookie(request(url), localQa), true, url);
  }
  assert.equal(shouldSecureLoginCookie({ url: "not a URL", headers: new Headers({ host: "localhost:3219" }) }, localQa), true);
  for (const overrides of [
    { NODE_ENV: "production" }, { NODE_ENV: "test" }, { NODE_ENV: undefined },
    { VERCEL: "1" }, { VERCEL_ENV: "production" },
    { TOUCHLINE_DEPLOYMENT_MODE: undefined }, { TOUCHLINE_DEPLOYMENT_MODE: "production" },
    { NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE: undefined },
    { NEXT_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: undefined },
  ]) {
    assert.equal(shouldSecureLoginCookie(request(), { ...localQa, ...overrides }), true, JSON.stringify(overrides));
  }
  assert.equal(shouldSecureLoginCookie(request(), {}), true);
  assert.equal(shouldSecureLoginCookie(request(undefined, "evil.example"), localQa), true);
  assert.equal(shouldSecureLoginCookie({ url: request().url, headers: new Headers() }, localQa), true);
});
