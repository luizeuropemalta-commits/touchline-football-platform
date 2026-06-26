# Touchline HQ

Version: 0.2  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Active  
Dependencies: All Touchline HQ documentation folders  
Future Related Documents: Master Documentation Index, Mission Log, Decision Log, Documentation Governance Manual

Official documentation headquarters for Touchline.

This folder is the company brain of Touchline. It stores strategic, product, fantasy, economy, architecture, database, security, legal, marketing and development documentation.

No production code belongs here.

## Documentation Structure

| Folder | Purpose |
| --- | --- |
| `00_Governance` | Constitutional foundation, company rules, architecture rules, development rules and naming conventions. |
| `01_Executive` | Company vision, board strategy, investor-level direction and founder principles. |
| `02_Product` | Product strategy, user journeys, user roles, core workflows and product requirements. |
| `03_Fantasy` | Touchline Fantasy Bible, club owner system, cards, competitions, scoring and retention. |
| `04_Economy` | Touchline Credits, reputation, rankings, scarcity, inflation control and reward systems. |
| `05_Transfer_Center` | Transfer workflows, proposals, negotiations, deal rooms and opportunity systems. |
| `06_Football_Data` | Football data strategy, provider adapters, Sportmonks planning, sync engine, caching, rate limits and quality rules. |
| `07_Architecture` | Software architecture, app structure, backend strategy, frontend strategy and scaling plan. |
| `08_Database` | Database schema, relationships, migrations, RLS, indexing and data quality rules. |
| `09_UI_UX` | Design system, visual rules, mobile UX, game-like interface and accessibility standards. |
| `10_Security` | Authentication, authorization, secrets, data privacy, document protection and audit logs. |
| `11_Roadmap` | Build phases, technical roadmap, product roadmap and launch priorities. |
| `12_Legal` | Terms, privacy, data usage, licensing, compliance and representation disclaimers. |
| `13_Marketing` | Brand positioning, growth, launch strategy, agent acquisition and club acquisition. |
| `14_Development` | Engineering workflow, QA, testing, deployment, release notes and maintenance rules. |
| `99_Archive` | Deprecated ideas, old documents and historical decisions. Strategic ideas are archived, not deleted. |

## Official Document Metadata Standard

Every official Markdown document must include this metadata block immediately below the title:

```text
Version:
Author:
Last Updated:
Status:
Dependencies:
Future Related Documents:
```

## Documentation Index

| Topic | Primary Folder | Supporting Folders |
| --- | --- | --- |
| Constitutional rules | `00_Governance` | `01_Executive`, `14_Development` |
| Company strategy | `01_Executive` | `11_Roadmap`, `13_Marketing`, `12_Legal` |
| Product strategy | `02_Product` | `09_UI_UX`, `07_Architecture`, `08_Database` |
| Fantasy ecosystem | `03_Fantasy` | `04_Economy`, `05_Transfer_Center`, `09_UI_UX` |
| Club Owner Card System | `03_Fantasy/08_Club_Owner_Card_System.md` | `04_Economy/01_Touchline_Economy_Bible.md`, `09_UI_UX` |
| Credits, ranking and rewards | `04_Economy` | `03_Fantasy`, `05_Transfer_Center` |
| Transfers and negotiations | `05_Transfer_Center` | `02_Product`, `04_Economy`, `12_Legal` |
| Sportmonks and football data | `06_Football_Data` | `08_Database`, `07_Architecture`, `12_Legal` |
| Football Data Architecture | `06_Football_Data/08_Football_Data_Architecture_Bible.md` | `07_Architecture`, `08_Database`, `10_Security` |
| Legacy football API migration | `06_Football_Data/08_Legacy_API_Migration.md` | `06_Football_Data/03_API_Adapter.md`, `07_Architecture`, `08_Database` |
| Provider switching strategy | `06_Football_Data/09_Provider_Switching_Strategy.md` | `06_Football_Data/01_Data_Strategy.md`, `06_Football_Data/02_Sportmonks.md` |
| Sportmonks Starter capability map | `06_Football_Data/10_Sportmonks_Starter_Capability_Map.md` | `06_Football_Data/01_Data_Strategy.md`, `06_Football_Data/03_API_Adapter.md`, `06_Football_Data/04_Sync_Engine.md` |
| Software structure | `07_Architecture` | `08_Database`, `10_Security`, `14_Development` |
| Master System Architecture | `07_Architecture/01_Master_System_Architecture.md` | `06_Football_Data`, `08_Database`, `09_UI_UX`, `10_Security`, `11_Roadmap` |
| Database and data quality | `08_Database` | `06_Football_Data`, `10_Security` |
| Definitive database blueprint | `08_Database/01_Database_Master_Bible.md` | `02_Product`, `03_Fantasy`, `06_Football_Data` |
| Visual design and UX | `09_UI_UX` | `02_Product`, `03_Fantasy` |
| Full user journey | `09_UI_UX/01_Touchline_User_Experience_Bible.md` | `03_Fantasy`, `04_Economy`, `05_Transfer_Center` |
| Security and permissions | `10_Security` | `12_Legal`, `08_Database`, `07_Architecture` |
| Roadmap and priorities | `11_Roadmap` | `01_Executive`, `02_Product`, `14_Development` |
| Official development plan | `11_Roadmap/01_Master_Development_Roadmap.md` | All Touchline HQ documents |
| Legal and compliance | `12_Legal` | `10_Security`, `06_Football_Data` |
| Growth and launch | `13_Marketing` | `01_Executive`, `02_Product` |
| Engineering workflow | `14_Development` | `00_Governance`, `07_Architecture`, `10_Security` |
| Deprecated or historical ideas | `99_Archive` | Any folder that replaces or supersedes a document |

## Rule for Future Missions

Every new Touchline idea must be placed into the correct folder before development begins.

If an idea belongs in multiple folders, split it into separate documents.

Never delete strategic ideas. If an idea becomes obsolete, move it to `99_Archive` with a short reason.

## Naming Standard

Use clear numbered Markdown files:

```text
01_document_name.md
02_document_name.md
03_document_name.md
```

Example:

```text
03_Fantasy/
  01_touchline_fantasy_bible.md
  02_club_owner_system.md
  03_touchline_cards.md
```

## Current Status

This structure is the official Touchline HQ documentation architecture.
