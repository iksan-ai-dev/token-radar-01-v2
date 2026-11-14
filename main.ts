// token-radar-01 v2 — Token launch radar over DefiLlama's sealed snapshot.
// Model: a FITTED SIZE CURVE, not a flat category median. The snapshot's own
// 128 tokened comparables say log10(mcap/TVL) falls with log10(TVL): big
// protocols trade at a far smaller multiple of TVL than small ones, so a flat
// median overvalues the giants ~3x. We fit that curve at runtime (OLS on
// log10), adjust it per category with a shrunk median residual, and multiply
// by growth, age and breadth factors. Every number below is computed from the
// snapshot at runtime; nothing about any protocol is hardcoded.
// Node 22, standard library only. Deterministic: no clock, no random.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';

const REPO = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function argVal(flag: string): string | null {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1]! : null;
}
const INPUT = argVal('--input') ?? '/input/snapshot.json';
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? argVal('--output') ?? '/output';

// ---------------------------------------------------------------- helpers
const log10 = (x: number): number => Math.log10(x);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return (Date.UTC(pb[0]!, pb[1]! - 1, pb[2]!) - Date.UTC(pa[0]!, pa[1]! - 1, pa[2]!)) / 86400000;
}

// ---------------------------------------------------------------- snapshot
interface Proto {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
const snap = JSON.parse(readFileSync(INPUT, 'utf8')) as {
  as_of: string; source: string; floor_usd: number; protocols: Proto[]; watchlist: string[];
};
const protos = snap.protocols;
const bySlug = new Map(protos.map((p) => [p.slug, p]));
const watchSet = new Set(snap.watchlist);

// ------------------------------------------------------- candidate rule
// Same rule for watchlist rows and extra rows: records no token, and not a
// wrapped / staked / bridged product of a token that already trades.
const EXCLUDED_CATS = new Set([
  'Bridge', 'Canonical Bridge', 'Cross Chain Bridge',
  'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const EXCHANGES = [
  'Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini',
  'HTX', 'KuCoin', 'Crypto.com', 'Deribit', 'Bitstamp',
];
const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
function isCandidate(p: Proto): boolean {
  if (p.gecko_id !== null || p.symbol !== null) return false;
  if (p.category !== null && EXCLUDED_CATS.has(p.category)) return false;
  if (VERSION_TAIL.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  if (!(p.tvl_usd > 0)) return false;
  return true;
}

// ------------------------------------------------------- size curve fit
// Comparables: protocols whose token already trades (mcap and TVL both > 0).
const comps = protos.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
const cx = comps.map((p) => log10(p.tvl_usd));
const cy = comps.map((p) => log10(p.mcap_usd! / p.tvl_usd));
const nComp = comps.length;
const mx = cx.reduce((a, b) => a + b, 0) / nComp;
const my = cy.reduce((a, b) => a + b, 0) / nComp;
let sxx = 0, sxy = 0;
for (let i = 0; i < nComp; i++) { sxx += (cx[i]! - mx) ** 2; sxy += (cx[i]! - mx) * (cy[i]! - my); }
const slope = sxy / sxx;
const intercept = my - slope * mx;
const curveMult = (tvl: number): number => 10 ** (intercept + slope * log10(tvl));
// Residual scatter of the fit (log10), for the P25-P75 ranges.
let ssRes = 0;
for (let i = 0; i < nComp; i++) ssRes += (cy[i]! - (intercept + slope * cx[i]!)) ** 2;
const residSd = Math.sqrt(ssRes / (nComp - 2));

// Category adjustment: median residual of the category's comparables,
// shrunk toward 0 by n/(n+4) (4 pseudo-comparables). Categories with no
// comparables get no adjustment (multiplier 1).
const catResid = new Map<string, number[]>();
for (let i = 0; i < nComp; i++) {
  const c = comps[i]!.category ?? 'Uncategorised';
  const arr = catResid.get(c) ?? [];
  arr.push(cy[i]! - (intercept + slope * cx[i]!));
  catResid.set(c, arr);
}
const catAdj = new Map<string, number>();
for (const [c, rs] of catResid) {
  const shrunk = median(rs) * (rs.length / (rs.length + 4));
  catAdj.set(c, 10 ** shrunk);
}
const catMult = (cat: string | null): number => catAdj.get(cat ?? 'Uncategorised') ?? 1;

// ------------------------------------------------- leave-one-out check
// For each comparable, refit the curve WITHOUT it and predict its multiple;
// error = max(pred/actual, actual/pred). Same metric for a flat-median
// baseline. This is the proof the size curve beats the naive model.
function fitCurve(xs: number[], ys: number[]): [number, number] {
  const n = xs.length, ax = xs.reduce((a, b) => a + b, 0) / n, ay = ys.reduce((a, b) => a + b, 0) / n;
  let xx = 0, xy = 0;
  for (let i = 0; i < n; i++) { xx += (xs[i]! - ax) ** 2; xy += (xs[i]! - ax) * (ys[i]! - ay); }
  const b = xy / xx;
  return [ay - b * ax, b];
}
const looErrs: number[] = [];
let worstName = '', worstResid = -1;
for (let i = 0; i < nComp; i++) {
  const xs = cx.filter((_, j) => j !== i), ys = cy.filter((_, j) => j !== i);
  const [a2, b2] = fitCurve(xs, ys);
  const pred = a2 + b2 * cx[i]!;
  const resid = Math.abs(pred - cy[i]!);
  if (resid > worstResid) { worstResid = resid; worstName = comps[i]!.name; }
  looErrs.push(Math.max(10 ** (pred - cy[i]!), 10 ** (cy[i]! - pred)));
}
const looMed = median(looErrs);
const flatMedLog = median(cy);
const flatErrs = cy.map((y) => Math.max(10 ** (flatMedLog - y), 10 ** (y - flatMedLog)));
const flatMed = median(flatErrs);

// ------------------------------------------------------------- factors
function growthFactor(chg: number | null): number {
  if (chg === null) return 1;
  return 1 + 0.5 * clamp(chg / 25, -1, 1);
}
function ageYears(p: Proto): number | null {
  if (p.listed_at === null) return null;
  return daysBetween(p.listed_at, snap.as_of) / 365.25;
}
function ageFactor(years: number | null): number {
  if (years === null) return 1;
  if (years < 0.5) return 0.85;
  if (years < 1) return 0.95;
  if (years <= 4) return 1 + 0.05 * (years - 1);
  return Math.max(0.85, 1.15 - 0.075 * (years - 4));
}
function breadthFactor(nChains: number): number {
  return Math.min(1.25, 1 + 0.08 * Math.log(Math.max(1, nChains)));
}

// ---------------------------------------------------------- farm plans
// Gas per transaction, builder estimates, Nov 2026 (the snapshot has no gas
// data). A farm plan names a concrete action, its cost and its time.
const GAS: Record<string, number> = {
  Ethereum: 8, Solana: 0.02, Base: 0.1, Arbitrum: 0.15, Optimism: 0.12,
  'BNB Chain': 0.3, Polygon: 0.05, Avalanche: 0.4, zkSync: 0.2, Linea: 0.15,
  Scroll: 0.1, Blast: 0.1, Ink: 0.1, Tempo: 0.05, Mantle: 0.1, Sonic: 0.05,
  Berachain: 0.05, Hyperliquid: 0.01, Sui: 0.02, Aptos: 0.02,
};
const gasOf = (chain: string): number => GAS[chain] ?? 1;
const money = (x: number): string => (x >= 1 ? '$' + x.toFixed(x % 1 === 0 ? 0 : 2) : '$' + x.toFixed(2));
function familyOf(cat: string | null): string {
  switch (cat) {
    case 'Dexs': case 'Liquidity Manager': return 'dex';
    case 'Lending': case 'Collateral Markets': case 'Uncollateralized Lending': return 'lend';
    case 'Yield': case 'Yield Aggregator': case 'Farm': case 'Leveraged Farming': return 'yield';
    case 'Derivatives': case 'Perps': case 'Options': case 'Options Vault':
    case 'Basis Trading': case 'Interest Rate Derivatives': case 'Synthetics': return 'deriv';
    case 'RWA': case 'CDP': case 'CDP Manager': case 'Stablecoin Issuer':
    case 'Reserve Currency': case 'Anchor BTC': return 'rwa';
    default: return 'gen';
  }
}
const SETUP: Record<string, string> = {
  dex: 'Create a fresh wallet just for {N} on {C} and fund it with $100-$300 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  lend: 'Create a fresh wallet just for {N} on {C} and fund it with $300-$1,000 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  yield: 'Create a fresh wallet just for {N} on {C} and fund it with $200-$600 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  deriv: 'Create a fresh wallet just for {N} on {C} and fund it with $100-$500 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  rwa: 'Create a fresh wallet just for {N} on {C} and fund it with $500-$2,000 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  gen: 'Create a fresh wallet just for {N} on {C} and fund it with $100-$500 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
};
const MID: Record<string, string[]> = {
  dex: [
    'Swap $25-$100 on {N} ({C}), paying about {G} in gas; repeat a different-sized swap 1-2 times a week for 6-8 weeks so the activity looks organic, not one-off.',
    'Add $50-$200 of liquidity to {N}\u2019s main pool on {C} and leave it for at least 4 weeks; pool fees plus time-in-pool are the usual allocation signals.',
    'Try {N}\u2019s extra feature \u2014 a limit order, DCA or routed swap if offered \u2014 once a week for a month (about {G} gas each); diverse actions weigh more than repeats of one.',
  ],
  lend: [
    'Supply $100-$500 to {N} on {C}, starting with a stablecoin for low risk; gas about {G}. Keep the position open at least 6 weeks.',
    'Borrow a small amount against the collateral (keep health factor above 2) and repay part of it after 2-3 weeks; a borrow-repay cycle counts more than a single deposit.',
    'Top up or re-supply once a month for 2-3 months (about {G} per transaction) so the position shows sustained use, not a one-day park.',
  ],
  yield: [
    'Deposit $100-$500 into {N}\u2019s main vault on {C} (about {G} gas) and leave it compounding for a full points season, 6-8 weeks.',
    'Claim or re-stake rewards every 1-2 weeks (about {G} each); regular compounding is activity a points program can see.',
    'Try a second {N} strategy or vault with a smaller $50-$100 to show breadth across the product, not just one vault.',
  ],
  deriv: [
    'Open a small 1-2x leveraged position of $50-$200 on {N} ({C}), keeping liquidation far away; gas about {G}. Never size a farm trade you cannot afford to lose.',
    'Trade once a week for 6-8 weeks in varied sizes instead of one large trade; volume over time is the usual signal, and one big trade risks liquidation.',
    'If {N} offers a market-making vault or LP, add $50-$100 to it for 4+ weeks (about {G} gas) to diversify beyond directional trades.',
  ],
  rwa: [
    'Mint or buy a small RWA position of $200-$1,000 on {N} ({C}); gas about {G}. Keep the collateral ratio well above the minimum.',
    'Hold through at least one full cycle (6-8 weeks) and use the product again \u2014 a second mint or redemption \u2014 rather than parking once.',
    'Redeem a small slice after a month (about {G} gas) to show real use of mint and redeem both; then re-enter if you plan to stay positioned.',
  ],
  gen: [
    'Use {N}\u2019s core action on {C} with $50-$200 (about {G} gas) and repeat it 1-2 times a week for 6-8 weeks in varied sizes.',
    'Try a second feature of {N} (a different pool, market or vault) with $50-$100 so the activity covers more than one surface.',
    'Stay active across at least 6 different weeks; points and retro drops reward duration and consistency, not a single burst.',
  ],
};
const SAFETY = 'Only use {N}\u2019s official site linked from its own channels; never share a seed phrase or pay to \u201cclaim\u201d \u2014 real drops never ask. Log every transaction date and amount, and watch for a snapshot or claim window; missed claims expire.';
function farmSteps(p: Proto): string[] {
  const fam = familyOf(p.category);
  const chain = p.chains[0] ?? 'Ethereum';
  const g = gasOf(chain);
  const fill = (t: string): string => t
    .replaceAll('{N}', p.name).replaceAll('{C}', chain)
    .replaceAll('{G}', money(g)).replaceAll('{G8}', money(Math.max(0.2, Math.round(g * 8 * 100) / 100)));
  const steps = [fill(SETUP[fam]!), ...MID[fam]!.map(fill), fill(SAFETY)];
  for (const s of steps) {
    const t = s.trim();
    if (t.length < 20 || t.length > 600) throw new Error(`farm step out of range (${t.length}): ${t}`);
  }
  return steps;
}

// ------------------------------------------------------------- ranking
// Implied value = TVL x size-curve multiple x category adjustment x growth
// x age x breadth. Quality is 1.0 for every category: the size curve already
// penalises the giants, and the comparables rank the big Risk Curators at the
// top without any extra discount, so a 0.5 discount would double-count.
const rangeK = 10 ** (0.674 * residSd);
interface Row {
  slug: string; name: string; rank: number; implied_value_usd: number;
  farm_steps: string[]; category: string | null; chains: string[]; tvl_usd: number;
  change_7d: number | null; age_years: number | null; multiple_used: number;
  category_adj: number; growth_factor: number; age_factor: number; breadth_factor: number;
  implied_lo_usd: number; implied_hi_usd: number; slice_per_1k_usd: number;
  farm_on: string; tier: string; nearest: { slug: string; name: string; tvl_usd: number; multiple: number }[];
}
const candidates = protos.filter(isCandidate);
const compIdx = new Map(comps.map((p, i) => [p.slug, i]));
function nearestComps(p: Proto): Row['nearest'] {
  const lt = log10(p.tvl_usd);
  return [...comps]
    .map((c) => ({ c, d: Math.abs(log10(c.tvl_usd) - lt) }))
    .sort((a, b) => (a.d - b.d) || (a.c.slug < b.c.slug ? -1 : 1))
    .slice(0, 3)
    .map(({ c }) => ({ slug: c.slug, name: c.name, tvl_usd: c.tvl_usd, multiple: +(c.mcap_usd! / c.tvl_usd).toFixed(4) }));
}
const scored = candidates.map((p) => {
  const cm = curveMult(p.tvl_usd);
  const ca = catMult(p.category);
  const gf = growthFactor(p.change_7d);
  const ay = ageYears(p);
  const af = ageFactor(ay);
  const bf = breadthFactor(p.chains.length);
  const mult = cm * ca;
  const raw = p.tvl_usd * mult * gf * af * bf;
  const implied = Math.max(1, Math.min(10_000_000_000, Math.round(raw)));
  return { p, implied, mult, ca, gf, af, bf, ay };
});
scored.sort((a, b) => (b.implied - a.implied) || (a.p.slug < b.p.slug ? -1 : 1));
const rows: Row[] = scored.map((s, i) => {
  const p = s.p;
  return {
    slug: p.slug, name: p.name, rank: i + 1, implied_value_usd: s.implied,
    farm_steps: farmSteps(p), category: p.category, chains: p.chains, tvl_usd: p.tvl_usd,
    change_7d: p.change_7d, age_years: s.ay === null ? null : Math.round(s.ay * 100) / 100,
    multiple_used: +s.mult.toFixed(6), category_adj: +s.ca.toFixed(4),
    growth_factor: +s.gf.toFixed(4), age_factor: +s.af.toFixed(4), breadth_factor: +s.bf.toFixed(4),
    implied_lo_usd: Math.max(1, Math.round(s.implied / rangeK)),
    implied_hi_usd: Math.round(s.implied * rangeK),
    slice_per_1k_usd: Math.round((s.implied * 0.1 * 1000 / p.tvl_usd) * 100) / 100,
    farm_on: p.chains[0] ?? 'Ethereum',
    tier: watchSet.has(p.slug) ? 'Watchlist' : 'Below floor',
    nearest: nearestComps(p),
  };
});

// Fail fast on a board that could never pass the gate: ranks 1..N exactly
// once, implied values non-increasing with rank, every watchlist slug
// covered, and not all values identical (a board that ranks nothing).
for (let i = 0; i < rows.length; i++) {
  if (rows[i]!.rank !== i + 1) throw new Error(`rank break at row ${i}: ${rows[i]!.rank}`);
  if (i > 0 && rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) throw new Error('implied value rises with rank');
}
if (![...watchSet].every((s) => rows.some((r) => r.slug === s))) throw new Error('watchlist not fully covered');
if (new Set(rows.map((r) => r.implied_value_usd)).size < 2) throw new Error('all implied values identical');

// ------------------------------------------------------------- counts
const nTokened = protos.filter((p) => !(p.gecko_id === null && p.symbol === null)).length;
const nSetAside = protos.filter((p) => p.gecko_id === null && p.symbol === null && !isCandidate(p)).length;

// --------------------------------------------------------- dashboard data
// Compact data.js: short keys, arrays not objects, farm steps regenerated in
// the page from the same templates (the page must fit the 64 KB dossier text).
const catNames = [...new Set(rows.map((r) => r.category ?? 'Uncategorised'))].sort();
const chainNames = [...new Set(rows.map((r) => r.farm_on))].sort();
const catTable = [...catAdj.entries()]
  .map(([c, m]) => [c, +m.toFixed(3), (catResid.get(c) ?? []).length] as [string, number, number])
  .sort((a, b) => b[2] - a[2]);
const data = {
  m: {
    a: +intercept.toFixed(4), b: +slope.toFixed(4), n: nComp, sd: +residSd.toFixed(4),
    loo: +looMed.toFixed(2), flat: +flatMed.toFixed(2), rk: +rangeK.toFixed(2),
    worst: worstName, worstR: +worstResid.toFixed(2),
    asOf: snap.as_of, fl: snap.floor_usd, tot: protos.length, wl: snap.watchlist.length,
    ranked: rows.length, tok: nTokened, set: nSetAside,
  },
  cats: catNames,
  chains: chainNames,
  catT: catTable,
  c: comps.map((p) => [p.name, p.tvl_usd, p.mcap_usd!]),
  r: rows.map((r) => [
    r.rank, r.slug, r.name, catNames.indexOf(r.category ?? 'Uncategorised'),
    chainNames.indexOf(r.farm_on), r.chains.length, r.tvl_usd, r.change_7d,
    r.age_years, r.implied_value_usd, r.multiple_used, r.tier === 'Watchlist' ? 1 : 0,
    r.nearest.map((x) => compIdx.get(x.slug)!),
  ]),
};

// -------------------------------------------------------------- output
function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, e.name), d = join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (e.isFile()) copyFileSync(s, d);
  }
}
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'dashboard'), { recursive: true });
mkdirSync(join(OUT, 'screenshots'), { recursive: true });
writeFileSync(join(OUT, 'board.json'), JSON.stringify({ rows }, null, 1) + '\n', 'utf8');
copyTree(join(REPO, 'dashboard'), join(OUT, 'dashboard'));
writeFileSync(join(OUT, 'dashboard', 'data.js'), 'window.RADAR=' + JSON.stringify(data) + ';\n', 'utf8');
copyTree(join(REPO, 'screenshots'), join(OUT, 'screenshots'));
writeFileSync(join(OUT, 'dossier.json'), buildDossier(OUT, { text_max_bytes: 65536 }));
const dossierBytes = statSync(join(OUT, 'dossier.json')).size;
const dashBytes = readdirSync(join(OUT, 'dashboard')).reduce((n, f) => n + statSync(join(OUT, 'dashboard', f)).size, 0);
console.log(JSON.stringify({
  rows: rows.length, watchlistCovered: rows.filter((r) => r.tier === 'Watchlist').length,
  rank1: rows[0]!.slug, rank1Value: rows[0]!.implied_value_usd,
  intercept: +intercept.toFixed(4), slope: +slope.toFixed(4), residSd: +residSd.toFixed(4),
  loo: +looMed.toFixed(2), flat: +flatMed.toFixed(2), rangeK: +rangeK.toFixed(2),
  worst: worstName, worstResid: +worstResid.toFixed(2),
  dossierBytes, dashboardBytes: dashBytes,
  tokened: nTokened, setAside: nSetAside,
}, null, 1));
