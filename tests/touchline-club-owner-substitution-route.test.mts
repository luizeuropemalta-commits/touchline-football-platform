import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/club-owner/[owner]/substitution/page.tsx", import.meta.url),
  "utf8",
);

test("the dynamic substitution route resolves the requested ClubOwner identity before rendering", () => {
  assert.match(source, /const \{ owner \} = await params;/);
  assert.match(source, /const supabase = await createClient\(\);/);
  assert.match(source, /const clubOwnerUser = user && !isOwnerEmail\(user\.email\) \? user : null;/);
  assert.match(source, /resolveTouchlineClubOwnerPageIdentity\(clubOwnerUser, owner\)/);
  assert.match(source, /if \(!resolveTouchlineClubOwnerPageIdentity\(clubOwnerUser, owner\)\) notFound\(\);/);
  assert.match(source, /<ClubOwnerSubstitutionRenderer lang=\{lang\} \/>/);
});

test("the dynamic substitution route does not ignore its requested owner slug", () => {
  assert.doesNotMatch(source, /await params;\s*return <ClubOwnerSubstitutionRenderer/);
});
