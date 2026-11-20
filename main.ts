// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to /output/board.json, and
// copies this repository's dashboard/ and screenshots/ to /output. Last, it writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/app.css
// and dashboard/app.js read /output/data.js, which this program writes from the same board. A starting
// point, not a winner: it covers the watchlist, states the model and gives every protocol a farm plan.
// Change the model, the page or the plan; keep the gate's shape.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';
import { ageScore } from './lib/model.ts';
import type { BoardRow, RadarData } from './lib/model.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

// --- Self-check (this entry's own addition; the starter's flow ends above) ---
//
// The output bytes are the entry's contract, so this section writes nothing.
// It reads the finished files back and refuses the run if they contradict
// each other: a cheap guard against a model edit that quietly desyncs
// board.json, data.js and the screenshots, the three things the judge sees.
//
// From the files alone it proves:
//   - board.json round-trips with ranks 1..n, unique slugs, implied values
//     that are positive integers and non-increasing down the board, and as
//     many rows as the model produced;
//   - each row's implied value is the product its own record claims — TVL
//     times the base multiple times the five multipliers printed on the
//     row — within the slack those multipliers' four decimals allow;
//   - those multipliers agree with the model data.js publishes: the base
//     from the published launch-multiple table for the row's category (the
//     snapshot-wide median where the table names none), growth from the
//     row's clamped 7-day change, maturity from its age through the
//     published age curve, category from the published table, breadth from
//     its chain count, the watchlist factor either 1 or the bonus;
//   - data.js parses, declares the same board size, and carries the same
//     rank and implied value for every slug board.json ranks;
//   - the output's screenshots are the files copied above, 3 to 4 of them,
//     each under the scorer's byte cap and inside its name rule.

/** Refuse the run with one clear line, as the gate checks above refuse. */
function selfCheckFail(detail: string): never {
  process.stderr.write(`token radar: self-check failed: ${detail}\n`);
  process.exit(1);
}

/** Whether two figures agree to within `slack` of each other. */
function closeTo(actual: number, expected: number, slack: number): boolean {
  return Math.abs(actual - expected) <= slack;
}

function verifyOutputs(): void {
  let fileBoard: { rows: BoardRow[] };
  try {
    fileBoard = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')) as { rows: BoardRow[] };
  } catch {
    selfCheckFail('board.json does not parse as JSON');
  }
  const rows = fileBoard!.rows;
  if (!Array.isArray(rows)) selfCheckFail('board.json carries no rows array');
  if (rows.length !== board.length) {
    selfCheckFail(`board.json holds ${rows.length} rows, the model produced ${board.length}`);
  }

  const dataText = readFileSync(join(out, 'data.js'), 'utf8');
  if (!dataText.startsWith('window.RADAR=')) selfCheckFail('data.js does not open with the RADAR assignment');
  let radar: RadarData;
  try {
    radar = JSON.parse(dataText.slice('window.RADAR='.length).replace(/;\s*$/, '')) as RadarData;
  } catch {
    selfCheckFail('data.js does not parse as JSON');
  }
  const published = radar!.model;
  if (radar!.board_size !== rows.length) {
    selfCheckFail(`data.js declares a board of ${radar!.board_size}, board.json ranks ${rows.length}`);
  }
  if (radar!.rows.length !== rows.length) {
    selfCheckFail(`data.js carries ${radar!.rows.length} rows, board.json ranks ${rows.length}`);
  }
  const dataBySlug = new Map(radar!.rows.map((r) => [r.slug, r]));

  const seen = new Set<string>();
  let watchlistRows = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.rank !== i + 1) selfCheckFail(`${row.slug} carries rank ${row.rank} in the row numbered ${i + 1}`);
    if (seen.has(row.slug)) selfCheckFail(`${row.slug} is ranked twice`);
    seen.add(row.slug);
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd < 1) {
      selfCheckFail(`${row.slug} has implied value ${row.implied_value_usd}, not a positive integer`);
    }
    if (i > 0 && row.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      selfCheckFail(`${row.slug} outranks ${rows[i - 1]!.slug} on implied value`);
    }

    const m = row.model;
    const publishedBase =
      row.category === null ? published.base_multiple : (published.category_base_multiples[row.category] ?? published.base_multiple);
    if (Math.abs(m.base_multiple - publishedBase) > 1e-9) {
      selfCheckFail(`${row.slug} uses base multiple ${m.base_multiple}, the published model gives its category ${publishedBase}`);
    }
    if (m.age_days !== row.age_days) selfCheckFail(`${row.slug} states its age twice and disagrees with itself`);

    // Each multiplier the row claims, checked against the published model.
    // The row prints four decimals, so half a unit of the last one is fair.
    const multSlack = 0.00006;
    const growth = 1 + (m.growth_pct / 100) * published.growth_weight;
    if (!closeTo(m.growth_multiplier, growth, multSlack)) {
      selfCheckFail(`${row.slug} claims growth x${m.growth_multiplier}, its ${m.growth_pct}% week gives x${growth}`);
    }
    const maturity = published.maturity_floor + published.maturity_range * ageScore(row.age_days, published);
    if (!closeTo(m.maturity_multiplier, maturity, multSlack)) {
      selfCheckFail(`${row.slug} claims maturity x${m.maturity_multiplier}, its age gives x${maturity}`);
    }
    const category =
      row.category === null ? published.category_default : (published.category_multipliers[row.category] ?? published.category_default);
    if (!closeTo(m.category_multiplier, category, multSlack)) {
      selfCheckFail(`${row.slug} claims category x${m.category_multiplier}, the published table gives x${category}`);
    }
    const breadth = 1 + published.breadth_per_chain * Math.min(Math.max(row.chains.length - 1, 0), published.breadth_max_extra);
    if (!closeTo(m.breadth_multiplier, breadth, multSlack)) {
      selfCheckFail(`${row.slug} claims breadth x${m.breadth_multiplier}, its ${row.chains.length} chains give x${breadth}`);
    }
    if (m.watchlist_multiplier === 1 + published.watchlist_bonus) watchlistRows++;
    else if (m.watchlist_multiplier !== 1) {
      selfCheckFail(`${row.slug} claims watchlist x${m.watchlist_multiplier}, neither 1 nor the published bonus`);
    }

    // The headline figure itself: TVL times every factor printed on the row.
    const product =
      row.tvl_usd * m.base_multiple * m.growth_multiplier * m.maturity_multiplier * m.category_multiplier * m.breadth_multiplier * m.watchlist_multiplier;
    const recomputed = Math.max(1, Math.round(product));
    if (!closeTo(row.implied_value_usd, recomputed, 1 + Math.abs(product) * 0.001)) {
      selfCheckFail(`${row.slug} claims $${row.implied_value_usd}, its own factors multiply to $${recomputed}`);
    }

    const twin = dataBySlug.get(row.slug);
    if (twin === undefined) selfCheckFail(`${row.slug} is on the board but missing from data.js`);
    if (twin!.rank !== row.rank || twin!.implied_value_usd !== row.implied_value_usd) {
      selfCheckFail(`${row.slug} disagrees between board.json and data.js`);
    }
  }
  if (watchlistRows > radar!.watchlist_size) {
    selfCheckFail(`${watchlistRows} rows claim the watchlist bonus, the watchlist holds ${radar!.watchlist_size}`);
  }

  const shotDir = join(out, 'screenshots');
  const onDisk = readdirSync(shotDir).filter((name) => !name.startsWith('.') && statSync(join(shotDir, name)).isFile());
  if (onDisk.length < 3 || onDisk.length > SCREENSHOT_CAPS.max) {
    selfCheckFail(`the output holds ${onDisk.length} screenshots, the hand-in takes 3 to ${SCREENSHOT_CAPS.max}`);
  }
  if (JSON.stringify([...onDisk].sort()) !== JSON.stringify([...shots].sort())) {
    selfCheckFail('the screenshots on disk are not the ones copied from screenshots/');
  }
  for (const name of onDisk) {
    if (!IMAGE_NAME.test(name)) selfCheckFail(`screenshots/${name} breaks the name rule`);
    const bytes = statSync(join(shotDir, name)).size;
    if (bytes === 0 || bytes > SCREENSHOT_CAPS.max_bytes) {
      selfCheckFail(`screenshots/${name} is ${bytes} bytes, the cap is ${SCREENSHOT_CAPS.max_bytes}`);
    }
  }

  process.stdout.write(
    `token radar: self-check passed: ${rows.length} rows re-read and recomputed, data.js agrees row for row, ${onDisk.length} screenshots within caps\n`,
  );
}

verifyOutputs();

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
