import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PUBLIC_CLUB_OWNER_IDENTITY,
  resolveTouchlineClubOwnerPageIdentity,
  touchlineClubOwnerSlugForUser,
} from "../lib/touchlineArena/club-owner-page-identity.ts";

const rendererSource = readFileSync(
  new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url),
  "utf8",
);
const avatarUploadSource = readFileSync(
  new URL("../components/touchline/ClubOwnerAvatarUpload.tsx", import.meta.url),
  "utf8",
);

test("an authenticated ClubOwner profile uses that account identity, not Luiz's public identity", () => {
  const identity = resolveTouchlineClubOwnerPageIdentity({
    id: "123e4567-e89b-42d3-a456-426614174000",
    email: "ana@example.com",
    created_at: "2027-03-04T09:00:00.000Z",
    user_metadata: {
      full_name: "Ana Silva",
      nationality: "Portugal",
      city: "Porto",
      avatar_url: "https://cdn.example.com/ana.png",
    },
  });

  assert.equal(identity.isAuthenticatedClubOwner, true);
  assert.equal(identity.name, "Ana Silva");
  assert.equal(identity.avatarUrl, "https://cdn.example.com/ana.png");
  assert.equal(identity.nationality, "Portugal");
  assert.equal(identity.city, "Porto");
  assert.equal(identity.since, "2027");
  assert.equal(identity.entityId, "club-owner:123e4567-e89b-42d3-a456-426614174000");
  assert.notEqual(identity.entityId, PUBLIC_CLUB_OWNER_IDENTITY.entityId);
});

test("unsafe or absent profile metadata never reuses Luiz's photo for another account", () => {
  const identity = resolveTouchlineClubOwnerPageIdentity({
    id: "account-2",
    email: "new.clubowner@example.com",
    created_at: "invalid",
    user_metadata: {
      avatar_url: "javascript:alert(1)",
    },
  });

  assert.equal(identity.name, "new.clubowner");
  assert.equal(identity.avatarUrl, "/icons/touchline-512.png");
  assert.equal(identity.nationality, "—");
  assert.equal(identity.city, "—");
  assert.equal(identity.since, "—");
});

test("stored profile media overrides auth metadata and never enters the session token", () => {
  const storedAvatar = "data:image/jpeg;base64,aGVsbG8=";
  const identity = resolveTouchlineClubOwnerPageIdentity({
    id: "account-3",
    email: "maria@example.com",
    created_at: "2026-08-05T00:00:00.000Z",
    user_metadata: {
      full_name: "Maria Silva",
      avatar_url: "https://old.example.com/avatar.png",
    },
  }, "maria-silva", storedAvatar);

  assert.equal(identity?.avatarUrl, storedAvatar);
  assert.match(avatarUploadSource, /\.from\("users"\)/);
  assert.match(avatarUploadSource, /\.update\(\{ avatar_url: avatarUrl \}\)/);
  assert.doesNotMatch(avatarUploadSource, /auth\.updateUser\(\{ data: \{ avatar_url/);
});

test("ClubOwner slugs come from account metadata/name and never silently fall back to Luiz", () => {
  const anaUser = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    email: "ana@example.com",
    created_at: "2027-03-04T09:00:00.000Z",
    user_metadata: {
      full_name: "Ana Silva",
      nationality: "Portugal",
      city: "Porto",
    },
  };

  assert.equal(touchlineClubOwnerSlugForUser(anaUser), "ana-silva");
  assert.equal(resolveTouchlineClubOwnerPageIdentity(anaUser, "ana-silva")?.name, "Ana Silva");
  assert.equal(resolveTouchlineClubOwnerPageIdentity(anaUser, "ana-silva")?.isAuthenticatedClubOwner, true);
  assert.equal(resolveTouchlineClubOwnerPageIdentity(anaUser, "outro-slug-valido"), null);
  assert.equal(resolveTouchlineClubOwnerPageIdentity(null, "outro-slug-valido"), null);
  assert.equal(resolveTouchlineClubOwnerPageIdentity(anaUser, "luiz-lopez")?.entityId, PUBLIC_CLUB_OWNER_IDENTITY.entityId);
});

test("the anonymous page preserves the isolated public Luiz profile", () => {
  const identity = resolveTouchlineClubOwnerPageIdentity(null);

  assert.equal(identity.isAuthenticatedClubOwner, false);
  assert.equal(identity.name, PUBLIC_CLUB_OWNER_IDENTITY.name);
  assert.equal(identity.avatarUrl, PUBLIC_CLUB_OWNER_IDENTITY.avatarUrl);
  assert.equal(identity.entityId, PUBLIC_CLUB_OWNER_IDENTITY.entityId);
});

test("ClubOwner account, private controls, roster and TC wallet share one non-admin boundary", () => {
  assert.match(
    rendererSource,
    /const clubOwnerUser = user && !isOwnerEmail\(user\.email\) \? user : null;/,
  );
  assert.match(
    rendererSource,
    /const activeClubOwnerUser = ownerIdentity\.isAuthenticatedClubOwner && clubOwnerUser \? clubOwnerUser : null;/,
  );
  assert.match(
    rendererSource,
    /const showPrivateClubControl = ownerIdentity\.isAuthenticatedClubOwner;/,
  );
  assert.match(
    rendererSource,
    /readAuthoritativeTouchlineRoster\(admin, activeClubOwnerUser\.id\)/,
  );
  assert.match(rendererSource, /\.eq\("user_id", activeClubOwnerUser\.id\)/);
  assert.match(rendererSource, /\.eq\("currency", "TC"\)/);
  assert.doesNotMatch(
    rendererSource,
    /showPrivateClubControl\s*=\s*process\.env\.NODE_ENV/,
  );
  assert.doesNotMatch(
    rendererSource,
    /showPrivateClubControl\s*=.*isOwnerEmail/,
  );
});

test("rendered identity and social namespaces come from the resolved ClubOwner", () => {
  assert.match(rendererSource, /name=\{ownerIdentity\.name\}/);
  assert.match(rendererSource, /avatarUrl=\{ownerIdentity\.avatarUrl\}/);
  assert.match(rendererSource, /entityId=\{ownerIdentity\.entityId\}/);
  assert.match(rendererSource, /entityName=\{ownerIdentity\.name\}/);
  assert.doesNotMatch(rendererSource, /name="Luiz Lopez"/);
  assert.doesNotMatch(rendererSource, /entityName="Luiz Lopez"/);
});
