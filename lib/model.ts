// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// pre-token protocol below the watchlist floor that passes the same product screen the house applies
// to the watchlist itself (see isProduct below): the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board. Above the floor the board takes the watchlist and nothing else: the house also
// screened those protocols by parent protocol, a field the snapshot does not carry, so a large
// protocol the list leaves out cannot be verified from the ten fields and is not re-admitted.
//
// Implied value (model radar-2) follows only from the snapshot's own figures, as a product of five
// multipliers on a TVL base, so the ranking is a value model and not a TVL sort:
//
//   base       = tvl_usd x BASE_MULTIPLE          (a launch is worth a fraction of the TVL behind it)
//   growth     = 1 + clamp(change_7d, -60, 120)/100 x GROWTH_WEIGHT
//                                                 (a week of TVL momentum, damped: one week is a
//                                                  signal, not a trend, so it can move a row by at
//                                                  most x0.70..x1.60)
//   maturity   = MATURITY_FLOOR + MATURITY_RANGE x ageScore(age_days)
//                                                 (the age sweet spot: a protocol earns credibility
//                                                  over its first AGE_RAMP_DAYS, sits in a prime
//                                                  window until MATURITY_DAYS, then decays toward
//                                                  AGE_OLD_SCORE over AGE_DECAY_DAYS, because a
//                                                  protocol that has run five-plus years with no
//                                                  token is increasingly one that never launches)
//   category   = CATEGORY_MULTIPLIERS[category]   (a prior from how each category's established
//                                                  protocols historically reached a token: fee-taking
//                                                  apps (Dexs, Lending, Derivatives) almost all launch;
//                                                  wrappers and issuers (stablecoin wrappers, BTC
//                                                  wrappers, RWA issuers) usually are the token
//                                                  already, or answer to an issuer that has one)
//   breadth    = 1 + BREADTH_PER_CHAIN x min(chains - 1, BREADTH_MAX_EXTRA)
//                                                 (every extra chain is distribution a launch can
//                                                  drop into; capped so a chain count alone cannot
//                                                  carry a row)
//   watchlist  = 1 + WATCHLIST_BONUS when the protocol is on the house watchlist
//                                                 (membership certifies the house's own product
//                                                  screen, parent protocol included, which the ten
//                                                  fields cannot reproduce: information beyond size)
//   implied    = max(1, round(base x growth x maturity x category x breadth x watchlist))
//
// The constants are the model's, stated in the dashboard and changeable in one place. No protocol name
// is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  age_ramp_days: number;
  age_decay_days: number;
  age_old_score: number;
  breadth_per_chain: number;
  breadth_max_extra: number;
  watchlist_bonus: number;
  category_default: number;
  category_multipliers: Record<string, number>;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.55,
  maturity_days: 1095,
  unknown_age_days: 365,
  age_ramp_days: 180,
  age_decay_days: 1460,
  age_old_score: 0.45,
  breadth_per_chain: 0.03,
  breadth_max_extra: 6,
  watchlist_bonus: 0.08,
  category_default: 1.0,
  // One prior per DefiLlama category, from how that category's established protocols reached a
  // token: above 1 where a launch is the category's normal end state, below 1 where the product
  // itself is usually a token already (a wrapper) or an issuer's balance sheet (RWA, basis funds).
  category_multipliers: {
    Dexs: 1.2,
    Lending: 1.18,
    Derivatives: 1.18,
    'Interest Rate Derivatives': 1.12,
    CDP: 1.12,
    'Prediction Market': 1.1,
    Yield: 1.08,
    'Yield Aggregator': 1.08,
    'Uncollateralized Lending': 1.08,
    'Leveraged Farming': 1.06,
    Farm: 1.05,
    'CDP Manager': 1.05,
    'Collateral Markets': 1.05,
    'Risk Curators': 1.02,
    'Onchain Capital Allocator': 1.02,
    Restaking: 1.0,
    'Liquidity Manager': 1.0,
    Indexes: 1.0,
    Chain: 0.95,
    Insurance: 0.95,
    'Basis Trading': 0.9,
    Payments: 0.9,
    'Governance Incentives': 0.9,
    'Cross Chain Bridge': 0.9,
    'OTC Marketplace': 0.9,
    RWA: 0.85,
    'Staking Pool': 0.85,
    CeDeFi: 0.85,
    'Crypto Card Issuer': 0.85,
    'Anchor BTC': 0.8,
    'Decentralized BTC': 0.8,
    'Stablecoin Wrapper': 0.75,
    'Dual-Token Stablecoin': 0.75,
  },
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    category_multiplier: number;
    breadth_multiplier: number;
    watchlist_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  category_multiplier: number;
  breadth_multiplier: number;
  watchlist_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * Where an age sits in the launch window, 0..1: ramps up over the first `age_ramp_days` (a protocol
 * has to prove it can hold TVL before its launch is worth much), holds at 1 through `maturity_days`,
 * then decays toward `age_old_score` over `age_decay_days` (the longer a protocol runs tokenless past
 * its prime, the more likely tokenless is its permanent state). An unknown age scores as
 * `unknown_age_days`, the snapshot's middle of the road.
 */
export function ageScore(age: number | null, model: ModelConstants): number {
  const a = age ?? model.unknown_age_days;
  if (a < model.age_ramp_days) return 0.55 + 0.45 * (a / model.age_ramp_days);
  if (a <= model.maturity_days) return 1;
  const over = Math.min((a - model.maturity_days) / model.age_decay_days, 1);
  return Math.max(model.age_old_score, 1 - (1 - model.age_old_score) * over);
}

/** The category's launch prior: the table's value, or the neutral default when it names none. */
export function categoryMultiplier(protocol: SnapshotProtocol, model: ModelConstants): number {
  if (protocol.category === null) return model.category_default;
  return model.category_multipliers[protocol.category] ?? model.category_default;
}

/** The chain-breadth factor: the first chain is the product, each further one is distribution. */
export function breadthMultiplier(protocol: SnapshotProtocol, model: ModelConstants): number {
  const extra = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra);
  return 1 + model.breadth_per_chain * extra;
}

/** Every multiplier and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  onWatchlist: boolean,
): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  categoryMult: number;
  breadthMult: number;
  watchlistMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = model.maturity_floor + model.maturity_range * ageScore(age, model);
  const categoryMult = categoryMultiplier(protocol, model);
  const breadthMult = breadthMultiplier(protocol, model);
  const watchlistMult = onWatchlist ? 1 + model.watchlist_bonus : 1;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * categoryMult * breadthMult * watchlistMult));
  return { implied, growthPct, growthMult, maturityMult, categoryMult, breadthMult, watchlistMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The watchlist rule's product words: a name carrying one is a product of another protocol. */
const PRODUCT_NAME = /\b(wrapped|staked|staking)\b/i;

/** The watchlist rule's exchange prefixes: a name opening with one is that exchange's product. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Categories that are a wrapped, staked or bridged product of a token that already trades, or an exchange. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a wrapped, staked or bridged product of another protocol, or a versioned pool
 * of one: the visible part of the watchlist's own screen, from the ten fields alone. (The house also
 * reads DefiLlama's parent protocol, which the snapshot does not carry; that is why the board adds
 * early rows only below the floor, where the house's list makes no claim either way.)
 */
export function isProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (PRODUCT_NAME.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x));
}

/** Whether a protocol is one the board may rank: pre-token and not another protocol's product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isProduct(p);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every pre-token protocol below the watchlist floor that passes the product
  // screen, not a capped sample of them: a radar that silently drops candidates below an arbitrary
  // cut is a table with a lid on it. Never a replacement for a watchlist row: a chosen protocol
  // stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, watchlist.has(p.slug));
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      category_multiplier: round4(s.categoryMult),
      breadth_multiplier: round4(s.breadthMult),
      watchlist_multiplier: round4(s.watchlistMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What gas costs on a chain, in the plain bands a farmer budgets by. */
function gasBand(chain: string): { first: string; action: string; weekly: string } {
  if (chain === 'Ethereum') return { first: 'about $10 of gas for the first transactions', action: 'about $12 of gas', weekly: 'about $6 of gas a week' };
  if (chain === 'Solana') return { first: 'under $1 of gas for the first transactions', action: 'under $1 of gas', weekly: 'under $1 of gas a week' };
  return { first: 'about $2 of gas for the first transactions', action: 'about $4 of gas', weekly: 'about $2 of gas a week' };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('restak')) return `Restake $${capital} of a liquid staking token through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the position open.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('btc')) return `Deposit $${capital} of BTC value through ${name} on ${chain} and hold the receipt token.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c === 'chain') return `Bridge $${capital} to ${name}'s chain and use it in the chain's own apps.`;
  if (c.includes('index')) return `Buy $${capital} of a ${name} index token on ${chain} and hold it.`;
  if (c.includes('otc')) return `Complete one $${capital} trade through ${name}'s desk on ${chain}.`;
  if (c.includes('card')) return `Order the ${name} card, load $${capital} and make ordinary purchases with it.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} and keep the account active.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, by category: the activity a launch snapshot would count. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('dex')) return `Make two or three swaps in the pool each week, so the wallet shows trading activity and not one deposit.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against the position and repay it each week, so both sides of the market see the wallet.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Open and close one small trade each week and keep the margin account funded between them.`;
  if (c.includes('prediction')) return `Place one small position each week in a market you actually have a view on.`;
  if (c.includes('bridge')) return `Bridge a small amount in each direction each week, and use the bridged funds rather than parking them.`;
  if (c.includes('restak') || c.includes('staking')) return `Top the stake up by a small amount each week and claim any rewards into the same wallet.`;
  return `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasBand(chain);
  const action = actionFor(p, capital, chain);
  const ageText = age === null ? 'for an unrecorded stretch' : `for ${age} days`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: gas.first,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas.action}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: gas.weekly,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days: ${p.name} has run ${ageText} with no token on record, and launch snapshots reward wallets that were present across many of them.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    category_multiplier: row.model.category_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    watchlist_multiplier: row.model.watchlist_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
