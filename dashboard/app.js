/* Token Launch Radar — reads window.RADAR, renders the board. No network; every number recomputed from data.js in front of the reader. */
(() => {
  const D = window.RADAR;
  const M = D.m;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

  /* 3 significant digits everywhere */
  function usd(x) {
    if (x == null || !isFinite(x)) return '—';
    const s = (v, u) => '$' + v.toPrecision(3) + u;
    if (x >= 1e9) return s(x / 1e9, 'B');
    if (x >= 1e6) return s(x / 1e6, 'M');
    if (x >= 1e3) return s(x / 1e3, 'K');
    return '$' + x.toFixed(0);
  }
  const usdFull = (x) => '$' + Math.round(x).toLocaleString('en-US');
  /* per-$1K needs cents: integer rounding reads as a 10x error */
  function usd2(x) {
    if (x == null || !isFinite(x)) return '—';
    if (x >= 1e3) return usd(x);
    return '$' + x.toFixed(2);
  }
  /* precision follows magnitude: multiples span 0.001x to 100x */
  function fmtMult(m) {
    if (m >= 100) return Math.round(m) + '×';
    if (m >= 10) return m.toFixed(0) + '×';
    if (m >= 1) return m.toFixed(m >= 10 ? 0 : 1) + '×';
    if (m >= 0.1) return m.toFixed(2) + '×';
    if (m >= 0.01) return m.toFixed(3) + '×';
    return m.toFixed(4) + '×';
  }
  function pct(v) {
    if (v == null) return '—';
    const s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return s;
  }
  const ageStr = (a) => a == null ? '—' : a < 1 ? Math.round(a * 12) + 'mo' : a.toFixed(1) + 'y';
  const cl = (v) => v > 0.05 ? 'up' : v < -0.05 ? 'dn' : 'flat';

  /* ---------- header ---------- */
  $('asOf').textContent = M.asOf;
  $('asOf2').textContent = M.asOf;
  $('nComp').textContent = M.n;
  $('nRows').textContent = M.ranked;
  $('floor').textContent = (M.fl / 1e6).toFixed(0) + 'M';
  $('wlCov').textContent = M.wl;
  $('nTok').textContent = M.tok;
  $('nSet').textContent = M.set;
  $('catW').textContent = M.catW.toFixed(2);
  $('looN').textContent = M.n;
  $('flatMult').textContent = (10 ** D.flatLog).toFixed(3);

  const kpis = [
    ['Protocols scanned', M.tot],
    ['Pre-token ranked', M.ranked],
    ['Comparables', M.n],
    ['Watchlist', M.wl],
    ['Fit error (LOO)', M.loo.toFixed(2) + '×'],
  ];
  /* LOO: refit without one comparable, predict it, take the fold error. */
  const kpiNotes = [
    'Every protocol in the sealed snapshot, at any TVL.',
    'Pre-token protocols: watchlist first, then every candidate under the floor.',
    'Tokened protocols the curve fits on: a market cap and a TVL on record.',
    'The house list at or above the $' + (M.fl / 1e6) + 'M floor. A floor, never a ceiling.',
    'Leave-one-out: refit without each comparable, predict it, median fold error. Flat median: ' + M.flat.toFixed(2) + '×.',
  ];
  kpis.forEach(([l, v], i) => {
    const k = el('div', 'kpi' + (i === 4 ? ' hi' : ''));
    k.title = kpiNotes[i];
    k.appendChild(el('span', 'l', l));
    k.appendChild(el('span', 'v', String(v)));
    $('kpis').appendChild(k);
  });

    const FAMS = ['dex', 'lend', 'yield', 'deriv', 'rwa', 'gen'];
  /* D.cadj is one multiplier per D.cats entry; a[2] indexes it. catT is only the table's top rows. */
  /* nearest comparables by log-TVL distance, computed here from D.c */
  function nearest(tvl, k) {
    const lt = Math.log10(tvl);
    const c = D.c.map((x, i) => ({ i, d: Math.abs(Math.log10(x[1]) - lt) }));
    c.sort((a, b) => a.d - b.d || a.i - b.i);
    return c.slice(0, k).map((x) => x.i);
  }
  const GAS = {
    Ethereum: 8, Solana: 0.02, Base: 0.1, Arbitrum: 0.15, Optimism: 0.12,
    'BNB Chain': 0.3, Polygon: 0.05, Avalanche: 0.4, zkSync: 0.2, Linea: 0.15,
    Scroll: 0.1, Blast: 0.1, Ink: 0.1, Tempo: 0.05, Mantle: 0.1, Sonic: 0.05,
    Berachain: 0.05, Hyperliquid: 0.01, Sui: 0.02, Aptos: 0.02,
  };
  const rows = D.r.map((a, i) => ({
    rank: i + 1, slug: a[0], name: a[1],
    cat: D.cats[a[2]], chain: D.chains[a[3]], nchains: a[4],
    tvl: a[5], chg: a[6], age: a[7], implied: a[8],
    cm: a[9], ca: D.cadj[a[2]] ?? 1,
    gm: a[10], am: a[11], bm: a[12],
    wl: a[13] === 1, fam: FAMS[D.fam[a[2]]],
    gas: GAS[D.chains[a[3]]] ?? 1,
    lo: a[8] / M.rk, hi: a[8] * M.rk,
    slice: (a[8] * 0.1 * 1000) / a[5],
    get near() { return nearest(this.tvl, 3); },
  }));

  /* ---------- farm plan, same templates main.ts used for board.json ---------- */
  const money = (x) => x >= 1 ? '$' + (x % 1 === 0 ? x.toFixed(0) : x.toFixed(2)) : '$' + x.toFixed(2);
  function fill(t, name, chain, gas) {
    return t.replace(/\{N\}/g, name).replace(/\{C\}/g, chain)
      .replace(/\{G8\}/g, money(Math.max(0.2, Math.round(gas * 8 * 100) / 100)))
      .replace(/\{G\}/g, money(gas));
  }
  function plan(r) {
    const out = [fill(D.T.su.replace('{CAP}', D.T.cap[r.fam] ?? '$100-$500'), r.name, r.chain, r.gas)];
    for (const t of D.T.mid[r.fam]) out.push(fill(t, r.name, r.chain, r.gas));
    out.push(fill(D.T.safety, r.name, r.chain, r.gas));
    return out;
  }

  /* ---------- filters ---------- */
  const fq = $('q'), fCat = $('fCat'), fChain = $('fChain'), fTier = $('fTier'), fSort = $('fSort');
  D.cats.forEach((c) => fCat.appendChild(new Option(c, c)));
  D.chains.forEach((c) => fChain.appendChild(new Option(c, c)));

  let sortKey = 'rank', active = null;
  function view() {
    const q = fq.value.trim().toLowerCase();
    let v = rows.filter((r) => {
      if (q && !(r.name.toLowerCase().includes(q) || r.slug.includes(q))) return false;
      if (fCat.value && r.cat !== fCat.value) return false;
      if (fChain.value && r.chain !== fChain.value) return false;
      if (fTier.value === '1' && !r.wl) return false;
      if (fTier.value === '0' && r.wl) return false;
      return true;
    });
    const cmp = {
      rank: (a, b) => a.rank - b.rank,
      tvl: (a, b) => b.tvl - a.tvl,
      growth: (a, b) => (b.chg ?? -99) - (a.chg ?? -99),
      young: (a, b) => (a.age ?? 99) - (b.age ?? 99),
      slice: (a, b) => b.slice - a.slice,
    }[sortKey];
    v = v.slice().sort((a, b) => cmp(a, b) || a.rank - b.rank);
    return v;
  }

  const tbody = document.querySelector('#board tbody');
  const maxIv = Math.max(...rows.map((r) => r.implied));
  function render() {
    const v = view();
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    v.forEach((r) => {
      const tr = el('tr');
      tr.dataset.slug = r.slug;
      if (active === r.slug) tr.className = 'sel';
      const tds = [
        ['rk', r.rank],
        ['pname', r.name, r.slug],
        ['cat', r.cat || '—'],
        ['chip', r.chain + (r.nchains > 1 ? ' +' + (r.nchains - 1) : '')],
        ['num', usd(r.tvl)],
        ['num ' + cl(r.chg), pct(r.chg)],
        ['num', ageStr(r.age)],
        ['num iv', usd(r.implied)],
        ['num mult', (r.cm * r.ca).toFixed(3) + '×'],
        ['num', usd2(r.slice)],
        ['num', r.wl ? 'WATCH' : 'FLOOR'],
      ];
      tds.forEach(([c, txt, sub]) => {
        const td = el('td', c, String(txt));
        if (sub) td.appendChild(el('span', 'pslug', sub));
        tr.appendChild(td);
      });
      tr.lastChild.firstChild && (tr.lastChild.innerHTML = r.wl
        ? '<span class="tag wl">watch</span>' : '<span class="tag bf">floor</span>');
      tr.addEventListener('click', () => open(r));
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
    const ft = [fCat.value, fChain.value,
      fTier.value === '1' ? 'watchlist only' : fTier.value === '0' ? 'below floor' : '',
      fq.value.trim() && '"' + fq.value.trim() + '"'].filter(Boolean).join(' · ');
    $('count').textContent = (v.length === rows.length
      ? rows.length + ' rows · watchlist ' + D.m.wl + ' · all candidates under the floor included'
      : v.length + ' of ' + rows.length + ' rows') + (ft ? ' · ' + ft : '');
    $('clearF').hidden = !ft;
    $('sortNote').textContent = sortKey === 'rank' ? '' : 'Sorted by ' + fSort.options[fSort.selectedIndex].text.toLowerCase() + '.';
  }
  [fq, fCat, fChain, fTier].forEach((n) => n.addEventListener('input', render));
  $('clearF').addEventListener('click', () => { fq.value = ''; fCat.value = ''; fChain.value = ''; fTier.value = ''; render(); });
  fSort.addEventListener('change', () => { sortKey = fSort.value; render(); });

  /* ---------- drawer ---------- */
  const drawer = $('drawer'), body = $('drawerBody');
  function open(r) {
    active = r.slug;
    document.querySelectorAll('#board tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.slug === r.slug));
    // the headline is the product of the six published factors, so a reader
    // who multiplies them out lands on it exactly -- no hidden rounding step
    const afterB = r.implied;
    body.innerHTML = '';
    const h = el('div', 'dh');
    const left = el('div');
    left.appendChild(el('h2', null, r.name));
    left.appendChild(el('div', 'slug', '#' + r.rank + ' · ' + r.slug + ' · ' + (r.cat || 'Uncategorised') + ' · ' + r.chain));
    const right = el('div');
    const bv = el('div', 'bigval', usd(r.implied));
    bv.appendChild(el('small', null, 'IMPLIED VALUE'));
    right.appendChild(bv);
    right.appendChild(el('div', 'rangelbl', usd(r.lo) + ' – ' + usd(r.hi)));
    h.appendChild(left); h.appendChild(right);
    body.appendChild(h);

    const kv = el('div', 'kv');
    [['TVL', usd(r.tvl)], ['7-day', pct(r.chg)], ['Age', ageStr(r.age)],
     ['Chains', String(r.nchains)], ['Tier (house list)', r.wl ? 'Watchlist' : 'Below floor'],
     ['$/$1K @10% float', usd2(r.slice)],
     ['$/$1K full supply', usd2(r.slice * 10)]].forEach(([l, v]) => {
      const d = el('div');
      d.appendChild(el('span', 'l', l));
      d.appendChild(el('span', 'v', v));
      kv.appendChild(d);
    });
    body.appendChild(kv);

    body.appendChild(el('h3', null, 'How the number is built'));
    const wf = el('div', 'wf');
    const t = el('table');
    const thr = el('tr');
    ['Step', 'Value', 'Running'].forEach((h, i) => thr.appendChild(el('th', i ? 'num' : null, h)));
    const thd = el('thead'); thd.appendChild(thr); t.appendChild(thd);
    let run = r.tvl;
    const rowsWf = [
      ['TVL, from the snapshot', usdFull(r.tvl), '', null],
      ['× size curve multiple', String(r.cm), 'at this TVL on the fitted line', r.cm],
      ['× category adjustment', r.ca.toFixed(4), (r.cat || 'Uncategorised') + ', shrunk', r.ca],
      ['× growth tilt', r.gm.toFixed(4), '7-day ' + pct(r.chg) + ', coefficient ' + M.w.g, r.gm],
      ['× age tilt', r.am.toFixed(4), ageStr(r.age) + ' listed, coefficient ' + M.w.a, r.am],
      ['× breadth tilt', r.bm.toFixed(4), r.nchains + ' chain(s), coefficient ' + M.w.c, r.bm],
    ];
    rowsWf.forEach(([l, v, note, f]) => {
      if (f != null) run *= f;
      const tr = el('tr');
      tr.appendChild(el('td', null, l));
      const td = el('td', 'num', v);
      if (note) { td.appendChild(el('div', 'op', note)); }
      tr.appendChild(td);
      tr.appendChild(el('td', 'num run', usdFull(Math.round(run))));
      t.appendChild(tr);
    });
    const trS = el('tr', 'sum');
    trS.appendChild(el('td', null, '= implied value'));
    trS.appendChild(el('td', 'num', ''));
    trS.appendChild(el('td', 'num', usdFull(r.implied)));
    t.appendChild(trS);
    wf.appendChild(t);
    body.appendChild(wf);
    body.appendChild(el('p', 'cap',
      'Each tilt = 10^(w·x) to 4 dp; the multiple to 5 sig figs. The right column is their exact running product.'));
    body.appendChild(el('p', 'cap',
      'Range: the curve\'s residual SD is ' + M.sd + ' in log₁₀, so the P25–P75 band is ÷' + M.rk + ' to ×' + M.rk +
      '. Recomputed here from data.js, not copied from the board.'));

    body.appendChild(el('h3', null, 'Similar-TVL comparables'));
    const ct = el('table', 'comps');
    const thead = el('tr');
    ['Protocol', 'TVL', 'mcap ÷ TVL', 'it implies'].forEach((x, i) => thead.appendChild(el('th', i ? 'num' : null, x)));
    ct.appendChild(thead);
    r.near.forEach((i) => {
      const c = D.c[i];
      if (!c) return;
      // priced by the curve at each comparable's OWN TVL, checkable vs its real mcap
      const cMult = 10 ** (M.a + M.b * Math.log10(c[1]));
      const tr = el('tr');
      tr.appendChild(el('td', null, c[0]));
      tr.appendChild(el('td', 'num', usd(c[1])));
      const actual = c[2].toFixed(3) + '×';
      tr.appendChild(el('td', 'num', actual));
      const impliedCell = el('td', 'num', usd(Math.round(c[1] * cMult)));
      impliedCell.appendChild(el('div', 'op',
        'err ' + (c[2] / cMult).toFixed(2) + '×'));
      tr.appendChild(impliedCell);
      ct.appendChild(tr);
    });
    body.appendChild(ct);
    body.appendChild(el('p', 'cap',
      'These are tokened protocols at a similar TVL — the model\'s actual evidence. "It implies" is the curve at that protocol\'s own TVL, ' +
      'before any tilt; "err" is how far its real mcap ÷ TVL sits from that, so you can see the fit\'s own misses rather than a summary of them.'));

    body.appendChild(el('h3', null, 'Farm plan'));
    const pl = el('div', 'plan');
    const ol = el('ol');
    plan(r).forEach((s) => ol.appendChild(el('li', null, s)));
    pl.appendChild(ol);
    body.appendChild(pl);
    body.appendChild(el('div', 'note',
      'Costs are builder estimates for Nov 2026, not snapshot data, and nothing here is a promise of an allocation. ' +
      'A protocol that never launches a token pays nothing; a snapshot can pass while you are mid-farm.'));
    drawer.hidden = false;
    drawer.scrollTop = 0;
  }
  $('closeDrawer').addEventListener('click', () => { drawer.hidden = true; active = null; render(); });
  drawer.addEventListener('click', (e) => { if (e.target === drawer) { drawer.hidden = true; active = null; render(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { drawer.hidden = true; active = null; render(); } });

  /* ---------- fit tables ---------- */
  const ft = document.querySelector('#fitTable tbody');
  const fit = [
    ['log₁₀ TVL (size curve)', M.b, '—', '1.000'],
    ['7-day growth', M.tilt.g, M.tilt.tg, M.w.g],
    ['log₁₀ age (years)', M.tilt.a, M.tilt.ta, M.w.a],
    ['log₁₀ chains', M.tilt.c, M.tilt.tc, M.w.c],
  ];
  fit.forEach(([n, c, t, w]) => {
    const tr = el('tr');
    tr.appendChild(el('td', null, n));
    tr.appendChild(el('td', 'num' + (c < 0 ? ' neg' : ' pos'), typeof c === 'number' ? c.toFixed(4) : c));
    tr.appendChild(el('td', 'num', typeof t === 'number' ? t.toFixed(2) : t));
    tr.appendChild(el('td', 'num', typeof w === 'number' ? w.toFixed(5) : w));
    ft.appendChild(tr);
  });
    const fk = D.m;
  const funnelRows = [
    ['Ranked on the board (pre-token, passes the rule)', fk.ranked, 'pos'],
    ['Tokened, usable as comparables (mcap and TVL on record)', fk.n, ''],
    ['Tokened, no market cap on record (cannot price)', fk.nomc, ''],
    ['Tokened, market cap recorded as -1 (placeholder)', fk.bad, ''],
    ['Pre-token, set aside as a venue, wrapper or version tail', fk.set, ''],
  ];
  const funT = document.querySelector('#funnelTable tbody');
  if (funT) {
    let sum = 0;
    funnelRows.forEach(([n, c]) => {
      sum += c;
      const tr = el('tr');
      tr.appendChild(el('td', null, n));
      tr.appendChild(el('td', 'num', String(c)));
      tr.appendChild(el('td', 'num', (100 * c / fk.tot).toFixed(1) + '%'));
      funT.appendChild(tr);
    });
    const trT = el('tr', 'sum');
    trT.appendChild(el('td', null, 'Every protocol in the snapshot'));
    trT.appendChild(el('td', 'num', String(sum)));
    trT.appendChild(el('td', 'num', (100 * sum / fk.tot).toFixed(0) + '%'));
    funT.appendChild(trT);
  }

  const ot = document.querySelector('#oosTable tbody');
  [
    ['Curve, leave-one-out median error', M.loo.toFixed(2) + '×', 'pos'],
    ['Flat median multiple, same test', M.flat.toFixed(2) + '×', 'neg'],
    ['Fold error the curve removes', (M.flat / M.loo).toFixed(2) + '×', 'pos'],
    ['Residual SD (log₁₀)', M.sd.toFixed(3), ''],
    ['P25–P75 band', '÷' + M.rk + ' / ×' + M.rk, ''],
    ['Tilt fit on comparables with a launch date', M.tilt.n + ' of ' + M.n, ''],
  ].forEach(([l, v, k]) => {
    const tr = el('tr');
    tr.appendChild(el('td', null, l));
    tr.appendChild(el('td', 'num ' + k, v));
    ot.appendChild(tr);
  });

  /* ---------- category table ---------- */
  const ctb = document.querySelector('#catTable tbody');
  D.catT.slice(0, 14).forEach(([c, n, raw, mult]) => {
    const tr = el('tr');
    tr.appendChild(el('td', null, c));
    tr.appendChild(el('td', 'num', String(n)));
    tr.appendChild(el('td', 'num ' + (raw < 0 ? 'neg' : 'pos'), raw.toFixed(3)));
    tr.appendChild(el('td', 'num', mult.toFixed(3) + '×'));
    ctb.appendChild(tr);
  });

  /* ---------- scatter ---------- */
  (function scatter() {
    const W = 620, H = 300, P = { l: 44, r: 14, t: 12, b: 34 };
    const pts = D.c.map(([n, tvl, ratio]) => ({ n, x: Math.log10(tvl), y: Math.log10(ratio) }));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) - 0.15, x1 = Math.max(...xs) + 0.15;
    const y0 = Math.min(...ys) - 0.2, y1 = Math.max(...ys) + 0.2;
    const sx = (x) => P.l + (x - x0) / (x1 - x0) * (W - P.l - P.r);
    const sy = (y) => H - P.b - (y - y0) / (y1 - y0) * (H - P.t - P.b);
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    // grid + axes
    for (let g = Math.ceil(x0); g <= Math.floor(x1); g++) {
      s.appendChild(mk('line', { x1: sx(g), y1: P.t, x2: sx(g), y2: H - P.b, stroke: '#182231', 'stroke-width': 1 }));
      const tx = mk('text', { x: sx(g), y: H - P.b + 14, fill: '#93a8be', 'font-size': 9, 'text-anchor': 'middle' });
      tx.textContent = '$' + usd(10 ** g).replace('$', '');
      s.appendChild(tx);
    }
    for (let g = Math.ceil(y0); g <= Math.floor(y1); g++) {
      s.appendChild(mk('line', { x1: P.l, y1: sy(g), x2: W - P.r, y2: sy(g), stroke: '#182231', 'stroke-width': 1 }));
      const ty = mk('text', { x: P.l - 6, y: sy(g) + 3, fill: '#93a8be', 'font-size': 9, 'text-anchor': 'end' });
      ty.textContent = fmtMult(10 ** g);
      s.appendChild(ty);
    }
    // fitted line
    s.appendChild(mk('line', {
      x1: sx(x0), y1: sy(M.a + M.b * x0), x2: sx(x1), y2: sy(M.a + M.b * x1),
      stroke: '#f5b301', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.95,
    }));
    // points
    pts.forEach((p) => s.appendChild(mk('circle', {
      cx: sx(p.x), cy: sy(p.y), r: 2.6, fill: '#5aa9ff', opacity: 0.42,
    })));
    // highlight top 3
    rows.slice(0, 3).forEach((r) => {
      s.appendChild(mk('circle', { cx: sx(Math.log10(r.tvl)), cy: sy(Math.log10(r.implied / r.tvl)), r: 4.6, fill: 'none', stroke: '#a78bfa', 'stroke-width': 1.8 }));
    });
    const yl = mk('text', { x: 11, y: (H + P.t) / 2, fill: '#aebfd0', 'font-size': 9.5, 'text-anchor': 'middle', transform: 'rotate(-90 11 ' + (H + P.t) / 2 + ')' });
    yl.textContent = 'mcap ÷ TVL (log)';
    s.appendChild(yl);
    const lbl = mk('text', { x: W - P.r, y: P.t + 10, fill: '#b9a3fb', 'font-size': 10.5, 'text-anchor': 'end' });
    lbl.textContent = '◯ top 3 implied values';
    s.appendChild(lbl);
    const xl = mk('text', { x: (W + P.l) / 2, y: H - 4, fill: '#8a9bad', 'font-size': 9.5, 'text-anchor': 'middle' });
    xl.textContent = 'TVL (log scale)';
    s.appendChild(xl);
    $('scatter').appendChild(s);
    $('slopeNote').textContent = 'Slope ' + M.b.toFixed(3) +
      ': every ten-fold increase in TVL lowers the multiple by ' + (M.b < 0 ? 'a factor of ' : '×') +
      (10 ** M.b).toFixed(3) + '. The intercept puts a $1M-TVL protocol at ' + (10 ** (M.a + M.b * 6)).toFixed(2) + '× and a $1B one at ' +
      (10 ** (M.a + M.b * 9)).toFixed(3) + '×.';
    $('scatterCap') && ($('scatterCap').textContent = '');
  })();

  render();

  /* deterministic deep links for the screenshots: #/p/<slug>, #/f/<cat> */
  function fromHash() {
    const h = location.hash || '';
    let m = /^#\/p\/(.+)$/.exec(h);
    if (m) {
      const r = rows.find((x) => x.slug === decodeURIComponent(m[1]));
      if (r) { open(r); return; }
    }
    m = /^#\/f\/(.*)$/.exec(h);
    if (m) {
      const c = decodeURIComponent(m[1]);
      fCat.value = D.cats.includes(c) ? c : '';
      render();
    }
  }
  fromHash();
  window.addEventListener('hashchange', () => {
    drawer.hidden = true; active = null; render(); fromHash();
  });

  window.__radar = { rows, open, render };
})();
