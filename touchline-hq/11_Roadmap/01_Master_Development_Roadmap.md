# Master Development Roadmap

Version: 0.1  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Draft Official Roadmap  
Dependencies: 00_Governance, 02_Product, 03_Fantasy, 04_Economy, 05_Transfer_Center, 06_Football_Data, 08_Database, 09_UI_UX, 10_Security, 12_Legal, 14_Development  
Future Related Documents: 30-Day Plan, 90-Day Plan, Version 1.0 Launch Plan, Technical Debt Plan, Investor Build Plan

## Executive Summary

Touchline must be built in the correct order:

1. Governance and product clarity.
2. Stable data foundation.
3. Secure economy and transfer rules.
4. Core fantasy onboarding.
5. Transfer Center.
6. Live Arena and competitions.
7. Monetization and marketplace security.
8. Beta launch.
9. Version 1.0 launch.

The roadmap must protect the company from the biggest danger: building exciting features on weak foundations.

Touchline should not rush into full fantasy, live data and marketplace features before the database, economy, security and user journey are stable.

---

# Roadmap Principles

## Constitutional Rules

1. Do not build a feature without a clear document owner.
2. Do not build fantasy economy features before the Economy Bible rules are implemented.
3. Do not build external data features tied to one provider only.
4. Do not build transfer features without Secure Transfer Policy enforcement.
5. Do not build Live Arena before caching and sync strategy are stable.
6. Do not build monetization that creates pay-to-win risk.
7. Do not launch Version 1.0 with fake buttons, unclear permissions or unverified economy flows.

---

# Phase 0 — Documentation and Constitutional Foundation

## Objective

Create the strategic foundation before development.

## Required Documents

- `00_Governance/01_Touchline_Manifesto.md`
- `00_Governance/02_Company_Principles.md`
- `00_Governance/03_Architecture_Rules.md`
- `00_Governance/04_Development_Rules.md`
- `00_Governance/05_Naming_Convention.md`
- `11_Roadmap/01_Master_Development_Roadmap.md`

## Dependencies

- Touchline HQ structure.
- Product direction.
- Executive approval.

## Estimated Complexity

Low technical complexity. High strategic importance.

## Technical Risks

- Documentation becomes disconnected from actual product.
- Future development ignores architecture rules.

## Business Risks

- Building too many disconnected ideas.
- Losing focus between Professional and Fantasy.

## Milestones

- Governance documents created.
- Roadmap approved.
- All future missions mapped to folders.

## Definition of Done

- Touchline HQ contains the official governance layer.
- The roadmap is approved before development resumes.
- Every new feature has a documentation home.

---

# Phase 1 — Product Stabilization and Current Platform Cleanup

## Objective

Stabilize the current Touchline platform before adding major new systems.

## Required Documents

- `02_Product/README.md`
- `09_UI_UX/01_Touchline_User_Experience_Bible.md`
- `14_Development/README.md`
- `00_Governance/04_Development_Rules.md`

## Dependencies

- Existing app audit.
- Current routing.
- Current Supabase setup.
- Current football search and profile workflows.

## Estimated Complexity

Medium.

## Technical Risks

- Duplicate routes.
- Broken buttons.
- Inconsistent mobile layout.
- Demo data mixed with real data.
- Fragile Transfermarkt link enrichment.

## Business Risks

- Users lose trust if the platform feels unfinished.
- Agents and clubs may not understand the core value.

## Milestones

- Navigation simplified.
- Dead buttons removed or clearly marked.
- Football Search becomes the official search entry.
- Player, club and agent profiles become consistent.
- Mobile layouts are usable.

## Definition of Done

- A new user can log in, navigate, search and open core profiles without confusion.
- No major route feels abandoned.
- No duplicate page serves the same purpose without reason.

---

# Phase 2 — Database and Football Data Foundation

## Objective

Build the provider-independent football data foundation.

## Required Documents

- `06_Football_Data/08_Football_Data_Architecture_Bible.md`
- `08_Database/01_Database_Master_Bible.md`
- `06_Football_Data/01_Data_Strategy.md`
- `06_Football_Data/03_API_Adapter.md`
- `06_Football_Data/04_Sync_Engine.md`
- `06_Football_Data/05_Cache_Strategy.md`
- `06_Football_Data/06_Rate_Limit.md`
- `06_Football_Data/07_Data_Quality.md`

## Dependencies

- Provider decision.
- Sportmonks evaluation.
- Database schema design.
- Search strategy.

## Estimated Complexity

High.

## Technical Risks

- Provider lock-in.
- High API usage.
- Bad data quality.
- Duplicate entities.
- Slow search.

## Business Risks

- Wrong football data damages credibility.
- Provider cost may become too high.
- Legal/data licensing ambiguity.

## Milestones

- Provider-independent data model.
- External ID mapping strategy.
- Sync job plan.
- Cache strategy.
- Data quality rules.
- Search ranking rules.

## Definition of Done

- Touchline can store and search normalized players, clubs, coaches and competitions without depending on one provider's schema.
- External data is source-tracked.
- Sync and cache rules are documented and ready for implementation.

---

# Phase 3 — Touchline Fantasy Core MVP

## Objective

Create the first playable fantasy ownership loop.

## Required Documents

- `03_Fantasy/README.md`
- `03_Fantasy/08_Club_Owner_Card_System.md`
- `09_UI_UX/01_Touchline_User_Experience_Bible.md`
- `04_Economy/01_Touchline_Economy_Bible.md`
- `08_Database/01_Database_Master_Bible.md`

## Dependencies

- User account.
- Club Owner entity.
- Club creation.
- Owner Card system.
- Starter budget.
- Basic cards.
- Basic squad builder.

## Estimated Complexity

High.

## Technical Risks

- Avatar generation complexity.
- Card state complexity.
- Club owner data model mistakes.
- Mobile onboarding friction.

## Business Risks

- Users may not understand the difference between Professional and Fantasy.
- Too much onboarding may reduce activation.

## Milestones

- Welcome screen.
- Account creation flow.
- Club creation.
- Owner avatar.
- Club badge.
- Starter budget.
- First squad.
- First Owner Card.

## Definition of Done

- A new user can create a club and understand the fantasy core loop within minutes.
- The user sees a meaningful Club Owner Card.
- The first session produces ownership, not confusion.

---

# Phase 4 — Economy and Touchline Cards

## Objective

Build the economic foundation for cards, credits, club bank and prestige.

## Required Documents

- `04_Economy/01_Touchline_Economy_Bible.md`
- `03_Fantasy/08_Club_Owner_Card_System.md`
- `10_Security/02_Secure_Transfer_Policy.md`
- `12_Legal/01_Legal_Bible.md`

## Dependencies

- Official Market Value provider.
- Club Bank.
- Touchline Credits ledger.
- Touchline Cards.
- Salary cap.
- Card categories.

## Estimated Complexity

Very High.

## Technical Risks

- Incorrect credit ledger.
- Mutable balances without audit history.
- Incorrect card category updates.
- Inflation risk.

## Business Risks

- Pay-to-win perception.
- Legal confusion around cards and credits.
- Economy manipulation.

## Milestones

- Bronze, Silver and Gold categories.
- Credits ledger.
- Club Bank.
- Club Net Worth.
- Salary cap.
- Card availability.
- Inflation guardrails.

## Definition of Done

- Every credit movement is explainable.
- Card category follows official provider market value.
- Club Net Worth is visible but not legally misleading.
- Economy rules prevent obvious pay-to-win abuse.

---

# Phase 5 — Transfer Center and Secure Negotiation Rooms

## Objective

Create the official in-platform marketplace for Touchline Cards.

## Required Documents

- `05_Transfer_Center/01_Transfer_Center_Bible.md`
- `05_Transfer_Center/02_Secure_Transfer_Policy.md`
- `10_Security/02_Secure_Transfer_Policy.md`
- `04_Economy/01_Touchline_Economy_Bible.md`
- `12_Legal/02_Secure_Transfer_Policy.md`

## Dependencies

- Touchline Cards.
- Credits ledger.
- Club Bank.
- Secure message protection.
- Transfer audit logs.

## Estimated Complexity

Very High.

## Technical Risks

- Fraud attempts.
- External transaction bypassing.
- Message protection false positives.
- Transfer race conditions.
- Dispute resolution gaps.

## Business Risks

- Users may attempt to move deals to WhatsApp.
- Marketplace revenue leakage.
- Fraud could damage brand trust.

## Milestones

- Offer system.
- Counteroffer system.
- Secure Negotiation Room.
- Transfer status lifecycle.
- AI message protection.
- Reputation penalties.

## Definition of Done

- Every transfer proposal is recorded.
- External contact/payment attempts are blocked.
- Completed transfers are auditable.
- Users understand why negotiations stay inside Touchline.

---

# Phase 6 — Competitions and Live Arena

## Objective

Turn club ownership into competition, emotion and daily engagement.

## Required Documents

- `09_UI_UX/01_Touchline_User_Experience_Bible.md`
- `06_Football_Data/08_Football_Data_Architecture_Bible.md`
- `08_Database/01_Database_Master_Bible.md`
- `04_Economy/01_Touchline_Economy_Bible.md`

## Dependencies

- Fixtures.
- Live data.
- Competition entries.
- Squad registration.
- Scoring rules.
- Cache and sync.

## Estimated Complexity

Very High.

## Technical Risks

- Live sync delay.
- High API cost.
- Scoring disputes.
- Cache invalidation.
- Real-time scaling.

## Business Risks

- Live experience disappoints if updates are slow.
- Bad scoring rules reduce trust.
- Competitions feel unfair if matching is poor.

## Milestones

- First competition.
- Squad registration.
- Matchday view.
- Live Arena events.
- Ranking updates.
- Rewards.
- Trophy cabinet.

## Definition of Done

- Users can enter a competition, watch matchday progress and receive clear results.
- Live data is cached and scalable.
- Rankings and rewards are explainable.

---

# Phase 7 — Retention, Notifications and Seasonal Progression

## Objective

Make Touchline a daily and weekly habit.

## Required Documents

- `09_UI_UX/01_Touchline_User_Experience_Bible.md`
- `04_Economy/01_Touchline_Economy_Bible.md`
- `08_Database/01_Database_Master_Bible.md`

## Dependencies

- Notification system.
- Daily briefing.
- Weekly loop.
- Seasonal rewards.
- Achievements.
- Reputation events.

## Estimated Complexity

Medium to High.

## Technical Risks

- Notification spam.
- Poor mobile performance.
- Reward inflation.
- Achievement farming.

## Business Risks

- Users return only weekly.
- Too many notifications cause opt-out.
- Rewards feel meaningless.

## Milestones

- Daily briefing.
- Actionable notifications.
- Weekly preparation flow.
- Seasonal report.
- Achievements.
- Reputation events.

## Definition of Done

- Users have meaningful reasons to return daily.
- Notifications are actionable.
- Seasonal progression feels emotionally valuable.

---

# Phase 8 — Monetization and Commercial Launch Readiness

## Objective

Create a sustainable revenue model without damaging fairness.

## Required Documents

- `04_Economy/01_Touchline_Economy_Bible.md`
- `10_Security/01_Security_Bible.md`
- `12_Legal/01_Legal_Bible.md`
- `13_Marketing/README.md`

## Dependencies

- Economy rules.
- Secure Transfer Policy.
- Subscription model.
- Payment provider.
- Legal disclaimers.

## Estimated Complexity

High.

## Technical Risks

- Payment failures.
- Subscription entitlement bugs.
- Credit purchase disputes.
- Security issues.

## Business Risks

- Pay-to-win perception.
- Pricing too high or too confusing.
- Launch before value is proven.

## Milestones

- Subscription tiers.
- Credit purchase rules.
- Cosmetic monetization.
- Premium analytics.
- Billing dashboard.
- Founder/early adopter plan.

## Definition of Done

- Users understand what is paid and what is fair.
- Monetization does not break competitive integrity.
- Billing and entitlement logic are reliable.

---

# Phase 9 — Private Beta

## Objective

Test Touchline with controlled real users before public launch.

## Required Documents

- `11_Roadmap/01_Master_Development_Roadmap.md`
- `14_Development/README.md`
- `13_Marketing/README.md`
- `10_Security/01_Security_Bible.md`

## Dependencies

- Core MVP stable.
- Economy rules working.
- Football data stable.
- Secure negotiations.
- Support process.

## Estimated Complexity

Medium.

## Technical Risks

- Unknown bugs.
- Data sync failures.
- User behavior edge cases.

## Business Risks

- Early users misunderstand product.
- Feedback reveals missing core value.
- Bad first impression with target market.

## Milestones

- Beta cohort selected.
- Feedback system.
- Bug triage.
- Usage analytics.
- Retention measurement.
- Economy monitoring.

## Definition of Done

- Beta users complete onboarding.
- Users make transfers.
- Users enter competitions.
- Major UX blockers are identified.
- Economy abuse scenarios are tested.

---

# Phase 10 — Version 1.0 Launch

## Objective

Launch Touchline 1.0 as a serious, trusted and exciting football ownership ecosystem.

## Required Documents

- All Governance documents.
- Economy Bible.
- Football Data Architecture Bible.
- Database Master Bible.
- User Experience Bible.
- Security Bible.
- Legal Bible.
- Marketing launch docs.

## Dependencies

- Production infrastructure.
- Stable data provider.
- Payment system.
- Legal policies.
- Customer support.
- Monitoring.

## Estimated Complexity

Very High.

## Technical Risks

- Scale issues.
- Live data failures.
- Payment bugs.
- Search latency.
- Mobile performance.

## Business Risks

- Weak launch positioning.
- Incomplete product-market fit.
- Economy imbalance.
- Legal/data provider issues.

## Milestones

- Production readiness.
- Public landing page.
- Support system.
- Launch campaign.
- First competitions.
- First marketplace season.
- Version 1.0 release notes.

## Definition of Done

- A new user can join, create a club, buy cards, enter competition, use Live Arena and understand long-term progression.
- Secure Transfer Policy is enforced.
- Provider data is stable enough for launch.
- Payment and subscription systems are production-ready.
- Core economy is monitored.

---

# Executive Roadmap

## Priority Order

1. Foundation and governance.
2. Current product stabilization.
3. Football data architecture.
4. Database architecture.
5. Fantasy onboarding.
6. Economy and cards.
7. Transfer Center.
8. Competitions and Live Arena.
9. Monetization.
10. Beta.
11. Version 1.0.

## Executive Rule

Do not launch public Version 1.0 until the economy, security and data foundations are trusted.

---

# Product Roadmap

## Product Milestones

1. Clear mode selection.
2. First-time user journey.
3. Club creation.
4. Owner Card.
5. Starter budget.
6. First squad.
7. Transfer Center.
8. First competition.
9. Live Arena.
10. Daily retention loop.
11. Seasonal progression.

## Product Goal

Every new user must understand Touchline within minutes and see years of progression ahead.

---

# Technical Roadmap

## Technical Milestones

1. Clean navigation and route structure.
2. Provider-independent data layer.
3. Database schema foundation.
4. Search strategy.
5. Credit ledger.
6. Card ownership system.
7. Transfer audit system.
8. Queue and sync architecture.
9. Live data cache.
10. Monitoring and admin tools.

## Technical Goal

Touchline should serve millions of users from its own normalized data layer, minimizing direct API usage.

---

# Business Roadmap

## Business Milestones

1. Define target users.
2. Validate fantasy ownership concept.
3. Validate Club Owner Card status value.
4. Validate Transfer Center engagement.
5. Validate pricing.
6. Create beta community.
7. Launch founder plan.
8. Build partnerships.
9. Prepare investor story.

## Business Goal

Create a football technology company, not only a fantasy app.

---

# Launch Roadmap

## Pre-Launch

- Documentation approved.
- Product stabilization.
- Legal review.
- Data provider plan.
- Economy testing.
- Beta recruitment.

## Beta Launch

- Invite-only users.
- Controlled competitions.
- Economy monitoring.
- Feedback collection.
- Bug fixes.

## Public Launch

- Landing page.
- Paid plans.
- Public competitions.
- Social sharing.
- Support system.
- Launch campaign.

## Post-Launch

- Monitor retention.
- Monitor economy.
- Monitor fraud.
- Improve onboarding.
- Expand provider coverage.

---

# Future Roadmap

## Version 1.1

- Advanced Club Owner Card animations.
- More competitions.
- Better notifications.
- Improved mobile experience.

## Version 1.2

- Coach system.
- Stadium upgrades.
- Sponsor economy.
- Academy system.

## Version 1.3

- Advanced transfer clauses.
- Rivalries.
- Dynasty mode.
- Historical club documentary.

## Version 2.0

- Native mobile app.
- Multi-provider live data.
- Global fantasy leagues.
- Professional/Fantasy bridge.
- Investor-ready business intelligence.

---

# Final Development Rule

The roadmap is official.

If a new idea appears, it must be placed into the correct phase or deliberately deferred.

Touchline should grow with discipline:

```text
Trust → Data → Economy → Transfer → Competition → Retention → Monetization → Scale
```

