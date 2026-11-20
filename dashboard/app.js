// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', set: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // It mirrors lib/model.ts (radar-4) term for term: the measured launch multiple, growth, the age
  // sweet spot, the category prior, chain breadth, and the watchlist bonus on a TVL base. A board
  // row sits on the watchlist exactly when its TVL reaches the floor: the board adds early rows
  // only below it.
  function ageScore(age, model) {
    var a = age === null || age === undefined ? model.unknown_age_days : age;
    if (a < model.age_ramp_days) return 0.55 + 0.45 * (a / model.age_ramp_days);
    if (a <= model.maturity_days) return 1;
    var over = Math.min((a - model.maturity_days) / model.age_decay_days, 1);
    return Math.max(model.age_old_score, 1 - (1 - model.age_old_score) * over);
  }
  function baseOf(row, model) {
    if (row.category === null || row.category === undefined) return model.base_multiple;
    var v = model.category_base_multiples[row.category];
    return v === undefined ? model.base_multiple : v;
  }
  function partsOf(row, model) {
    var growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growthPct / 100) * model.growth_weight;
    var maturityMult = model.maturity_floor + model.maturity_range * ageScore(row.age_days, model);
    var categoryMult = row.category !== null && row.category !== undefined && model.category_multipliers[row.category] !== undefined ? model.category_multipliers[row.category] : model.category_default;
    var extra = Math.min(Math.max((row.chains ? row.chains.length : 0) - 1, 0), model.breadth_max_extra);
    var breadthMult = 1 + model.breadth_per_chain * extra;
    var watchlistMult = row.tvl_usd >= DATA.floor_usd ? 1 + model.watchlist_bonus : 1;
    var baseMult = baseOf(row, model);
    var implied = Math.max(1, Math.round(row.tvl_usd * baseMult * growthMult * maturityMult * categoryMult * breadthMult * watchlistMult));
    return { baseMult: baseMult, growthPct: growthPct, growthMult: growthMult, maturityMult: maturityMult, categoryMult: categoryMult, breadthMult: breadthMult, watchlistMult: watchlistMult, implied: implied };
  }
  function impliedOf(row, model) { return partsOf(row, model).implied; }
  function onWatchlist(row) { return row.tvl_usd >= DATA.floor_usd; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasBand(chain) {
    if (chain === 'Ethereum') return { first: 'about $10 of gas for the first transactions', action: 'about $12 of gas', weekly: 'about $6 of gas a week' };
    if (chain === 'Solana') return { first: 'under $1 of gas for the first transactions', action: 'under $1 of gas', weekly: 'under $1 of gas a week' };
    return { first: 'about $2 of gas for the first transactions', action: 'about $4 of gas', weekly: 'about $2 of gas a week' };
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('restak') >= 0) return 'Restake $' + capital + ' of a liquid staking token through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('staking') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('btc') >= 0) return 'Deposit $' + capital + ' of BTC value through ' + name + ' on ' + chain + ' and hold the receipt token.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c === 'chain') return 'Bridge $' + capital + " to " + name + "'s chain and use it in the chain's own apps.";
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of a ' + name + ' index token on ' + chain + ' and hold it.';
    if (c.indexOf('otc') >= 0) return 'Complete one $' + capital + ' trade through ' + name + "'s desk on " + chain + '.';
    if (c.indexOf('card') >= 0) return 'Order the ' + name + ' card, load $' + capital + ' and make ordinary purchases with it.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' and keep the account active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p, capital) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('dex') >= 0) return 'Make two or three swaps of about $' + Math.max(10, Math.round(capital / 5)) + ' each week, so the wallet shows trading activity and not one deposit.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow about $' + Math.round(capital * 0.2) + ' against the position and repay it each week, so both sides of the market see the wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open and close one small trade each week and keep the margin account funded between them.';
    if (c.indexOf('prediction') >= 0) return 'Place one small position each week in a market you actually have a view on.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a small amount in each direction each week, and use the bridged funds rather than parking them.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Top the stake up by a small amount each week and claim any rewards into the same wallet.';
    return 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasBand(chain);
    var secondChain = p.chains && p.chains.length > 1
      ? ' Repeat with $' + Math.round(capital / 2) + ' on ' + p.chains[1] + ' once the first position is open, so the wallet is active on two of its ' + p.chains.length + ' chains.'
      : '';
    var ageText = p.age_days === null || p.age_days === undefined ? 'for an unrecorded stretch' : 'for ' + p.age_days + ' days';
    var g = p.change_7d;
    var growthNote = g === null || g === undefined ? ''
      : g <= -20 ? ' Its TVL fell ' + Math.abs(Math.round(g)) + '% this week, so re-check the position weekly and be ready to exit early: momentum cuts both ways.'
      : g >= 30 ? (g > 200 ? ' Its TVL more than tripled this week; do not chase the move with extra size, keep the planned amount.' : ' Its TVL grew ' + Math.round(g) + '% this week; do not chase the move with extra size, keep the planned amount.')
      : '';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas.first, time: '5 minutes' },
      { text: actionFor(p, capital, chain) + secondChain, cost: p.chains && p.chains.length > 1 ? '$' + capital + ' of capital, plus $' + Math.round(capital / 2) + ' on the second chain, and ' + gas.action : '$' + capital + ' of capital and ' + gas.action, time: '15 minutes to set up' },
      { text: weeklyFor(p, capital), cost: gas.weekly, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days: ' + p.name + ' has run ' + ageText + ' with no token on record, and launch snapshots reward wallets that were present across many of them.' + growthNote, cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('set')) state.set = params.get('set');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.set !== 'all') params.set('set', state.set);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.set === 'watchlist' && !onWatchlist(r)) return false;
      if (state.set === 'early' && onWatchlist(r)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('span', null,
          el('span', { class: 'brand-name', text: 'Token Radar' }),
          el('span', { class: 'brand-tag', text: 'Pre-token launch radar' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', { html: 'Snapshot <b>' + DATA.as_of + '</b>' }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { html: 'Model <b>' + DATA.model_version + '</b>' })
      )
    );
  }

  function trustItem(title, body) {
    return el('div', { class: 'trust-item' },
      el('span', { class: 'tick', text: '\u2713' }),
      el('div', null, el('b', { text: title }), el('span', { text: body }))
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', { class: 'lede-top' },
        el('div', null,
          el('p', { class: 'kicker', text: 'Which tokenless protocols are worth the most if they launch?' }),
          el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by implied launch value' }),
          el('p', { class: 'story', html: 'Every protocol in the snapshot with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record</b> is on this board \u2014 the house watchlist is the floor, never a ceiling. Below the floor, the early radar adds <b>' + DATA.early_size + ' smaller pre-token protocols</b> that pass the same product screen, so a wrapped, staked or bridged product of a token that already trades is never ranked at any size. Each row is scored by the one public formula below and carries a farm plan. Implied value is a model, not a promise.' })
        ),
        el('div', { class: 'facts' },
          el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
          el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
          el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
          el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
          el('p', { class: 'note', text: 'Live-token protocols are never ranked: their market cap is a fact, shown on the Live token tab, not a model output.' })
        )
      ),
      el('div', { class: 'trust' },
        trustItem('Complete coverage, stated limits', 'All ' + DATA.watchlist_size + ' watchlist protocols are ranked, plus every qualifying early row \u2014 nothing is hand-picked, and what the snapshot cannot verify is left out and says so.'),
        trustItem('One function, no favourites', 'The same public formula scores every row from its own figures, and its base is a launch multiple measured on this snapshot\u2019s traded protocols, not an asserted constant. No protocol name is special-cased.'),
        trustItem('Checkable on this page', 'Open any row: the drawer recomputes its implied value live from the raw figures and shows whether it matches board.json to the dollar.')
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var setSelect = el('select', { id: 'set', 'aria-label': 'Filter by set' },
      el('option', { value: 'all', text: 'Watchlist + early radar', selected: state.set === 'all' ? 'selected' : null }),
      el('option', { value: 'watchlist', text: 'Watchlist only', selected: state.set === 'watchlist' ? 'selected' : null }),
      el('option', { value: 'early', text: 'Early radar only', selected: state.set === 'early' ? 'selected' : null })
    );
    setSelect.addEventListener('change', function () { state.set = setSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'set', text: 'Set' }), setSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function setChip(r) {
    return onWatchlist(r)
      ? el('span', { class: 'chip watch', text: 'watchlist' })
      : el('span', { class: 'chip', text: 'early radar' });
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.set = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        'data-top': r.rank <= 3 ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: '#' + r.rank }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'meta' },
            el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }),
            setChip(r)
          )
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its score breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function factorCard(name, fx, why) {
    return el('div', { class: 'factor' }, el('b', { text: name }), el('span', { class: 'fx', text: fx }), el('span', { text: why }));
  }

  function priorGroup(title, band, rows, maxPrior) {
    if (rows.length === 0) return null;
    return el('div', { class: 'prior-group' },
      el('h3', { text: title }),
      el('div', { class: 'prior-rows' }, rows.map(function (kv) {
        return el('div', { class: 'prior-row', 'data-band': band },
          el('span', { class: 'pname', text: kv[0] }),
          el('span', { class: 'pbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(4, Math.round((kv[1] / maxPrior) * 100)) + '%' })),
          el('span', { class: 'pval', text: 'x' + kv[1].toFixed(2) })
        );
      }))
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var priors = Object.keys(m.category_multipliers).map(function (k) { return [k, m.category_multipliers[k]]; }).sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
    var maxPrior = priors.length ? priors[0][1] : 1;
    var premium = priors.filter(function (kv) { return kv[1] > 1; });
    var neutral = priors.filter(function (kv) { return kv[1] === 1; });
    var discount = priors.filter(function (kv) { return kv[1] < 1; });
    var baseRows = Object.keys(m.category_base_multiples).map(function (k) { return [k + ' \u00b7 ' + m.category_base_peers[k] + ' traded peers', m.category_base_multiples[k]]; }).sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
    var maxBase = baseRows.length ? baseRows[0][1] : 1;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures \u2014 the formula, the five factors, and every category prior are stated here in full. No protocol name is special-cased, and no row is hand-picked. In ' + DATA.model_version + ' both calibrations were measured on the snapshot itself: each prior against the share of its category that already carries a token, and the base against what the ' + m.launch_peers_total + ' already-traded protocols are worth per TVL dollar (see the README\u2019s model section for the evidence tables).' }),
      el('div', { class: 'formula' },
        'implied = max(1, round( tvl_usd \u00d7 launch multiple \u00d7 growth \u00d7 maturity \u00d7 category \u00d7 breadth \u00d7 watchlist ))'
      ),
      el('div', { class: 'factors' },
        factorCard('Launch multiple', 'median mcap \u00f7 TVL of traded peers', 'What a launched token is worth per TVL dollar, measured not asserted: per category where at least 4 of this snapshot\u2019s protocols already trade, shrunk toward the snapshot median \u00d7' + m.base_multiple + ', which is also the multiple where fewer trade. Table below.'),
        factorCard('Growth', '1 + clamp(7d, ' + m.growth_floor + ', +' + m.growth_cap + ')% \u00d7 ' + m.growth_weight, 'One week of TVL momentum, damped to \u00d70.70\u2013\u00d71.60: a signal, not a trend \u2014 it reorders neighbours, never carries a row.'),
        factorCard('Maturity', m.maturity_floor + ' + ' + m.maturity_range + ' \u00d7 ageScore', 'The age sweet spot: credibility ramps over ' + m.age_ramp_days + ' days, holds to ' + m.maturity_days + ' days, then decays toward ' + m.age_old_score + ' \u2014 the longer tokenless past prime, the likelier never. Unknown age scores as ' + m.unknown_age_days + ' days.'),
        factorCard('Category', 'prior \u00d7' + discount[discount.length - 1][1].toFixed(2) + '\u2013\u00d7' + maxPrior.toFixed(2), 'How each category\u2019s established protocols historically reached a token: fee-taking apps almost all launch; wrappers usually already are one. Full table below.'),
        factorCard('Breadth', '1 + ' + m.breadth_per_chain + ' \u00d7 extra chains (cap ' + m.breadth_max_extra + ')', 'Every extra chain is distribution a launch can drop into \u2014 capped so a chain count alone cannot carry a row.'),
        factorCard('Watchlist', '\u00d7' + (1 + m.watchlist_bonus).toFixed(2) + ' on the watchlist', 'Membership certifies the house\u2019s product screen, parent protocol included \u2014 information the ten snapshot fields cannot reproduce.')
      ),
      el('div', { class: 'priors' },
        priorGroup('Launch multiples measured on traded peers (every other category \u00d7' + m.base_multiple + ', the snapshot median)', 'base', baseRows, maxBase),
        priorGroup('Launches are the normal end state (prior above 1)', 'premium', premium, maxPrior),
        priorGroup('Neutral (prior 1.00)', 'neutral', neutral, maxPrior),
        priorGroup('Usually a token already, or an issuer\u2019s product (prior below 1)', 'discount', discount, maxPrior)
      ),
      el('p', { class: 'sub', text: 'An unlisted category scores the neutral ' + m.category_default + '. The early radar is every pre-token protocol below the watchlist floor that passes the same product screen the watchlist uses; live-token protocols are set aside with their market caps shown, never ranked.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function ageNote(row, model) {
    var a = row.age_days;
    if (a === null || a === undefined) return 'age unrecorded, scored as ' + model.unknown_age_days + ' days';
    if (a < model.age_ramp_days) return 'still earning credibility';
    if (a <= model.maturity_days) return 'in the prime launch window';
    return 'past the prime window: the longer tokenless, the likelier never';
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var parts = partsOf(row, DATA.model);
    var basePeers = row.category ? DATA.model.category_base_peers[row.category] : undefined;
    var baseDetail = basePeers !== undefined
      ? 'TVL \u00d7 ' + parts.baseMult + ' \u2014 the ' + row.category + ' launch multiple, measured on ' + basePeers + ' traded peers in this snapshot'
      : 'TVL \u00d7 ' + parts.baseMult + ' \u2014 the snapshot-wide median launch multiple, over ' + DATA.model.launch_peers_total + ' traded peers';
    var chainCount = row.chains ? row.chains.length : 0;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank #' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') }),
        el('p', { class: 'chips' }, setChip(row), el('span', { class: 'chip', text: 'TVL ' + fmtUsd(row.tvl_usd) }), el('span', { class: 'chip', text: 'age ' + fmtAge(row.age_days) }))
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var factorRows = [
      { label: 'Growth', detail: '7d ' + fmtPct(row.change_7d) + ', damped', mult: row.growth_multiplier },
      { label: 'Maturity', detail: 'age ' + fmtAge(row.age_days) + ' \u2014 ' + ageNote(row, DATA.model), mult: row.maturity_multiplier },
      { label: 'Category', detail: (row.category || 'Other') + ' launch prior', mult: row.category_multiplier },
      { label: 'Breadth', detail: chainCount + (chainCount === 1 ? ' chain' : ' chains'), mult: row.breadth_multiplier },
      { label: 'Watchlist', detail: onWatchlist(row) ? 'on the house watchlist' : 'early radar row', mult: row.watchlist_multiplier }
    ];
    var strongest = factorRows.slice().sort(function (a, b) { return b.mult - a.mult; })[0];
    var weakest = factorRows.slice().sort(function (a, b) { return a.mult - b.mult; })[0];
    var verdictText = weakest.mult < 1
      ? 'Strongest lift: ' + strongest.label.toLowerCase() + ' (' + fmtMult(strongest.mult) + '). Main drag: ' + weakest.label.toLowerCase() + ' (' + fmtMult(weakest.mult) + ').'
      : 'No factor drags this row below neutral; strongest lift is ' + strongest.label.toLowerCase() + ' (' + fmtMult(strongest.mult) + ').';
    dialog.appendChild(el('p', { class: 'verdict', html: '<b>Why this rank?</b> ' + verdictText }));
    function eqRow(label, detail, valueText, mult) {
      var kids = [
        el('span', { class: 'elabel', html: '<b>' + label + '</b>' + (detail ? ' \u00b7 ' + detail : '') }),
        el('b', { class: 'num', text: valueText })
      ];
      if (mult !== null && mult !== undefined) {
        var pct = Math.max(3, Math.min(100, Math.round(((mult - 0.6) / 1.1) * 100)));
        kids.push(el('span', { class: 'ebar' + (mult < 1 ? ' under' : ''), 'aria-hidden': 'true' }, el('i', { style: 'width:' + pct + '%' })));
      }
      return el('div', { class: 'erow' }, kids);
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Score breakdown' }),
      el('div', { class: 'equation' },
        eqRow('TVL', 'total value locked in the snapshot', fmtUsd(row.tvl_usd), null),
        eqRow('Base value', baseDetail, fmtUsd(Math.round(row.tvl_usd * parts.baseMult)), null),
        factorRows.map(function (f) { return eqRow(f.label, f.detail, fmtMult(f.mult), f.mult); }),
        el('div', { class: 'erow total' }, el('span', { class: 'elabel', text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'proof', html: '<b>Live check \u00b7 model ' + DATA.model_version + '.</b> This page recomputes the row from the raw figures as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ' \u2014 the same number board.json carries.' : ' \u2014 which differs from the board: the data would be stale.') + ' An estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
