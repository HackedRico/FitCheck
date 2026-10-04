# Verdict rules

`fitcheck.verdict.decide(candidate, closet, week, today)` is pure and deterministic. Days and events before `today` are ignored. A missing forecast or an empty calendar just means no weather or event gap.

## Terms

| Term | Rule |
| --- | --- |
| Duplicate | Same category, same color family, same pattern, formality within 1 |
| Pairing | Categories worn together (below), formality within 1, and at least one of the two is solid |
| Statement piece | Color family `multi`, or pattern floral, graphic or other. Stripes and checks count as basics |
| Wet day | `precipitation_mm >= 1.0` or `precipitation_probability >= 60` |
| Rain gap | 2 or more wet days, no waterproof outerwear owned, candidate is waterproof outerwear |
| Cold gap | A day with `temp_min_c <= 5`, no outerwear with warmth 4 or more owned, candidate is outerwear with warmth 4 or more |
| Event gap | An occasion with formality 4 or more, nothing owned in the candidate's category at formality `event - 1` or above, candidate at `event - 1` or above |

Categories worn together, read both ways: top with bottom, outerwear, shoes. Sweater with bottom, outerwear, shoes, shirt, dress. Shirt with bottom, outerwear, shoes. Outerwear with dress and bottom. Dress with shoes. Bottom with shoes. Accessory with every category but accessory.

## Decision, first match wins

| Order | When | Decision |
| --- | --- | --- |
| 1 | The candidate fills any gap. Nothing owned covers that need, so nothing counts as a duplicate | BUY |
| 2 | 2 or more duplicates | SKIP |
| 3 | No duplicates, not a statement piece, 3 or more pairings | BUY |
| 4 | No pairings | SKIP |
| 5 | Anything else: one duplicate, a statement piece, or 1 to 2 pairings | TRY_WITH |

Pairings are ranked by closest formality, then most wears, then closet order. `best_pairing` is the first one, set on BUY and TRY_WITH.

## Reasons

Reasons come in this order and carry the garment ids they refer to: `duplicates`, `fills_weather_gap` (rain, then cold), `fits_event` (by start time), `statement_piece`, then one pairing reason. The pairing reason is `pairs_well` with 3 or more pairings, `few_pairings` otherwise. A duplicate SKIP carries only `duplicates`.

The headline is one spoken sentence with no dashes, led by the first reason that decided it, for example "Buy it: you own no rain shell and rain is due on 3 of the next 7 days."
