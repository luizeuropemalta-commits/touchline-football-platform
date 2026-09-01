# Multichannel Destination Roadmap

Status: **design only; no account connection or destination adapter active**
Authority: **Luiz Lopez, 2026-08-31, Europe/Malta**
Current priority: **ACTIVE PRIORITY — Instagram and modules 041–046**
Next adapter: **NEXT — Facebook Page, only after Instagram is stable and measured**

| Destination | Product status | Runtime work status |
|---|---|---|
| Instagram | `ACTIVE PRIORITY` | Complete the 041–046 family first; outbound still separately gated |
| Facebook Page | `NEXT` | Separate adapter only after Instagram stabilisation and measurement |
| Threads | `DOCUMENTED / DISABLED` | No schema, OAuth, credential, API or implementation work |
| X | `DOCUMENTED / DISABLED` | No schema, OAuth, credential, API or implementation work |
| TikTok | `DOCUMENTED / DISABLED` | No schema, OAuth, credential, API or implementation work |
| YouTube Shorts | `DOCUMENTED / DISABLED` | No schema, OAuth, credential, API or implementation work |
| LinkedIn | `DOCUMENTED / DISABLED` | No schema, OAuth, credential, API or implementation work |

## One event, destination-specific delivery

Central TouchLine emits one versioned canonical publication event and one
factual `sourceChecksum`. Destinations never rebuild football facts. Each
destination may derive a separately versioned render/copy variant appropriate
to its placement, but the factual checksum must remain traceable to the same
canonical revision.

Template approval identity includes `destination + placement + contentType +
templateVersion`. A successful delivery to one destination never proves or
authorises delivery to another.

Each destination owns independent:

- delivery attempt and idempotency identity;
- OAuth/credential boundary and permission set;
- quota/rate budget and backpressure;
- global and destination/content kill switch;
- retry and reconciliation state, including terminal `DELIVERY_UNKNOWN`;
- before/after audit and normalised analytics;
- Admin status, enable/disable control and operational health.

A failure on Facebook must not retry, duplicate or alter Instagram, and the
inverse is equally mandatory. Credentials never enter browser bundles, public
DTOs, logs, captions, artefacts or shared destination configuration.

## Rollout phases

### Phase A — Instagram, then Facebook Page

Instagram remains the first adapter and the acceptance target for modules
041–046. Facebook Page follows only after Instagram is stable. Both receive the
same canonical facts/checksum, with caption and placement adapted per network.
Meta integration is not one shared success state: Instagram and Facebook are
separate destination adapters with independent delivery and reconciliation.

### Phase B — Threads and X (`DOCUMENTED / DISABLED`)

Threads and X are text-first channels for concise official line-up, confirmed
goal, confirmed red card, Full Time and verified links. They use dedicated short
British-English copy. The system must not copy every Instagram artwork or assume
an image-led post is appropriate. This section is retained only as a future
roadmap and must not create runtime work until Luiz makes a new explicit decision.

### Phase C — TikTok and YouTube Shorts (`DOCUMENTED / DISABLED`)

TikTok and YouTube Shorts remain disabled until TouchLine has an approved
premium vertical 9:16 video/Reel pipeline. Each official API requires its own
OAuth, application review, quota, content rules and current-terms verification.
A still-image adapter may not masquerade as a video integration.
No implementation is queued under the current priority.

### Phase D — LinkedIn (`DOCUMENTED / DISABLED`)

LinkedIn is reserved for institutional/product announcements and material
TouchLine milestones. It is not a high-frequency match-event feed and does not
receive automatic goal/line-up noise. No implementation is queued under the
current priority.

## Binding operational order

1. Complete the TouchLine social family and Instagram path.
2. Stabilise it and collect measured operational evidence.
3. Implement Facebook Page as a separate adapter with its own approval,
   template version, status, idempotency, quota, kill switch and reconciliation.
4. Reopen any other destination only after a new explicit Luiz decision.

No documented/disabled destination may add schema, OAuth, credentials, API work
or delivery code that delays modules 041–046.

## Admin and approval requirements

Admin shows every destination independently, including adapter version,
placement, template version, enabled/paused state, eligibility, delivery attempt,
reconciliation and analytics. Enabling one network never enables another.

Future module 046 approves the first art/base copy for an exact
destination/placement/template version. Any destination-specific layout, copy,
field, lexicon, dimension or checksum change returns that identity to
`TEMPLATE_APPROVAL_REQUIRED` without revoking an unchanged template on another
network.

## Analytics

Analytics are retained in their original network vocabulary and also mapped to
a bounded canonical model where meanings genuinely match. Reach, impressions,
saves, shares, comments, follows/profile actions, video views and completion
must not be falsely equated across networks. Optimisation decisions include the
destination, metric definition, policy version, weekday and scheduled/published
time.

## Activation gates

Before implementing each connector, TouchLine must verify the current official
API documentation, supported account type, OAuth scopes, application review,
publishing permissions, media constraints, rate limits, scheduling support,
webhooks, analytics availability, data retention and platform terms. No numeric
limit or permission may be copied from memory into runtime policy.

This roadmap does not authorise credentials, OAuth, account connection, schema,
migration, scheduler, outbound delivery, shared-QA mutation or Production work.
