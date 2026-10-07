# Cadastro/register — independent linguistic coverage review

2026-10-07. User explicitly moved to the next page; Live remains PARTIAL with its separate findings retained. Scope register only, not a repeated login review. code-verification applied as read-only source/evidence inspection. No browser, test, server, build, signup, resend or source changes executed. This receipt is the only write.

## Verdict: PARTIAL; accessible busy/error state gaps

**P2 — missing register busy text/name, all8 languages.** `components/auth-form.tsx:407-410` replaces Create account with a spinner when loading or transitioning, but only login gets text (`mode === "login" ? copy.signingIn : null`). Register's button has no separate aria-label, and the spinner supplies no localized textual name. Thus the current translated action disappears during signup; no localized creating-account/status message replaces it. Suggested minimal acceptance: keep an appropriate nonempty localized accessible name throughout pending/transition, plus a clear localized busy status (reuse existing createAccount if avoiding new vocabulary, or explicitly add creatingAccount in all8). Verify actual pending state, not only idle SSR. No fix applied here.

**P2 accessibility coverage — generic register error not announced.** At line406 the asynchronous `message` is rendered in an ordinary div without role or aria-live, and submit's error handler does not move focus to it. This is distinct from the confirmation panel, which already has aria-live, and resend feedback, which already has role=status. Suggested acceptance: newly received signup/service error is exposed through an appropriate live/status/error region while preserving the visible localized message; do not broaden handler semantics or perform a real signup merely for a copy check.

## Source copy results

Read current register page, EN/PT register/form strings and ES/IT/FR/AR/TR/DE draft register/form columns, actual AuthForm render and signup/error/confirmation branches, and secondary-auth render test. All eight supply register title/description/security notice, name/email/password labels, password show/hide accessible names, eight-character hint, terms disclosure, create action, existing-account link, enabled-provider labels, confirmation and resend/error guidance. TouchLine, Google, Apple and Facebook spellings and example names remain intact. No new unequivocal missing translation or grammar/meaning error found in those inspected strings. Turkish brief informal labels alongside polite paragraphs remain an editorial style choice, not a fabricated blocking language defect.

Conditional confirmation wording preserves account-enumeration caution: description says “if this is a new account”; hint directs existing accounts to login/recovery. Source shows that panel only after signup without a session. That is not independent proof of email delivery. The general security/identity wording is inherited product copy, not evidence of identity verification or a security certification.

## Evidence reconciliation

- Current page still uses `text-start` for security notice. Prior independent banner review at `/private/tmp/touchline-test-runtime-20261007.1UPtcv/banner-rtl-review.md` records the narrow source fix and reported RED/GREEN test, without confusing SSR with visual proof.
- Earlier secondary-auth image review included FR/DE/AR register idle captures; other visual agent owned remaining locales/layout. Those are prior scoped evidence, not new inspections in this task or complete registration-state coverage. No images were reopened here.
- Current `touchline-auth-secondary-draft-render.test.mts` covers real page default-off vs isolated draft eight-language wiring/context/returnTo and banner alignment class. Its real AuthForm SSR case proves idle name/email labels, not pending, error, confirmation or resend rendering.
- Register default renderer leaves draftLocalesEnabled false; six nonpublic languages are available only in explicitly opted-in review. Back/account links use canonical auth navigation which does not publish drafts. A fixture showing a draft is not permission to enable it or proof of preserving that draft through public navigation.

## Exact remaining acceptance matrix

| State / concern | Status | Required next evidence |
| --- | --- | --- |
| Idle labels and register notice EN/PT/ES/IT/FR/AR/TR/DE | PARTIAL | Reconcile existing idle images and source snapshot; avoid repeating already evidenced idle views unnecessarily. |
| Pending signup / transition accessible action | FAIL source | Repair missing text/name, then observe pending branch in all8 without real account mutation. |
| Signup unavailable/generic error | PARTIAL with source gap | Localized visible message and announcement/focus behavior, same-flow retry preserving safe input. |
| Confirmation panel + email interpolation | PARTIAL | Eight-language rendered panel including long FR/DE copy and mixed-direction Arabic email; email proof separate. |
| Resend busy/success/error + use another email | PARTIAL | Names remain during busy (source already does); rendered status semantics and reset of prior confirmation state. No actual resend authorized here. |
| Native required/email/minlength/checkbox validation | PARTIAL | Browser-native messages may follow browser UI language, not selected game locale. Actual browser behavior not assessed here. No fabricated language-specific validation claim. |
| Consent/terms disclosure | PARTIAL | Existing full translated disclosure visible/readable and checkbox accessible; legal accuracy, backend tracking and consent storage are separate, unverified questions. |
| Arabic layout/keyboard and long text mobile/tablet | PARTIAL | Existing banner fix alone does not prove email bidi, password reveal layout, notice/terms wrapping, focus order or error/confirmation states. |
| Persistence/navigation/auth callback/email delivery | NOT VERIFIED here | Exact same-language/canonical return behavior under approved runtime gates; provider accepted vs observed delivery distinguished. |

No full register approval, native/human linguistic certification, backend auth approval, language release or deploy approval. Root owns any exact repair manifest and serialized verification. Source unchanged by this reviewer.
