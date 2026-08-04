# TouchLine local performance readiness — 2026-08-04

Scope: warm production-build reads on `127.0.0.1:3100`, with HTTP gzip
enabled. This is local evidence, not a substitute for CDN, real-device or
native WebKit profiling.

| Route | HTTP | warm TTFB range | total range | gzip wire payload |
| --- | ---: | ---: | ---: | ---: |
| `/` | 200 | 3–4 ms | 3–4 ms | 2.8 KB |
| `/arena?skipIntro=1` | 200 | 5–7 ms | 8–10 ms | 42.4 KB |
| `/live` | 200 | 4 ms | 228–506 ms | 9.2 KB |
| `/market-transfer` | 200 | 9–11 ms | 14–15 ms | 45.9 KB |
| `/touchline-tables` | 200 | 4–5 ms | 70–75 ms | 9.3 KB |
| `/touchline-clubs/manchester-united` | 200 | 5–7 ms | 290–381 ms | 91.6 KB |
| `/touchline-players/erling-haaland` | 200 | 5–6 ms | 245–279 ms | 23.4 KB |

All 21 route reads returned HTTP 200. The ClubHub stream is about 1.08 MB
before compression because it contains real, server-rendered card markup; gzip
reduces it to 91.6 KB. The production route-specific JavaScript chunks measured
9–24 KB. No safe performance correction was justified from this local matrix.

Follow-up: repeat this matrix through the production CDN, then collect real
device LCP/INP data before changing the card presentation or football content.
