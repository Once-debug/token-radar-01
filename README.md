# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Once-debug/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Once-debug/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: a Node 22 program that reads the sealed DefiLlama snapshot of 14 November 2026 and ranks 178 pre-token protocols by implied launch value. Its documented radar-3 model combines a TVL base with damped 7-day growth, an age sweet-spot, category launch priors calibrated on the snapshot's own launch rates, chain breadth, and a watchlist premium — and every row carries a concrete farm plan. A static dashboard ships with it, and its detail view recomputes every row live from the raw figures.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit input dir>
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=6fmsan4y&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

A program plus the static dashboard it writes. `main.ts` (Node 22, standard library only) reads the
sealed DefiLlama snapshot at `/input/snapshot.json`, ranks every protocol that records no token yet by
an implied launch value, gives each a concrete farm plan, and writes:

- `/output/board.json` — the ranked board (178 rows on the sealed snapshot),
- `/output/data.js` — the dashboard's dataset, written beside the page,
- `/output/dashboard/` — a static page (board, per-protocol detail, search and filters) that renders
  with no network,
- `/output/screenshots/` — the board, a detail view and a filtered view,
- `/output/dossier.json` — built with the kit's `vendor/makefun-board.ts`, byte-identical to the kit.

## What the board covers

The snapshot holds 758 protocols at or above $5M TVL; 342 record no token. The board ranks 178:

- **All 40 watchlist protocols.** The house's list (≥ $50M TVL, no token recorded, not a wrapped,
  staked or bridged product of a token that trades) is the floor and is covered in full.
- **Every pre-token protocol below the floor that passes the same product screen** — 138 early rows,
  not a capped sample. The screen is the visible part of the watchlist's own rule, applied from the
  ten snapshot fields alone: no `Bridge`, `Canonical Bridge`, `Liquid Staking`, `Liquid Restaking`,
  `Restaked BTC` or `CEX` category, no versioned name (a trailing `V2`, `2.0`, …), no whole word
  *wrapped*, *staked* or *staking* in the name, no exchange name opening the name. A wrapped product
  of a token that already trades is not a launch candidate at any size, so it is not ranked at $5M
  either.
- **Nothing else above the floor.** Twenty large pre-token protocols sit outside the watchlist; the
  house also screened by DefiLlama's parent protocol, a field the snapshot does not carry, so their
  exclusion cannot be verified or reproduced from the ten fields. Rather than guess, the board does
  not re-admit them.

Protocols whose token already trades are never ranked: the dashboard sets the 24 largest aside in a
Live token view with their market caps, the market's own values next to the model's.

## The value model

One function scores every row; no protocol name is special-cased anywhere. The implied value is a
product of five multipliers on a TVL base, each derived from the snapshot's own figures:

```
implied = max(1, round( tvl_usd × 0.25 × growth × maturity × category × breadth × watchlist ))
```

| Factor | Definition | Why |
| --- | --- | --- |
| Base | `tvl_usd × 0.25` | A launch is worth a fraction of the TVL standing behind it; a quarter is the conservative end of what comparable launches priced at. |
| Growth | `1 + clamp(change_7d, −60, +120)/100 × 0.5` | One week of TVL momentum is a signal, not a trend, so it is damped to ×0.70…×1.60: it can reorder neighbours, never carry a row. |
| Maturity | `0.55 + 0.55 × ageScore(age)` | The age sweet spot, below. |
| Category | prior per category, 0.75–1.20 | Categories differ in whether a token is their normal end state; see below. |
| Breadth | `1 + 0.03 × min(chains − 1, 6)` | Each extra chain is distribution a launch can drop into; capped so a chain count alone cannot carry a row. |
| Watchlist | `× 1.08` on the watchlist | Membership certifies the house's product screen *including* parent protocol, information the ten fields cannot reproduce — worth a small premium over size alone. |

**The age sweet spot.** `ageScore` ramps from 0.55 to 1 over a protocol's first 180 days (it has to
prove it can hold TVL before its launch is worth much), holds at 1 through three years — the prime
window, long enough to be a real product, early enough that a token is still the obvious next step —
then decays toward 0.45 over the next four years: a protocol that has run five-plus years with no
token is increasingly one that has chosen never to launch, and the model prices that drift instead of
rewarding age without limit. An unrecorded age scores as 365 days.

**Category priors** come from how each category's established protocols historically reached a
token. Fee-taking apps almost all launch (Dexs 1.20, Lending 1.18, CDP 1.12, Prediction
Market 1.10); yield and vault categories launch often but less uniformly (Yield 1.08); wrappers
and issuer products usually *are* a token already, or answer to an issuer that has one
(Stablecoin Wrapper 0.75, BTC wrappers 0.80). The full 33-category table is
`MODEL.category_multipliers` in `lib/model.ts`; an unlisted category scores the neutral 1.0.

**Round-2 sensitivity pass (radar-2 → radar-3).** Every prior was re-checked against the sealed
snapshot itself — for each category, the share of its protocols that already record a token
(758 protocols; 54.9% tokenized overall, 58.6% among the 319 at ≥ $50M TVL). Only moves with
clear evidence were made; each is also documented at its line in `lib/model.ts`:

| Category | Prior | Snapshot evidence |
| --- | --- | --- |
| Risk Curators | 1.02 → **0.92** | Only 5/39 tokenized (13%), 3/16 at ≥ $50M (19%) — the lowest large-sample rate in the snapshot, with billion-dollar curators 400–550 days old still tokenless. Part of the gap is youth (pre-token median age 186 days), so the cut stops well above the wrapper floor. |
| Onchain Capital Allocator | 1.02 → **0.95** | 9/29 tokenized (31%), 5/13 at ≥ $50M; pre-token members are not young (median 517 days). Allocators often sit under a parent that already has a token — a small discount, since several of the largest did launch. |
| Derivatives | 1.18 → **1.10** | 13/26 tokenized (50%), 6/9 at ≥ $50M — far below its round-1 peer tier (Dexs and Lending both convert 88% at ≥ $50M). A premium remains; parity does not survive the data. |
| Cross Chain Bridge | 0.90 → **1.02** | 6/7 tokenized (86%), the highest rate of any discounted category; its tokenized members are old, established bridges (median ≈1,690 days). Small sample (n=7), so it rises only to just above neutral. |
| Indexes | 1.00 → **1.08** | 5/6 tokenized (83%), 2/2 at ≥ $50M — an index product usually is, or launches, a token. Small sample (n=6), so the move is capped at the yield tier. |
| Basis Trading | 0.90 → **1.00** | 13/21 tokenized (62%), 6/9 at ≥ $50M — above the snapshot average on a real sample, with tokenized and pre-token ages alike (≈512 vs ≈422 days), so the gap is not an age artifact. The discount is removed, with no premium: several large basis funds are still issuer balance sheets. |
| Chain | 0.95 → **0.88** | 3/8 tokenized (38%), 1/3 at ≥ $50M, and pre-token members are old (median 872 days) — chains that were going to launch mostly have. |
| RWA | 0.85 → **0.90** | 17/33 tokenized (52%), 8/16 at ≥ $50M — the snapshot average, not wrapper behaviour; pre-token RWAs are as large as tokenized ones (median $59M vs $47M TVL). A small discount remains for the issuer-balance-sheet structure. |

Deliberately unchanged, with the check recorded in `lib/model.ts`: Dexs (73/99, 22/25 at
≥ $50M — validates 1.20) and Lending (59/75, 30/34 — validates 1.18); CDP (6/7 at ≥ $50M —
the size split validates 1.12 despite a 50% headline rate); Yield and Yield Aggregator (9/11
and 4/5 at ≥ $50M — validate 1.08); Stablecoin Wrapper (0/2, both ≥ $50M — validates the 0.75
floor); and every category with n ≤ 3 in the snapshot, where the round-1 judgement stands
rather than fitting noise.

The combined non-TVL spread is roughly ×0.4 to ×2.7 — enough for the model, not TVL, to decide the
order of any two protocols within an order of magnitude of each other, which is exactly where a
ranking earns its keep. Every row of `board.json` carries its five multipliers, and the dashboard's
detail view shows the same breakdown and recomputes the row from the raw figures to prove the page
and the board are the same arithmetic.

## Farm plans

Each row carries a six-step plan derived from its own record, never a hand-written list: the opening
action follows the category (supply to a lending market, provide liquidity to a DEX, restake, buy
cover, …), the weekly qualifying action follows it too (borrow-and-repay cycles for lending, swaps
for a DEX, small trades for perps), the capital follows the protocol's TVL tier ($50–$250), the gas
figures follow its first chain's band (Ethereum ≈ $12, Solana < $1, other chains ≈ $4), and the hold
follows its age — younger protocols get a longer qualifying window, and the step says how long the
protocol has run with no token on record.

## The dashboard

`dashboard/` is three files (index.html, app.css, app.js), fully static. The opening panel states
what the radar is and why its ranking can be checked: complete coverage with stated limits, one
public function with no name special-casing, and a live recompute proof in every row's drawer.
The board is sortable on every column and filterable by search text, category, and set
(watchlist / early radar / both); every row opens a detail drawer with a plain-language verdict
(strongest lift, main drag), a bar-scaled score breakdown, the live-check proof, and the farm
plan; a Live token tab keeps already-trading protocols visibly separate. The model panel states
the whole formula as five factor cards and renders all 33 category priors grouped by band
(above / at / below neutral) with scaled bars, instead of a single running list. The page runs
with no network.
