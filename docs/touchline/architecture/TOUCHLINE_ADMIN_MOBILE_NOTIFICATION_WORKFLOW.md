# Admin mobile notification workflow

The admin publication screen is designed for one-player review and a strict 50-line bulk preview. Its workflow is mobile-safe: review the match result, resolve age/identity exceptions, enter a manual value, review the calculated tier/price, then use an explicit publish action.

Notification rules:

- The protected Admin queue is the immediate supported destination for
  actionable review work; each alert links to the canonical player editor.
- The local detector deduplicates candidates inside one canonical roster read.
  Cross-poll/durable deduplication requires the deferred server-owned event
  store and is not claimed here.
- Email and push are opt-in preferences only until a separately authorised delivery provider, sender identity and device registration flow are implemented.
- No private note, source note, provider valuation or manual value is put into an end-user notification.
