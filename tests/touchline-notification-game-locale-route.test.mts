import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Storage vocabulary is owner-approved, independently of public catalogue gates.
const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
const stamp = "2026-10-02T17:00:00.123456+00:00";
const owner = "11111111-1111-4111-8111-111111111111";
const source = readFileSync(new URL("../app/api/notifications/preferences/route.ts", import.meta.url), "utf8")
  .replace(/^import[\s\S]*?;\s*$/gm, "").replace(/^export /gm, "");
type Options = { anonymous?: boolean; access?: boolean; unavailable?: boolean; origin?: string | null;
  crossSite?: boolean; expectedAccount?: string | null; data?: unknown; error?: unknown; throws?: boolean; badJson?: boolean };

async function invoke(payload: unknown, options: Options = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const projections: string[] = [];
  const forbidden: string[] = [];
  const user = options.anonymous ? null : { id: owner };
  const db = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table: string) { forbidden.push(`table:${table}`); throw new Error("UNEXPECTED_TABLE_ACCESS"); },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      // Zero rows is an ordinary CAS conflict; bigint must cross JSON as text.
      const query = { select(columns: string) { projections.push(columns.replace(/\s/g, '')); return query; }, maybeSingle: async () => {
        if (options.throws) throw new Error("PRIVATE_DATABASE_DETAILS");
        const input = payload as {locale?:unknown;expectedRevision?:string};
        return { data: Object.hasOwn(options, "data") ? options.data : { game_locale: input?.locale,
          game_locale_revision: String(BigInt(input?.expectedRevision ?? '0') + 1n), updated_at: stamp },
          error: options.error ?? null };
      } };
      return query;
    },
  };
  const route = runInNewContext(ts.transpileModule(`${source}\n({PUT})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    createClient: async () => options.unavailable ? null : db,
    hasTouchLineArenaAccess: () => options.access !== false,
    URL,
    NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) },
    parseNotificationQuietHours: () => { forbidden.push("quiet-hours"); throw new Error("UNEXPECTED_CONSENT_NORMALIZATION"); },
    hasTouchlineServerPushConfiguration: () => { forbidden.push("vapid"); throw new Error("UNEXPECTED_VAPID_READ"); },
    resolveTouchlinePushPreference: () => { forbidden.push("push-preference"); throw new Error("UNEXPECTED_PUSH_MUTATION"); },
    parseTouchlineDeviceRegistration: () => { forbidden.push("device"); throw new Error("UNEXPECTED_DEVICE_REGISTRATION"); },
  });
  const headers = new Headers();
  const origin = Object.hasOwn(options,"origin") ? options.origin : "https://synthetic.test";
  if (origin !== null && origin !== undefined) headers.set("origin",origin);
  if (options.crossSite) headers.set("sec-fetch-site","cross-site");
  const expectedAccount = Object.hasOwn(options, 'expectedAccount') ? options.expectedAccount : owner;
  if (expectedAccount !== null && expectedAccount !== undefined) headers.set('X-Touchline-Expected-Account', expectedAccount);
  const response = await route.PUT({ url: "https://synthetic.test/api/notifications/preferences", headers,
    json: async () => { if(options.badJson) throw new Error("bad JSON"); return payload; } });
  assert.deepEqual(forbidden,[],"locale save must not read/write preferences, devices, consent, or VAPID outside the field-only RPC");
  return { response, calls, projections };
}

test("game locale action stores each exact approved code through only the owner-derived RPC", async () => {
  for (const locale of locales) {
    const {response,calls,projections} = await invoke({action:"set_game_locale",locale,expectedRevision:"0"});
    assert.equal(response.status,200,locale);
    assert.equal(JSON.stringify(response.body),JSON.stringify({ok:true,data:{gameLocale:locale,gameLocaleRevision:"1",updatedAt:stamp}}));
    assert.equal(calls.length,1);
    assert.equal(calls[0].name,"touchline_set_game_locale");
    assert.equal(JSON.stringify(calls[0].args),JSON.stringify({p_locale:locale,p_expected_revision:"0"}),"no supplied owner or consent field reaches SQL");
    assert.deepEqual(projections,["game_locale,game_locale_revision::text,updated_at"]);
  }
});

test("game locale action rejects malformed, non-exact, extra and inherited payload fields without RPC", async () => {
  const inheritedLocale = Object.assign(Object.create({locale:"pt-BR"}),{action:"set_game_locale",expectedRevision:"0"});
  const inheritedAction = Object.assign(Object.create({action:"set_game_locale"}),{locale:"pt-BR",expectedRevision:"0"});
  const inheritedExtra = Object.assign(Object.create({explicitConsent:true}),{action:"set_game_locale",locale:"pt-BR",expectedRevision:"0"});
  const inheritedRevision = Object.assign(Object.create({expectedRevision:"0"}),{action:"set_game_locale",locale:"pt-BR"});
  const invalid = [null,[],"pt-BR",
    ...[undefined,null,1,true,"en","pt-br","EN-GB"," en-GB","en-GB ","es","xx-XX",{},[]].map(locale=>({action:"set_game_locale",locale,expectedRevision:"0"})),
    {action:"set_game_locale",locale:"pt-BR",expectedRevision:"0",user_id:"other-owner"},
    {action:"set_game_locale",locale:"pt-BR",expectedRevision:"0",explicitConsent:true},
    {action:"set_game_locale",locale:"pt-BR",expectedRevision:"0",settings:{}},
    {action:"set_game_locale",locale:"pt-BR",expectedRevision:"0",channels:{push:true}},
    {action:"set_game_locale",locale:"pt-BR",expectedRevision:"0",silentPush:true},
    JSON.parse('{"action":"set_game_locale","locale":"pt-BR","expectedRevision":"0","__proto__":{"explicitConsent":true}}'),
    {action:"set_game_locale",locale:"pt-BR"},
    ...[undefined,null,0,1,9007199254740992,true,"", "-1", "+1", "00", "01", "1.0", "1e3", " 0", "0 ", "9223372036854775807", "9223372036854775808", {}, []]
      .map(expectedRevision=>({action:"set_game_locale",locale:"pt-BR",expectedRevision})),
    inheritedLocale,inheritedAction,inheritedExtra,inheritedRevision];
  for (const payload of invalid) {
    const {response,calls} = await invoke(payload);
    assert.equal(response.status,400,JSON.stringify(payload));assert.equal(calls.length,0);
  }
  const malformed = await invoke({action:"set_game_locale",locale:"en-GB",expectedRevision:"0"},{badJson:true});
  assert.equal(malformed.response.status,400);assert.equal(malformed.calls.length,0);
});

test("game locale action requires authenticated eligible owner and same origin", async () => {
  for (const [options,status] of [
    [{anonymous:true},401],[{access:false},401],[{unavailable:true},401],
    [{origin:null},403],[{origin:"https://other.test"},403],[{crossSite:true},403],
  ] as Array<[Options,number]>) {
    const {response,calls} = await invoke({action:"set_game_locale",locale:"en-GB",expectedRevision:"0"},options);
    assert.equal(response.status,status);assert.equal(calls.length,0);
  }
});

test("game locale action fails closed on unconfirmed, mismatched or malformed RPC receipt", async () => {
  const cases: Options[] = [
    {error:{message:"PRIVATE_DATABASE_DETAILS"}}, {throws:true},
    ...[undefined,[],true,"pt-BR",{},[{game_locale:"pt-BR",game_locale_revision:"1",updated_at:stamp}],
      {game_locale:"en-GB",game_locale_revision:"1",updated_at:stamp},{game_locale:"pt-BR",game_locale_revision:"1"},
      {game_locale:"pt-BR",game_locale_revision:"1",updated_at:null},{game_locale:"pt-BR",game_locale_revision:"1",updated_at:42},
      {game_locale:"pt-BR",game_locale_revision:"1",updated_at:"not-a-timestamp"},
      Object.create({game_locale:"pt-BR",game_locale_revision:"1",updated_at:stamp}),
      ...[undefined,null,1,"0","2","01","-1","9223372036854775808"].map(game_locale_revision=>({game_locale:"pt-BR",game_locale_revision,updated_at:stamp})),
      Object.assign(Object.create({game_locale_revision:"1"}),{game_locale:"pt-BR",updated_at:stamp}),
    ].map(data=>({data})),
  ];
  for (const options of cases) {
    const {response,calls} = await invoke({action:"set_game_locale",locale:"pt-BR",expectedRevision:"0"},options);
    assert.equal(response.status,503);assert.equal(response.body.ok,false);assert.equal(calls.length,1);
    assert.doesNotMatch(JSON.stringify(response.body),/PRIVATE_DATABASE_DETAILS/);
  }
});

test("game locale action reports a zero-row revision conflict separately from database failure", async () => {
  const {response,calls} = await invoke({action:"set_game_locale",locale:"pt-BR",expectedRevision:"7"},{data:null});
  assert.equal(response.status,409);assert.equal(response.body.ok,false);assert.equal(calls.length,1);
  const failed = await invoke({action:"set_game_locale",locale:"pt-BR",expectedRevision:"7"},{data:null,error:{message:"PRIVATE_DATABASE_DETAILS"}});
  assert.equal(failed.response.status,503);assert.equal(failed.response.body.ok,false);
  assert.doesNotMatch(JSON.stringify(failed.response.body),/PRIVATE_DATABASE_DETAILS/);
});

test("game locale action preserves exact bigint revisions above 2^53 and permits the last increment", async () => {
  for (const [expectedRevision,next] of [["9007199254740993","9007199254740994"],["9223372036854775806","9223372036854775807"]]) {
    const payload={action:"set_game_locale",locale:"pt-BR",expectedRevision};
    const {response,calls}=await invoke(payload);
    assert.equal(response.status,200);
    assert.equal(response.body.data.gameLocaleRevision,next);
    assert.equal(calls[0].args.p_expected_revision,expectedRevision);
    for (const game_locale_revision of [expectedRevision,Number(next),String(BigInt(next)+1n)]) {
      const bad=await invoke(payload,{data:{game_locale:"pt-BR",game_locale_revision,updated_at:stamp}});
      assert.equal(bad.response.status,503);assert.equal(bad.response.body.ok,false);
    }
  }
});

test('stale account identity cannot write another account even with a matching revision', async () => {
  for (const [expectedAccount, status] of [[null,400],['invalid',400],['22222222-2222-4222-8222-222222222222',409]] as const) {
    const result = await invoke({action:'set_game_locale',locale:'pt-BR',expectedRevision:'0'}, {expectedAccount});
    assert.equal(result.response.status,status); assert.equal(result.calls.length,0);
  }
});
