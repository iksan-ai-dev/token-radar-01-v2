// Token Launch Radar — renders window.RADAR (written by main.ts) with no network.
// Farm steps are regenerated here from the same templates main.ts uses for
// board.json, so the page and the board always agree.
const D = window.RADAR, M = D.m;
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const l10 = (x) => Math.log10(x);
const money = (x) => x >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : '$' + x.toFixed(0);
const moneyFull = (x) => '$' + Math.round(x).toLocaleString('en-US');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Rows: [rank,slug,name,catIdx,chainIdx,nCh,tvl,chg,age,implied,mult,wl,nearIdx[]]
const ROWS = D.r.map((r) => ({ rank: r[0], slug: r[1], name: r[2], cat: D.cats[r[3]], chain: D.chains[r[4]], nCh: r[5], tvl: r[6], chg: r[7], age: r[8], v: r[9], mult: r[10], wl: r[11] === 1, near: r[12] }));
const COMPS = D.c.map((c) => ({ name: c[0], tvl: c[1], mcap: c[2] }));
const bySlug = new Map(ROWS.map((r) => [r.slug, r]));
const slice = (r) => r.v * 0.1 * 1000 / r.tvl;
const curveMult = (tvl) => 10 ** (M.a + M.b * l10(tvl));
const growthF = (chg) => chg === null ? 1 : 1 + 0.5 * clamp(chg / 25, -1, 1);
const ageF = (y) => y === null ? 1 : y < 0.5 ? 0.85 : y < 1 ? 0.95 : y <= 4 ? 1 + 0.05 * (y - 1) : Math.max(0.85, 1.15 - 0.075 * (y - 4));
const breadthF = (n) => Math.min(1.25, 1 + 0.08 * Math.log(Math.max(1, n)));

// ------------------------------------------------------- farm templates
// Byte-identical to the templates in main.ts (same strings, same gas table).
const GAS = { Ethereum: 8, Solana: 0.02, Base: 0.1, Arbitrum: 0.15, Optimism: 0.12, 'BNB Chain': 0.3, Polygon: 0.05, Avalanche: 0.4, zkSync: 0.2, Linea: 0.15, Scroll: 0.1, Blast: 0.1, Ink: 0.1, Tempo: 0.05, Mantle: 0.1, Sonic: 0.05, Berachain: 0.05, Hyperliquid: 0.01, Sui: 0.02, Aptos: 0.02 };
const gasOf = (c) => GAS[c] ?? 1;
const m2 = (x) => x >= 1 ? '$' + x.toFixed(x % 1 === 0 ? 0 : 2) : '$' + x.toFixed(2);
function familyOf(cat) {
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
const SETUP = {
  dex: 'Create a fresh wallet just for {N} on {C} and fund it with $100-$300 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  lend: 'Create a fresh wallet just for {N} on {C} and fund it with $300-$1,000 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  yield: 'Create a fresh wallet just for {N} on {C} and fund it with $200-$600 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  deriv: 'Create a fresh wallet just for {N} on {C} and fund it with $100-$500 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  rwa: 'Create a fresh wallet just for {N} on {C} and fund it with $500-$2,000 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.',
  gen: 'Create a fresh wallet just for {N} on {C} and fund it with $100-$500 working capital plus about {G8} total gas for ~8 transactions (gas estimates, Nov 2026); keep this wallet separate from your main holdings.'
};
const MID = {
  dex: [
    'Swap $25-$100 on {N} ({C}), paying about {G} in gas; repeat a different-sized swap 1-2 times a week for 6-8 weeks so the activity looks organic, not one-off.',
    'Add $50-$200 of liquidity to {N}’s main pool on {C} and leave it for at least 4 weeks; pool fees plus time-in-pool are the usual allocation signals.',
    'Try {N}’s extra feature — a limit order, DCA or routed swap if offered — once a week for a month (about {G} gas each); diverse actions weigh more than repeats of one.'
  ],
  lend: [
    'Supply $100-$500 to {N} on {C}, starting with a stablecoin for low risk; gas about {G}. Keep the position open at least 6 weeks.',
    'Borrow a small amount against the collateral (keep health factor above 2) and repay part of it after 2-3 weeks; a borrow-repay cycle counts more than a single deposit.',
    'Top up or re-supply once a month for 2-3 months (about {G} per transaction) so the position shows sustained use, not a one-day park.'
  ],
  yield: [
    'Deposit $100-$500 into {N}’s main vault on {C} (about {G} gas) and leave it compounding for a full points season, 6-8 weeks.',
    'Claim or re-stake rewards every 1-2 weeks (about {G} each); regular compounding is activity a points program can see.',
    'Try a second {N} strategy or vault with a smaller $50-$100 to show breadth across the product, not just one vault.'
  ],
  deriv: [
    'Open a small 1-2x leveraged position of $50-$200 on {N} ({C}), keeping liquidation far away; gas about {G}. Never size a farm trade you cannot afford to lose.',
    'Trade once a week for 6-8 weeks in varied sizes instead of one large trade; volume over time is the usual signal, and one big trade risks liquidation.',
    'If {N} offers a market-making vault or LP, add $50-$100 to it for 4+ weeks (about {G} gas) to diversify beyond directional trades.'
  ],
  rwa: [
    'Mint or buy a small RWA position of $200-$1,000 on {N} ({C}); gas about {G}. Keep the collateral ratio well above the minimum.',
    'Hold through at least one full cycle (6-8 weeks) and use the product again — a second mint or redemption — rather than parking once.',
    'Redeem a small slice after a month (about {G} gas) to show real use of mint and redeem both; then re-enter if you plan to stay positioned.'
  ],
  gen: [
    'Use {N}’s core action on {C} with $50-$200 (about {G} gas) and repeat it 1-2 times a week for 6-8 weeks in varied sizes.',
    'Try a second feature of {N} (a different pool, market or vault) with $50-$100 so the activity covers more than one surface.',
    'Stay active across at least 6 different weeks; points and retro drops reward duration and consistency, not a single burst.'
  ]
};
const SAFETY = 'Only use {N}’s official site linked from its own channels; never share a seed phrase or pay to “claim” — real drops never ask. Log every transaction date and amount, and watch for a snapshot or claim window; missed claims expire.';
function farmSteps(r) {
  const fam = familyOf(r.cat), g = gasOf(r.chain);
  const fill = (t) => t.replaceAll('{N}', r.name).replaceAll('{C}', r.chain)
    .replaceAll('{G}', m2(g)).replaceAll('{G8}', m2(Math.max(0.2, Math.round(g * 8 * 100) / 100)));
  return [fill(SETUP[fam]), ...MID[fam].map(fill), fill(SAFETY)];
}

// ------------------------------------------------------------- header
$('asOf').textContent = M.asOf; $('asOf2').textContent = M.asOf;
$('stats').innerHTML = [
  [M.tot, 'protocols scanned'], [M.wl + '/' + M.wl, 'watchlist covered'],
  [M.ranked, 'pre-token ranked'], [M.tok, 'token already trades'],
  [M.set, 'set aside by rule'], [M.n, 'comparables fitted'],
].map(([b, l]) => `<div class="stat"><b>${b}</b>${l}</div>`).join('');
// Consistency: the page renders the same rows main.ts wrote to board.json.
let ok = ROWS.length === M.ranked;
for (let i = 0; i < ROWS.length; i++) if (ROWS[i].rank !== i + 1 || (i && ROWS[i].v > ROWS[i - 1].v)) ok = false;
const badge = $('badge');
badge.textContent = ok ? `page = board.json: ${ROWS.length} / ${ROWS.length} ranks and values match` : 'page = board.json: MISMATCH — do not trust this page';
if (!ok) badge.classList.add('bad');

// ------------------------------------------------------------- filters
const catSel = $('cat'), chainSel = $('chain');
D.cats.forEach((c) => catSel.insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`));
D.chains.forEach((c) => chainSel.insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`));
let sortKey = 'v';
const SORTS = {
  v: (a, b) => b.v - a.v, t: (a, b) => b.tvl - a.tvl, s: (a, b) => slice(b) - slice(a),
  g: (a, b) => (b.chg ?? -999) - (a.chg ?? -999), a: (a, b) => (b.age ?? -1) - (a.age ?? -1),
  rank: (a, b) => a.rank - b.rank, name: (a, b) => a.name.localeCompare(b.name),
  cat: (a, b) => a.cat.localeCompare(b.cat), chain: (a, b) => a.chain.localeCompare(b.chain),
  mult: (a, b) => b.mult - a.mult,
};
function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const cat = catSel.value, ch = chainSel.value, wl = $('wl').checked;
  return ROWS.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
    (!cat || r.cat === cat) && (!ch || r.chain === ch) && (!wl || r.wl));
}
function renderBoard() {
  const list = filtered().sort(SORTS[sortKey] || SORTS.v);
  const top = ROWS[0].v;
  $('rows').innerHTML = list.map((r) => {
    const chg = r.chg === null ? '—' : `<span class="${r.chg >= 0 ? 'up' : 'dn'}">${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(1)}%</span>`;
    const age = r.age === null ? '—' : r.age.toFixed(1) + 'y';
    return `<tr data-slug="${r.slug}"><td>${r.rank}</td><td><b>${esc(r.name)}</b><span class="tier ${r.wl ? 'wl' : 'bf'}">${r.wl ? 'WATCHLIST' : 'BELOW FLOOR'}</span><div style="color:var(--mut);font-size:12px">${r.slug}</div></td><td>${esc(r.cat)}</td><td>${esc(r.chain)}${r.nCh > 1 ? ' +' + (r.nCh - 1) : ''}</td><td class="num">${money(r.tvl)}</td><td class="num">${chg}</td><td class="num">${age}</td><td class="v">${money(r.v)}<div class="bar"><i style="width:${Math.max(2, r.v / top * 100)}%"></i></div></td><td class="num">${r.mult.toFixed(3)}×</td><td class="num">$${slice(r).toFixed(2)}</td></tr>`;
  }).join('');
  $('count').textContent = list.length + ' of ' + ROWS.length + ' shown';
  document.querySelectorAll('#rows tr').forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/p/' + tr.dataset.slug; }));
}
document.querySelectorAll('#board th').forEach((th) => th.addEventListener('click', () => {
  const map = { rank: 'rank', name: 'name', cat: 'cat', chain: 'chain', tvl: 't', chg: 'g', age: 'a', v: 'v', mult: 'mult', slice: 's' };
  sortKey = map[th.dataset.k] || 'v'; renderBoard();
}));
['q', 'cat', 'chain', 'wl'].forEach((id) => $(id).addEventListener('input', renderBoard));
$('sort').addEventListener('change', (e) => { sortKey = e.target.value; renderBoard(); });

// ------------------------------------------------------------- detail
function renderDetail(slug) {
  const r = bySlug.get(slug);
  const box = $('detail');
  if (!r) { box.innerHTML = ''; return; }
  const cm = curveMult(r.tvl), ca = r.mult / cm, gf = growthF(r.chg), af = ageF(r.age), bf = breadthF(r.nCh);
  const lo = Math.max(1, Math.round(r.v / M.rk)), hi = Math.round(r.v * M.rk);
  const near = r.near.map((i) => COMPS[i]).map((c) =>
    `<tr><td>${esc(c.name)}</td><td>${money(c.tvl)}</td><td>${(c.mcap / c.tvl).toFixed(3)}×</td></tr>`).join('');
  const steps = farmSteps(r).map((s) => `<li>${esc(s)}</li>`).join('');
  box.innerHTML = `<div class="dcard"><p><a href="#/">← Back to board</a></p><h2>#${r.rank} — ${esc(r.name)}</h2>
  <p class="meta">${esc(r.cat)} · ${esc(r.chain)}${r.nCh > 1 ? ' + ' + (r.nCh - 1) + ' more chains' : ''} · TVL ${moneyFull(r.tvl)} · 7d ${r.chg === null ? 'not reported' : (r.chg >= 0 ? '+' : '') + r.chg.toFixed(2) + '%'} · ${r.age === null ? 'age unknown' : r.age.toFixed(1) + ' years tracked'} · ${r.wl ? 'on the watchlist' : 'below the $50M floor'} · records no token</p>
  <div class="big">${moneyFull(r.v)}</div>
  <p class="range">Implied launch value (P25–P75 range <b>${money(lo)} – ${money(hi)}</b>) · Slice / $1K staked <b>$${slice(r).toFixed(2)}</b> if depositors get 10% pro rata</p>
  <h3>How this value was built</h3>
  <div class="kv">
    <div>TVL<b>${moneyFull(r.tvl)}</b></div>
    <div>Size-curve multiple<b>${cm.toFixed(4)}×</b></div>
    <div>Category adjustment<b>${ca.toFixed(3)}×</b></div>
    <div>Growth factor<b>${gf.toFixed(3)}×</b></div>
    <div>Age factor<b>${af.toFixed(3)}×</b></div>
    <div>Breadth factor<b>${bf.toFixed(3)}×</b></div>
  </div>
  <p class="cap">${moneyFull(r.tvl)} × ${cm.toFixed(4)} × ${ca.toFixed(3)} × ${gf.toFixed(3)} × ${af.toFixed(3)} × ${bf.toFixed(3)} = ${moneyFull(r.v)} (capped at $10B). Multiple shown on the board is curve × category = ${r.mult.toFixed(4)}×.</p>
  <h3>Farm plan — 5 steps, costed</h3><ol>${steps}</ol>
  <h3>Nearest comparables — the tokens this value is grounded in</h3>
  <table><thead><tr><th>Protocol (token trades)</th><th>TVL</th><th>Actual mcap / TVL</th></tr></thead><tbody>${near}</tbody></table>
  <p class="note">Nearest by TVL distance among the ${M.n} tokened comparables. If ${esc(r.name)} launched at its nearest comparables' multiples, its value would sit near this range — the size curve is the median of that neighbourhood, not a guess.</p>
  </div>`;
  box.scrollIntoView();
}

// ------------------------------------------------------- methodology
$('mN').textContent = M.n;
$('mEq').textContent = M.a.toFixed(4) + ' + (' + M.b.toFixed(4) + ')·log10(TVL)';
$('mB').textContent = M.b.toFixed(3);
$('mSmall').textContent = (10 ** (M.a + M.b * 7)).toFixed(2) + '×';
$('mBig').textContent = (10 ** (M.a + M.b * l10(2.76e9))).toFixed(3) + '×';
$('mSd').textContent = M.sd.toFixed(3);
$('mRk').textContent = '×' + M.rk.toFixed(2);
$('mRk2').textContent = '×' + M.rk.toFixed(2);
$('mLoo').textContent = '×' + M.loo.toFixed(2);
$('mFlat').textContent = '×' + M.flat.toFixed(2);
$('mWorst').textContent = M.worst;
$('mWorstR').textContent = M.worstR.toFixed(2);
$('scatterCap').textContent = `Each dot is one of the ${M.n} tokened comparables (log TVL vs log mcap); the line is the fitted curve log10(mcap/TVL) = ${M.a.toFixed(4)} + ${M.b.toFixed(4)}·log10(TVL), elasticity ${M.b.toFixed(3)}. The slope is negative: bigger protocols trade at a smaller multiple of TVL.`;
$('catTable').querySelector('tbody').innerHTML = D.catT.map(([c, m, n]) =>
  `<tr><td>${esc(c)}</td><td>${n}</td><td>${m.toFixed(3)}×</td></tr>`).join('');

// ------------------------------------------------------------- scatter
(function () {
  const W = 1080, H = 430, PL = 70, PR = 20, PT = 18, PB = 46;
  const xs = COMPS.map((c) => l10(c.tvl)), ys = COMPS.map((c) => l10(c.mcap));
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
  const X = (x) => PL + (x - x0) / (x1 - x0) * (W - PL - PR);
  const Y = (y) => PT + (1 - (y - y0) / (y1 - y0)) * (H - PT - PB);
  let g = '';
  for (let v = x0; v <= x1; v++) g += `<line x1="${X(v)}" y1="${PT}" x2="${X(v)}" y2="${H - PB}" stroke="#1b2836"/><text x="${X(v)}" y="${H - 26}" fill="#93a3b3" font-size="12" text-anchor="middle">$${v >= 9 ? (10 ** (v - 9)).toFixed(0) + 'B' : (10 ** (v - 6)).toFixed(0) + 'M'}</text>`;
  for (let v = y0; v <= y1; v++) g += `<line x1="${PL}" y1="${Y(v)}" x2="${W - PR}" y2="${Y(v)}" stroke="#1b2836"/><text x="${PL - 8}" y="${Y(v) + 4}" fill="#93a3b3" font-size="12" text-anchor="end">$${v >= 9 ? (10 ** (v - 9)).toFixed(0) + 'B' : (10 ** (v - 6)).toFixed(0) + 'M'}</text>`;
  const dots = COMPS.map((c) => `<circle cx="${X(l10(c.tvl)).toFixed(1)}" cy="${Y(l10(c.mcap)).toFixed(1)}" r="3.2" fill="#5aa9ff" opacity="0.75"/>`).join('');
  const lx0 = X(x0), ly0 = Y(M.a + (M.b + 1) * x0), lx1 = X(x1), ly1 = Y(M.a + (M.b + 1) * x1);
  $('scatter').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Log-log scatter of comparables with fitted curve"><text x="${PL}" y="${H - 6}" fill="#93a3b3" font-size="12">TVL (log scale) →</text><text x="14" y="${PT + 8}" fill="#93a3b3" font-size="12">mcap (log)</text>${g}${dots}<line x1="${lx0.toFixed(1)}" y1="${ly0.toFixed(1)}" x2="${lx1.toFixed(1)}" y2="${ly1.toFixed(1)}" stroke="#f5b301" stroke-width="2.5"/></svg>`;
})();

// -------------------------------------------------------------- routing
function route() {
  const h = location.hash;
  const m = h.match(/^#\/p\/([\w-]+)/);
  if (m && bySlug.has(m[1])) {
    document.querySelector('header').style.display = 'none';
    $('filters').style.display = 'none';
    document.querySelector('main').style.display = 'none';
    renderDetail(m[1]);
  } else {
    document.querySelector('header').style.display = '';
    $('filters').style.display = '';
    document.querySelector('main').style.display = '';
    $('detail').innerHTML = '';
    const qm = h.match(/^#\/board\?(.*)/);
    if (qm) {
      const p = new URLSearchParams(qm[1]);
      if (p.get('cat')) catSel.value = p.get('cat');
      if (p.get('chain')) chainSel.value = p.get('chain');
      if (p.get('wl') === '1') $('wl').checked = true;
      if (p.get('q')) $('q').value = p.get('q');
      if (p.get('sort')) { sortKey = p.get('sort'); $('sort').value = sortKey; }
    }
    renderBoard();
  }
}
window.addEventListener('hashchange', route);
route();
