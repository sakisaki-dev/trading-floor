# Spec: the health board (a warning light panel)

For the agent working on the sandbox page (`sandbox/page/`, built into `docs/sandbox/trading-floor.html`). Read
`docs/sandbox/README.md` first.

## Goal

One panel of lights that shows at a glance whether the economy is healthy and, when something goes wrong, what. Each
light is **green** (healthy or improving), **off** (neutral, steady) or **red** (deteriorating or in an alarm zone).

Why: in seed 88 (`sandbox/runs/saves/page-seed88-laws-w594.json`) the economy crashed while the Vault index showed rallies:
- regular trades fell to 2–10 a week while card auctions ran about 150 a week;
- the share of auctions that sold for 1 coin or less went 3% → 6% → 14% → 22%;
- 152 of 224 bots ran out of cash;
- the bid book held 3 bids against 17,086 offers.

None of that was visible without digging into the log. The board makes it visible.

## Hard rules

1. **Display only.** The board reads frames and never feeds back into the world: no engine rule, bot input, central bank or
   dealer may read a light or its thresholds. Its thresholds are presentation choices, not world laws.
2. **No hidden value in the warnings that judge the market's health,** except where marked "uses hidden value". Those
   lights are labelled as such, because no participant in the world can see them.
3. Every light shows its number, its trend and a one-line reason ("Red: 22% of auctions sold for 1 coin or less, alarm
   above 5%"). Clicking a light opens its chart, the same as the existing market stat tiles.

## How a light decides its color

For each indicator, `x` is its weekly value:

1. **Trend:** compare the 4-week average with the 12-week average. A change smaller than the indicator's dead band (default
   ±5% relative, or the absolute band given in its row) is **off**. A change in the good direction is **green**, in the bad
   direction **red**.
2. **Alarm zone:** some indicators also have an absolute alarm level. Inside it the light is **red whatever the trend**,
   and pulses.
3. **Healthy zone** (where given): a value inside it that is not getting worse is **green**, even when the trend is flat.
4. **Not enough data:** fewer than 12 weeks, or the indicator doesn't apply (credit off, no auctions), the light is
   **off** with a dim "n/a".

Put every threshold in one constants block in `ui.js` (`HEALTH`) with a comment each, so the owner can change them.

## The indicators

Grouped as the panel shows them. "Good" is the direction that turns the light green.

### Activity

| Light | Weekly value | Good | Alarm (red) | Healthy (green) | Source |
|---|---|---|---|---|---|
| Coins changing hands | coins in trades + card auction sales | up | under 25% of its own 52-week high | | `ord.coins + ord.aucCoins` |
| Sales | trades + card auction sales (count) | up | under 25% of its 52-week high | | `h.trades + ord.aucSold` |
| Bids ÷ offers | unfilled bids ÷ unfilled asks | up | under 0.05 | 0.3 to 3 | `ord.bids / ord.asks` |

### Prices

| Light | Weekly value | Good | Alarm (red) | Healthy (green) | Source |
|---|---|---|---|---|---|
| Fire sales | share of card auctions sold for 1 coin or less, or under 10% of their top bid | down | above 5% | under 1% | new: `ord.aucFree` |
| Sale vs quote | median of (auction price ÷ the card's mark the week before) | toward 1 | under 0.6 | 0.85 to 1.15 | new: `ord.aucVsMark` |
| Price index | the Vault index, once auctions count in it | up, only while Sales is not red | a fall of 30% in 8 weeks | | `h.p` |
| Marks vs sales gap | marks index ÷ Vault index | toward 1 | above 1.5 or under 0.67 | 0.9 to 1.1 | `h.pMark / h.p` |

### Money

| Light | Weekly value | Good | Alarm (red) | Healthy (green) | Source |
|---|---|---|---|---|---|
| Liquidity | coins held ÷ market value of all cards | up | under 2% | 5% to 30% | `mkt.cash / mkt.mcap` |
| Broke bots | share of bots that couldn't pay living costs this week | down | above 25% | under 5% | `mkt.broke / bots` |
| Money supply | net new coins a week ÷ coins held | toward 0 | under −3% or above +5% a week | −1% to +2% | `money` ledger (`h.money` differences if absent) |
| Cash concentration | share of all cash held by the 10% of bots with the most cash | down | above 60% | under 35% | `mkt.cashTop10` |

### Credit

| Light | Weekly value | Good | Alarm (red) | Healthy (green) | Source |
|---|---|---|---|---|---|
| Leverage | debt ÷ market value | down | above 25% | under 10% | `mkt.debt / mkt.mcap` |
| Distress | margin calls + defaults a week | down | 10 or more a week (4-week average) | 0 to 2 | `mkt.calls + mkt.defaults` |
| Forced sales | share of sales that were forced (living costs, margin, default, holding cost, tax, estate, shock) | down | above 40% | under 10% | forced sales by cause (round 1), as a share of Sales |

### Fairness

| Light | Weekly value | Good | Alarm (red) | Healthy (green) | Source |
|---|---|---|---|---|---|
| Inequality | Gini of worth | down | above 0.55 | under 0.35 | `h.gini` |
| Bottom half | wealth share of the poorer 50% | up | under 15% | above 25% | `h.share[2]` |

### Football (uses hidden value: label it so)

| Light | Weekly value | Good | Alarm (red) | Healthy (green) | Source |
|---|---|---|---|---|---|
| Prices follow the football | correlation, across players, of the 20-week change in price with the 20-week change in hidden value | up | under 0 | above 0.4 | `prices`, `values` in the frames |
| Price ÷ value | median card price ÷ hidden value | toward 1 | above 2 or under 0.5 | 0.8 to 1.25 | `h.bub` |

### Players (the bots)

| Light | Weekly value | Good | Alarm (red) | Healthy (green) | Source |
|---|---|---|---|---|---|
| Skill carries over | rank correlation of bots' returns between the last two generations (updates once a generation) | up | under 0 | above 0.2 | new: `gen.persist` at each generation end |
| Population | bots joining minus bots leaving, per 20 weeks | toward 0 or up | more than 10% of the population leaving in 20 weeks | | `people` |

## New frame fields (engine, measurement only)

Record each week in `ord` (or alongside it), from the card auctions that week:
- `aucFree`: the number sold for 1 coin or less, or under 10% of their top bid.
- `aucVsMark`: the median of price ÷ the card's mark before the auction (fewer than 5 auctions: null).

At each generation end:
- `gen.persist`: the rank correlation of bots' fitness returns this generation against last generation, over bots alive for
  both.

These are measurements of what already happened; nothing in the world reads them.

## The panel

- **Header:** an overall light and a short status. Red if any alarm light is red, or 3 or more lights are red. Off if all
  lights are green or off and at most 2 are red. Green if most lights are green and none are red. The status line names
  the reds by priority, for example "Warning: fire sales 22%, broke bots 41%, bids ÷ offers 0.002".
- **Body:** the groups above, each light a small round lamp with its label, value and trend arrow (▲ ▼ –). Red alarm lamps
  pulse. Colors come from the page's existing tokens and must read in both themes. Never rely on color alone: green also
  shows ▲ or a check, red shows ▼ or "!".
- **Timeline strip:** under the lamps, one row per group, a thin strip across all weeks colored by that group's worst
  light, so the owner can scroll back and see when trouble started. Clicking a week jumps the page to it.
- **Events:** when a light turns red from green or off, log a 'health' event once ("Fire sales above 5%: 7% of auctions
  sold for 1 coin or less"), with a cooldown of 8 weeks per light. It goes in the feed like crashes and rallies.
- **Placement:** a panel in the arrangeable layout like the others (hide, move), on by default near the top.
- **Saved runs:** the board rebuilds from a loaded save's frames. For lights whose new fields are missing (old saves),
  show "n/a" rather than guessing.

## Also (small, from the same review)

1. **A cash share panel beside Wealth share:** the same three bands (top 10%, next 40%, bottom 50%), with bots ranked by
   cash instead of worth. In seed 88 the richest bot by worth (Joan Harris, 5.49M) held 0 cash, while 10% of bots held 77%
   of all cash. The two splits tell different stories.
2. **Rename the "Richest 10% cash" tile** to "Cash held by the 10% with the most cash", so it isn't read as the wealth split.

## Acceptance checks

1. **The board on seed 88 W594 (from the save):** at about week 520 it shows red on Fire sales, Broke bots, Liquidity,
   Bids ÷ offers and Inequality, and the header shows a warning. Report the week each of those first turned red, and how
   far ahead of the crash in auction prices that was.
2. **Nothing reads the board:** grep the engine for `HEALTH` and the new display code. The engine records only the new
   measurement fields.
3. **Determinism:** the new frame fields are identical for the same seed and settings.
4. **Old saves load,** with "n/a" where fields are missing.
5. **Both themes and phone width** read correctly.

## Report back to the owner

A screenshot of the board at about weeks 400, 480 and 540 of seed 88, the week each light first turned red, and any
threshold that seemed to fire too easily or too late (as an observation; the owner decides whether to change it).
