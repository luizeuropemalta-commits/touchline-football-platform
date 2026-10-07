import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/(app)/inbox/page.tsx", import.meta.url), "utf8");
const list = readFileSync(new URL("../components/touchline/TouchlineInboxList.tsx", import.meta.url), "utf8");

test("Inbox frame carries all eight approved locale entries without translating persisted message content", () => {
  for (const [locale, title, unread] of [
    ["en-GB", "ClubOwner Inbox", "Unread"], ["pt-BR", "Inbox do ClubOwner", "Não lida"],
    ["es-ES", "Bandeja de entrada de ClubOwner", "Sin leer"], ["it-IT", "Posta in arrivo di ClubOwner", "Non letto"],
    ["fr-FR", "Boîte de réception ClubOwner", "Non lu"], ["ar-SA", "صندوق وارد ClubOwner", "غير مقروء"],
    ["tr-TR", "ClubOwner Gelen Kutusu", "Okunmadı"], ["de-DE", "ClubOwner-Posteingang", "Ungelesen"],
  ]) {
    assert.match(page, new RegExp(`"${locale}":[\\s\\S]*?title: "${title}"[\\s\\S]*?unread: "${unread}"[\\s\\S]*?loading: "[^"]+"[\\s\\S]*?readFailed: "[^"]+"`));
    assert.match(list, new RegExp(`"${locale}": \\{[^}]*LOW:`));
  }
  assert.match(list, /<h2>\{item\.title\}<\/h2><p>\{item\.body\}<\/p>/);
  assert.match(list, /visibleInboxEnum\(item\.priority, locale, draftLocalesEnabled\).*visibleInboxEnum\(item\.category, locale, draftLocalesEnabled\)/);
  assert.match(list, /visibleInboxEnum\(item\.lifecycleState, locale, draftLocalesEnabled\)/);
});

test("Inbox keeps the existing read endpoint and destination language propagation", () => {
  assert.match(list, /fetch\("\/api\/touchline-central\/inbox\/read"/);
  assert.match(list, /destination\.searchParams\.set\("lang", locale\)/);
  assert.match(list, /window\.location\.assign/);
  assert.match(list, /labels\.loading/);
  assert.match(list, /labels\.readFailed/);
});
