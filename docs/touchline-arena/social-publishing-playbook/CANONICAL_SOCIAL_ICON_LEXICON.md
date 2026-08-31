# Canonical Social Icon Lexicon

Status: **proposal for editorial and accessibility review; no runtime implementation authorised**.

Instagram and Club Owner Timeline use the same subject-to-emoji mapping in British English copy. A channel adapter cannot choose a random substitute, change the meaning, or add decoration unrelated to a verified fact.

Inside an image or video, use only the exact canonical TouchLine icons already present in the approved site/component. Emojis belong to copy only; they must not replace, redraw or approximate a site icon.

## Lexicon

| Subject | Copy emoji | Canonical meaning |
| --- | --- | --- |
| Goal | ⚽ | Verified goal event |
| Red card | 🟥 | Verified red-card event |
| Yellow card | 🟨 | Verified yellow-card event |
| Official line-up | 📋 | Complete, verified official line-up |
| Full Time | 🏁 | Fixture in canonical final state |
| Ranking / leader | 🏆 | Current or final leader, labelled accurately |
| Match Rating / Top Card | ⭐ | Verified Official Match Rating or Top Match Card |
| Card Duel | ⚔️ | Approved pre-match TouchLine Card Duel |
| Hat-trick | 🎩 | Exactly three verified goals by one player in the fixture |
| Stadium / match preview | 🏟️ | Verified venue or fixture preview |
| Countdown / time | ⏱️ | Authoritative time or countdown |
| Stats | 📊 | Verified statistics |
| Form / streak | 🔥 | Verified form or streak with a defined window |
| Engagement / watch | 👀 | Non-factual audience CTA to watch or respond |
| Market Closed | 🔒 | Canonical market state is closed |
| Market Open | 🟢 | Canonical market state is open |

## Use limits

- Use at most one leading subject emoji per heading, sentence or semantic block.
- Default maximum: three distinct emojis in one Feed caption and two in one Story/Reel text panel. A verified goal list may reuse ⚽ without each repetition counting as a new subject, but visual clutter remains a review failure.
- Do not stack emojis, repeat them for emphasis, or use them as punctuation.
- Do not add unlisted emojis without updating this reviewed lexicon and its versioned copy contract.
- Prefer no emoji when the subject is already unmistakable and the symbol would add noise.
- Hashtags never contain or substitute for the semantic emoji.

## Meaning and accessibility

- Every emoji must be adjacent to a clear British English text label; meaning must remain complete if emoji rendering or colour is unavailable.
- Never communicate open/closed, card colour, rank, event type or provisional/final state by icon or colour alone.
- Use the written labels `Goal`, `Red card`, `Yellow card`, `Official line-up`, `Full Time`, `Current leader`, `Match Rating`, `Market open` and `Market closed` as appropriate.
- If the publishing channel permits accessible descriptions, describe the verified event/state in words rather than listing emoji names.
- Screen-reader and plain-text review must pass with emojis removed.
- Platform or font rendering differences must not change the factual interpretation.

## Fail-closed rules

- An icon cannot upgrade an unverified fact: 📋 is prohibited for a partial/probable line-up; 🏁 is prohibited before canonical final status; 🎩 is prohibited unless three goals reconcile with official events.
- ⭐ never converts Official Match Rating into TouchLine Total Rating or points. The adjacent label must identify the metric.
- 🏆 must say whether the leader is current/provisional or final; it cannot imply the Gameweek is complete while fixtures remain.
- 🟢 and 🔒 present the market state only. They never imply that player or coach scoring starts, stops or waits for the market.
- A channel adapter may omit an emoji for space/accessibility but may not replace it with a different semantic emoji.
