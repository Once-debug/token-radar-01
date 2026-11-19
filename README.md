# Token Radar — a token launch radar (model radar-2)

A program plus the static dashboard it writes. `main.ts` (Node 22, standard library only) reads the
sealed DefiLlama snapshot at `/input/snapshot.json`, ranks every protocol that records no token yet by
an implied launch value, gives each a concrete farm plan, and writes:

- `/output/board.json` — the ranked board (178 rows on the sealed snapshot),
- `/output/data.js` — the dashboard's dataset, written beside the page,
- `/output/dashboard/` — a static page (board, per-protocol detail, search and filters) that renders
  with no network,
- `/output/screenshots/` — the board, a detail view and a filtered view,
- `/output/dossier.json` — built with the kit's `vendor/makefun-board.ts`, byte-identical to the kit.

Run it the way the starter describes:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit input dir>
```

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
token. Fee-taking apps almost all launch (Dexs 1.20, Lending 1.18, Derivatives 1.18, CDP 1.12,
Prediction Market 1.10); yield and vault categories launch often but less uniformly (Yield 1.08,
Risk Curators 1.02, Onchain Capital Allocator 1.02); wrappers and issuer products usually *are* a
token already, or answer to an issuer that has one (Stablecoin Wrapper 0.75, BTC wrappers 0.80,
RWA 0.85, Basis Trading 0.90). The full 33-category table is `MODEL.category_multipliers` in
`lib/model.ts`; an unlisted category scores the neutral 1.0.

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

`dashboard/` is three files (index.html, app.css, app.js) in the starter's plain theme. The board is
sortable on every column and filterable by search text, category, and set (watchlist / early radar /
both); every row opens a detail drawer with the full score breakdown and the farm plan; a Live token
tab keeps already-trading protocols visibly separate. The page states the whole model, category
priors included, and runs with no network.
