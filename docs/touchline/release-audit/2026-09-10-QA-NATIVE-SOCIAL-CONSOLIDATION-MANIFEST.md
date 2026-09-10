# QA-native social consolidation manifest

## Boundary

- Base commit: `4a8393fbb21bdfbc6429c0d8a7c15ff9ce3b11c7`
- Base QA lineage: `00bb6bdc8d8b703c2481d7f3cd533c2b664c4f08`
- Applied local-only social patch: `b0551e0b7ae75b5289e3865ea35d1ed7ab8750dcfcce4384468c603c7d4f305a`
- Scope: exactly the 39 paths below plus this manifest.
- Status: local candidate only. No push, Vercel action, QA runtime approval,
  production deployment, factual approval, caption approval or outbound delivery.

The 041, 042 and 043 source locks reflect Luiz's 10 September 2026 approval of
local, non-publishable visual evidence only. `Caption PENDING` and `Outbound
DISABLED` remain authoritative.

## Effective path hashes

| SHA-256 | Path |
|---|---|
| `b08b9923d743d096f3f2b9d7008aa4061eef3096415968721ce8750e04e9937b` | `app/arena/ArenaClient.tsx` |
| `f54d79d8ff06a3bef2c7d287f48f6aad1f2d3e238e0c6d08f52d60c48b4e4748` | `app/visual-qa/card-goalkeeper-stat-strip/page.tsx` |
| `196c694376e24f602e3f9f7e027a059741cc03f7ad79b4c25d481f7d7f569d52` | `app/visual-qa/card-tier-component-calibration/page.tsx` |
| `6f8d0bab55b32ca0f7919602f9852fd121a7eb9954c68dcea0e9087983c41269` | `app/visual-qa/player-leader-crown/page.tsx` |
| `a782037c648b044876a11553fc616e619e06c6fad5670a37a5edb14b7981b74b` | `app/visual-qa/social-match-preview/page.tsx` |
| `e57d2b909770cd9d6ff4524f53a91524200f5f317eec8c58da600e9efe5e3df8` | `app/visual-qa/social-match-preview/preview-draft.ts` |
| `1a6c386dc617d63c88fd21082d5870d811b79cd34b0f64bea6a4f0fbfe179540` | `components/touchline/cards/TouchlineEliteExactCard.tsx` |
| `14dc39f2def15b2199d733d9f4103346a9c3dd5b71cd5b910d10ae8ee2f978d4` | `docs/touchline-arena/social-publishing-playbook/041_MATCH_PREVIEW_OWNER_ART_APPROVAL.md` |
| `1e7170112f43bb30fa8475061ea17fd7b25289c941bd0c8133f6ee731bcd16bd` | `docs/touchline-arena/social-publishing-playbook/042_FULL_TIME_OWNER_ART_APPROVAL.md` |
| `32d17771be03a1b668be0954e369c3d70d50831b66f2a40483b1cd61b75668fa` | `docs/touchline-arena/social-publishing-playbook/043_HAT_TRICK_OWNER_ART_APPROVAL.md` |
| `364d6e06e0bedbd7711e1e8cc88e70c566e9944d64603e16ff16f68dea9fae0f` | `docs/touchline/release-audit/2026-09-10-QA-NATIVE-MANUAL-REBASE-MANIFEST.md` |
| `e24d2f1de7c749cfed8ef1c6bd05a0f9ca7b39181cd8501bb8f053e6ff17f43c` | `lib/touchlineArena/arena-field-containment.ts` |
| `49308255cfd5c1292e427bb39a07c7339246f42fa875aa3a1b3e2639869558f5` | `lib/touchlineArena/arena-perspective-calibration.ts` |
| `f711579f8ff0ee6a2b3b2d04592387e47ccfc53ac86bc6dfe819a4321981ca6a` | `lib/touchlineArena/card-ranking-live.ts` |
| `28a350c2385a53acf708520ed20cfedac1dbdfcbce1e95b61d56d29b1bfe940f` | `lib/touchlineArena/card-ranking-persistence.ts` |
| `270c89d6c095a6cffeb4be12503f8418de5abe5953be5b11d542cf68ea06e5eb` | `lib/touchlineArena/card-ranking-pipeline.ts` |
| `fdf973e8e645036099c796d32604d060e3dee6d3da95fef2b749c58fceaf4a9d` | `lib/touchlineArena/card-ranking-server.ts` |
| `79eab81be86a1c6eb46d8247e0a95867fb90fe3c7c4c787b14eff513434c8438` | `lib/touchlineArena/card-stat-presentation.ts` |
| `42eccee22b654b0fc5c5da900af4ad2d7238ae9d7fc736a58d111d90f2ccec4b` | `lib/touchlineArena/card-tier-component-calibration.ts` |
| `7c94cf168047f34b72ef1f49367477dc95f2505292d808e38351b2e8eddfa6e5` | `lib/touchlineArena/leadership-decision.ts` |
| `2f41db121f01f1ecc6d59282934493f0206017e9456fcc57238352a3c3c5b436` | `lib/touchlineArena/player-leader-crown-presentation.ts` |
| `25e7d637436fc8abb46174ef497068d7771999462e8d607b290881a0cba8b696` | `lib/touchlineArena/player-ranking-leadership.ts` |
| `653590274a463481955c3719170904c1f6e0b7071549e419bd9b71c4d83ceef6` | `public/touchlineArena/cards/leadership/touchline-player-leader-crown.png` |
| `0156a90bfa87c716c6706fa230b932399fa8663d0c8fe0bec13519fc54412cb3` | `tests/browser/touchline-arena-formation-containment.spec.ts` |
| `db9b79156aa03810fa939396b9d01744345e6baa5b155c414c5e12a44ab5f2e7` | `tests/browser/touchline-arena-mobile-visual.spec.ts` |
| `9468d22263636d16be60c8db6770ba6d290f2ddff14e820626e0b10042b01e81` | `tests/browser/touchline-card-frame-decode.spec.ts` |
| `d3c4ed0a0f3db02b1cf9e7295f607e6e2840f7997e6140702d6d2313ebd865e2` | `tests/browser/touchline-player-leader-crown.spec.ts` |
| `5d2179e06226826115fa9ea264cdc4beee5865a61f19f7fec9b61a2fec9770f5` | `tests/touchline-arena-field-containment.test.mts` |
| `1c9d7a0972f71fd2c7fa6fbe24749c2126bfb0143d877b754108f44326a689c4` | `tests/touchline-arena-perspective-calibration.test.mts` |
| `c92e544162d0f656d3bbc17f03403941d14bd88bdbe06c5224009a733be2afcf` | `tests/touchline-card-goalkeeper-presentation.test.mts` |
| `69fea8126312db9da8f474f8fffce6ee0b32626a95d41fc896993b3478a89a4c` | `tests/touchline-card-goalkeeper-visual-qa.test.mts` |
| `0d17f61db9646bfaba6a494c6926a3951d0aeb065b0135f57d1f15878caaef57` | `tests/touchline-card-stat-presentation.test.mts` |
| `0ac4848ed5514776b4c9bda498f067b13fb1da2caff43bb799278cd837490c8e` | `tests/touchline-card-tier-component-calibration.test.mts` |
| `cebdd722a89f2de5373b3bc9a8fb25a0ba3227d18ab539b1e461b2320a5cd51b` | `tests/touchline-live-match-simulation.test.mts` |
| `a073e47d2c053a2908a5ba2fa7f0e13045e9c174da7162a9a5b7161fdb09877c` | `tests/touchline-player-leader-crown-presentation.test.mts` |
| `840f8b8b663c896fbeae05599037568677213044b30bfb0502fb856b26572cbe` | `tests/touchline-player-ranking-leadership.test.mts` |
| `1b53f725adb81c0295ccb617f244db80a013b30fd8ac81a0099e58033cc885b5` | `tests/touchline-route-audit-manifest.test.mts` |
| `e557f91f1de4077ec02340ac79f822aa15d7bbf8fcdb6ccfa28b875d3026fc19` | `tests/touchline-social-hat-trick-owner-approval.test.mts` |
| `f0b451ae1c84e5f2479aff397643b565e68fdb89a01b20946b18709fdc124135` | `tests/touchline-social-match-preview-visual-qa.test.mts` |

## Verification gate

The candidate requires full-suite, TypeScript, lint, production-build and
diff-boundary evidence before the Fiscal may consider a QA-only deployment
decision. This manifest itself does not grant that decision.
