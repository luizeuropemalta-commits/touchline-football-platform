# Frozen QA manifest - Admin account navigation

Base: qa/bd0998c343bcca1c156c8afee3e5221cdb879926. This manifest binds the next immutable commit; exact SHA must be read after commit and recorded in the release evidence, not guessed or self-embedded.

Owner explicitly authorized one new Git-native QA deployment of this scoped navigation correction. Budget1, consumed0 before push. Production forbidden. No second CLI/redeploy path.

23 committed files intended:22 content hashes below plus this self-excluded manifest. No generated tsbuildinfo, secrets, environment files, dependencies, maintenance asset, alternate Membership artwork or untracked roster/market evidence is included.

Product: public My account entry dispatches by verified Auth to fixed admin/customer routes. Known admin navigation does not link to ClubOwner. Old direct customer URL returns admin before loading team state. No team, privilege, score, provider, market value, billing or data mutation. Existing local-session logout is unchanged; it was not clicked with real credentials.

Gates: final canonical verify:release exit0;5334 tests/5320 PASS/0 FAIL/14 SKIP;TypeScript/lint/diff/governance/input PASS,8 existing lint warnings. Optimized isolated build exit0,all six product hashes canonical-equal. Compiled Chromium/WebKit10/10 navigation/guest cases,desktop and landscape screenshots inspected. Independent code review no unresolvedP0/P1/P2. Clean committed checkout and final GO QA remain mandatory before push.

Logs: /tmp/touchline-admin-account-navigation-release-gate-frozen-20261016.log ; /tmp/touchline-admin-account-navigation-build-20261016.log ; /tmp/touchline-account-navigation-browser-20261016.json . First failed gate and intermediate pre-hardening gate retained, not substituted for the final source gate.

Target: fifa-agent-plataform / touchline-arena-official / prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM,Preview branchqa. Stable alias https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app . Node24,pnpm11.9.0,package/lock unchanged,no install/new env/migration. QA env names/scopes checked; no configuration or credentials modified.

Rollback: only QA alias to bd0998c343bcca1c156c8afee3e5221cdb879926 / dpl_2qt6KDa4Y4irqi1HcusWbKWCPauc / https://touchline-arena-official-rabbciyum-fifa-agent-plataform.vercel.app . Preserve every identity, score, audit and migration. No rollback executed.

Postflight required: exact SHA/Ready/alias/build logs; public desktop/landscape navigation; guest login/internal return; real administrator/customer routing when the matching session is available; error logs; automatic points regression. No real sign-out or session switch without explicit user action. Physical mobile, customer-session and broader whole-product gaps remain explicit.

## SHA256

7c330b630024919e5aa704d5aead83f37e75b805de5b377874b378c86d19a95f  app/account/page.tsx
ce5b992197c739664de351a7d4e4cba0cc1ac168f75dfb80f08d6592cd4e7280  app/clubowner/page.tsx
e376f63ce1e3b943f1c860b0b7db3b86898d77ca6aa782b5557614a5521ecf8c  components/touchline/TouchlineGlobalNavigation.tsx
9e8b42efa62a771ab3e649c40917b78376c29bb9f84ceadb2f116336b3d649a3  lib/touchlineArena/auth-i18n.ts
f238ac6126e1cffc83f52df8f4d17a1ca4d86ad9bdcb3d8673e99112780544c9  lib/touchlineArena/global-navigation.ts
3132c22064b6ce421cd232552e276ed6d34e58d31c43ab4808fe22966d3ab330  lib/touchlineArena/navigation-i18n.ts
6a51217d9632507bae0ecaf1557f5efeced3f738b045dbd46db20c57c6db7ccd  scripts/qa/build-touchline-route-audit-manifest.mts
337d66c1b7723f55d3d0a769ff9701fa59c5680dd1f5a2cad0d3ac0dd52ef748  tests/touchline-account-entry.test.mts
d7339ff0f6158d5c334f01c36167b783222e2cd63a69bed7f05ee394b98a6de7  tests/arena-auth-isolation.test.mts
797c57d24fe85283b6cff8051229f0fd4fce20b4314a30ca97d61e083be08137  tests/arena-server-auth-deadline.test.mts
5090b9829681cda631a33985a457ef4c813ebb117e5bdaf5a95222dba9e2bae9  tests/touchline-card-overlay-admin-shortcut.test.mts
45457fc4f6524b01b8eb4d590fbad0f910c21c7c811e88168ed0845ba2659b52  tests/touchline-club-owner-avatar-context-server.test.mts
7d1b5e5678a6da8e4af4168c6edbc060bc634d9be850183c28a3d5cc10e2dea1  tests/touchline-clubowner-auth-error-envelope.test.mts
9d350406d2bb26e1b017f64a38d158d68a767ac8d385e08471db3d2c2af09c83  tests/touchline-market-route-draft-gate.test.mts
f51f805e5f5be42520400438f6cc2e73d3d00efffa032b986dab76ee98477f26  tests/touchline-my-club-canonical-route.test.mts
ad0bd1beaa1f32a31b4203dcfdebf7af8128b9fb1debf91088181fe7b17fb6dc  tests/touchline-navigation-locale-catalogue.test.mts
fbec642bda3f82cfdcc787343af5d2f77c5173bd32d55ccea5d3ec1bc0660e93  tests/touchline-neon-identity-regression.test.mts
d89b1f4983733c0d49442f551f822b0b84f4ee1c361c6407c9912895ee5049d2  tests/touchline-route-audit-manifest.test.mts
97ee9997e8932f5ecb157a6607987f7bca944cde4ba041591a623b2b6ca19c71  CURRENT_STATE.md
603cdd38da3a2891aa24479bf50f3c44e604caeb0b132b937cd9d106055d512b  CURRENT_EXECUTION_LEDGER.md
765384afb3654f9ca919cbaf89bc7d2c85c800dceeae9368e4c035f2c3d476d5  docs/touchline/release-audit/2026-10-16-ADMIN-ACCOUNT-NAVIGATION-WIP.md
0902f0b44bbb2414a7d70288d722dca693e5eba7ac050a80a9f742f95a140c7d  docs/touchline/release-audit/2026-10-16-AUTOMATIC-POINTS-QA-ACCEPTANCE.md
