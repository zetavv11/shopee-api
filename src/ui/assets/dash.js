(function () {
  'use strict';
  var boot = JSON.parse(document.getElementById('boot').textContent);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------- util ----------
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var nf = new Intl.NumberFormat('id-ID');
  var rp = function (n) { return 'Rp\u00a0' + nf.format(Math.round(n || 0)); };
  function compact(n) {
    n = Math.round(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'jt';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'rb';
    return String(n);
  }
  var tz = { timeZone: 'Asia/Jakarta' };
  function fdate(iso, withTime) {
    if (!iso) return '—';
    var d = new Date(iso);
    var o = Object.assign({ day: '2-digit', month: 'short' }, tz);
    if (withTime) Object.assign(o, { hour: '2-digit', minute: '2-digit', hour12: false });
    return d.toLocaleString('id-ID', o).replace(/\./g, ':').replace(',', '');
  }
  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    return Math.floor(s / 86400) + ' hari lalu';
  }
  function toast(msg, bad) {
    var host = $('.toast-host');
    var t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, 3600);
  }
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch('/admin/api' + path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (res.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); throw new Error('login'); }
        if (!res.ok || json.success === false) {
          var e = new Error((json.error && json.error.message) || 'Permintaan gagal (' + res.status + ').');
          e.code = json.error && json.error.code;
          throw e;
        }
        return json;
      });
    });
  }
  function copy(text) {
    var done = function () { toast('Disalin: ' + text.slice(0, 40)); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
  }
  function countUp(el, to, fmt) {
    var from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    var t0 = performance.now();
    var dur = 650;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  // ---------- tabs ----------
  var TABS = ['ringkasan', 'transaksi', 'uji', 'sistem'];
  var loaded = {};
  function showTab() {
    var name = (location.hash || '#ringkasan').slice(1);
    if (TABS.indexOf(name) < 0) name = 'ringkasan';
    $$('[data-tab]').forEach(function (s) { s.classList.toggle('hide', s.dataset.tab !== name); });
    $$('.nav a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + name); });
    if (name === 'ringkasan') loadOverview();
    if (name === 'transaksi') loadTx();
    if (name === 'sistem' && !loaded.sys) loadSystem();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', showTab);

  // ---------- ringkasan ----------
  var range = 30;
  var lastOverview = null;
  function loadOverview(silent) {
    return api('/overview?days=' + range).then(function (r) {
      lastOverview = r.data;
      renderOverview(r.data);
      setLive(true);
    }).catch(function (e) { setLive(false); if (!silent && e.message !== 'login') toast(e.message, true); });
  }
  function setLive(ok) {
    var l = $('.live');
    l.className = 'live ' + (ok ? 'ok' : 'bad');
    $('span', l).textContent = ok ? 'tersambung' : 'terputus';
  }
  function delta(v) {
    if (v === null) return '<span class="delta up">baru</span>';
    if (v === 0) return '<span class="delta flat">± 0%</span>';
    return '<span class="delta ' + (v > 0 ? 'up' : 'down') + '">' + (v > 0 ? '▲ ' : '▼ ') + Math.abs(v) + '%</span>';
  }
  function dur(s) {
    if (s === null) return '—';
    if (s < 60) return s + ' dtk';
    if (s < 3600) return Math.round(s / 60) + ' mnt';
    return (s / 3600).toFixed(1) + ' jam';
  }
  function renderOverview(d) {
    var t = d.totals;
    $('#hero-label').textContent = 'Total masuk · ' + d.range_days + ' hari terakhir';
    $('#hero-big').classList.remove('skel');
    countUp($('#hero-big'), t.paid_amount, function (v) { return Math.round(v).toLocaleString('id-ID'); });
    $('#hero-sub').innerHTML =
      '<span><b class="num">' + nf.format(t.paid_count) + '</b> transaksi lunas</span>' +
      '<span>rata-rata <b class="num">' + rp(t.average_ticket) + '</b></span>' +
      '<span>terbesar <b class="num">' + rp(t.biggest_ticket) + '</b></span>';
    $('#side-today').innerHTML =
      '<div class="row"><span class="eyebrow">Hari ini</span>' + delta(d.today.vs_yesterday_amount) + '</div>' +
      '<div class="row"><b class="num" style="font-size:26px;font-family:var(--f-mono)">' + rp(d.today.paid_amount) + '</b></div>' +
      '<div class="row"><span class="mute">' + d.today.paid_count + ' transaksi</span>' + delta(d.today.vs_yesterday_count) + '</div>' +
      '<hr class="rule">' +
      '<div class="row"><span class="eyebrow">Menunggu bayar</span><b class="num">' + t.pending_now + '</b></div>' +
      '<div class="row"><span class="eyebrow">Sepanjang masa</span><span class="num">' + rp(t.all_time_paid_amount) + '</span></div>';
    $('#kpis').innerHTML = [
      ['Tingkat sukses', t.success_rate === null ? '—' : t.success_rate + '%', 'lunas ÷ (lunas + kedaluwarsa + gagal)'],
      ['Invoice dibuat', nf.format(t.created_count), 'dalam ' + d.range_days + ' hari'],
      ['Waktu bayar rata-rata', dur(t.avg_pay_seconds), 'sejak QRIS dibuat sampai lunas'],
      ['Kode unik terkumpul', rp(t.unique_code_total), 'bagian dari total masuk'],
    ].map(function (k) {
      return '<div class="kpi"><span class="eyebrow">' + esc(k[0]) + '</span><b>' + esc(k[1]) + '</b><span class="hint">' + esc(k[2]) + '</span></div>';
    }).join('');
    drawChart(d.series);
    renderStatus(d.status);
    renderHours(d.hours);
    renderBuckets(d.amount_buckets);
    renderRecent(d.recent);
  }

  // Grafik batang + baris gelembung (jumlah transaksi). SVG buatan sendiri, tanpa library.
  function drawChart(series) {
    var host = $('#chart');
    var W = host.clientWidth || 800, H = 310;
    var padL = 46, padR = 8, padT = 14, padB = 70;
    var cw = W - padL - padR, ch = H - padT - padB;
    var max = Math.max.apply(null, series.map(function (s) { return s.paid_amount; }).concat([1]));
    var nice = niceMax(max);
    var n = series.length, step = cw / n, bw = Math.max(2, Math.min(34, step * 0.62));
    var maxCount = Math.max.apply(null, series.map(function (s) { return s.paid_count; }).concat([1]));
    var every = Math.ceil(n / Math.max(4, Math.floor(cw / 56)));
    var g = '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--accent-soft)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" stroke-width="2"/></pattern></defs>';
    for (var i = 0; i <= 4; i++) {
      var y = padT + ch - (ch * i) / 4;
      g += '<line class="grid-line" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '"/>';
      g += '<g class="axis"><text x="' + (padL - 8) + '" y="' + (y + 3.5) + '" text-anchor="end">' + compact((nice * i) / 4) + '</text></g>';
    }
    series.forEach(function (s, idx) {
      var cx = padL + step * idx + step / 2;
      var h = (s.paid_amount / nice) * ch;
      var isToday = idx === n - 1;
      g += '<rect class="bar" x="' + (cx - bw / 2) + '" y="' + (padT + ch - h) + '" width="' + bw + '" height="' + Math.max(h, s.paid_amount ? 2 : 0) + '" fill="' + (isToday ? 'var(--accent)' : 'url(#hatch)') + '" stroke="var(--accent)" stroke-width="1" opacity="' + (isToday ? 1 : 0.95) + '"/>';
      var r = s.paid_count ? 3 + (s.paid_count / maxCount) * 8 : 1.6;
      g += '<circle cx="' + cx + '" cy="' + (padT + ch + 30) + '" r="' + r + '" fill="' + (s.paid_count ? 'var(--ink)' : 'var(--line)') + '"/>';
      if (idx % every === 0 || isToday) {
        var d = new Date(s.date + 'T00:00:00Z');
        g += '<g class="axis"><text x="' + cx + '" y="' + (padT + ch + 58) + '" text-anchor="middle">' + d.getUTCDate() + ' ' + d.toLocaleString('id-ID', { month: 'short', timeZone: 'UTC' }) + '</text></g>';
      }
      g += '<rect class="col-hit" data-i="' + idx + '" x="' + (cx - step / 2) + '" y="' + padT + '" width="' + step + '" height="' + (ch + 44) + '"/>';
    });
    g += '<g class="axis"><text x="' + padL + '" y="' + (padT + ch + 14) + '" style="font-size:9.5px">jumlah transaksi ↓</text></g>';
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafik total masuk per hari">' + g + '</svg><div class="tip" id="tip"></div>';
    var tip = $('#tip', host);
    $$('.col-hit', host).forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        var s = series[Number(el.dataset.i)];
        var d = new Date(s.date + 'T00:00:00Z');
        tip.innerHTML = '<small>' + d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) + '</small><b>' + rp(s.paid_amount) + '</b><small>' + s.paid_count + ' lunas · ' + s.created + ' dibuat · ' + s.expired + ' tak lunas</small>';
        var cx = padL + step * Number(el.dataset.i) + step / 2;
        tip.style.left = Math.min(Math.max(cx, 90), W - 90) + 'px';
        tip.style.top = '8px';
        tip.classList.add('on');
      });
      el.addEventListener('mouseleave', function () { tip.classList.remove('on'); });
    });
  }
  function niceMax(v) {
    // 4 garis bantu dengan langkah bulat (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 × 10^k)
    var raw = Math.max(v, 4) / 4;
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var m = raw / p;
    var steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    var s = steps.filter(function (x) { return x >= m - 1e-9; })[0];
    return s * p * 4;
  }
  function renderStatus(s) {
    var total = s.PAID + s.PENDING + s.EXPIRED + s.FAILED;
    var names = { PAID: 'Lunas', PENDING: 'Menunggu', EXPIRED: 'Kedaluwarsa', FAILED: 'Gagal' };
    $('#status-seg').innerHTML = total
      ? ['PAID', 'PENDING', 'EXPIRED', 'FAILED'].map(function (k) { return '<i class="' + k + '" style="width:' + (s[k] / total) * 100 + '%"></i>'; }).join('')
      : '<i style="width:100%"></i>';
    $('#status-legend').innerHTML = ['PAID', 'PENDING', 'EXPIRED', 'FAILED'].map(function (k) {
      return '<div><span class="dot ' + k + '"></span>' + names[k] + '<em>' + s[k] + '</em></div>';
    }).join('');
  }
  function renderHours(hours) {
    var max = Math.max.apply(null, hours.map(function (h) { return h.count; }).concat([1]));
    $('#heat').innerHTML = hours.map(function (h) {
      var o = h.count ? 0.2 + (h.count / max) * 0.8 : 0.07;
      return '<i style="opacity:' + o + '" title="' + String(h.hour).padStart(2, '0') + ':00 WIB — ' + h.count + ' transaksi, ' + rp(h.amount) + '"></i>';
    }).join('');
    var peak = hours.reduce(function (a, b) { return b.count > a.count ? b : a; }, hours[0]);
    $('#heat-note').textContent = peak.count ? 'Paling ramai sekitar pukul ' + String(peak.hour).padStart(2, '0') + ':00 WIB (' + peak.count + ' transaksi).' : 'Belum ada transaksi lunas pada rentang ini.';
  }
  function renderBuckets(b) {
    var max = Math.max.apply(null, b.map(function (x) { return x.count; }).concat([1]));
    $('#buckets').innerHTML = b.map(function (x) {
      return '<div class="r"><span>' + esc(x.label) + '</span><div class="t"><i style="width:' + (x.count / max) * 100 + '%"></i></div><b>' + x.count + '</b></div>';
    }).join('');
  }
  function renderRecent(rows) {
    $('#recent').innerHTML = rows.length
      ? rows.map(function (r) {
          return '<tr class="row" data-id="' + esc(r.invoice_id) + '"><td class="mute num">' + esc(ago(r.created_at)) + '</td><td class="oid">' + esc(r.order_id) + '</td><td class="r"><span class="amt">' + rp(r.payable_amount) + '</span></td><td class="r"><span class="stamp ' + esc(r.status) + '">' + esc(statusName(r.status)) + '</span></td></tr>';
        }).join('')
      : '<tr><td colspan="4"><div class="empty"><b>Belum ada transaksi</b>Buat QRIS pertama dari tab “Uji QRIS”.</div></td></tr>';
  }
  function statusName(s) { return { PAID: 'lunas', PENDING: 'menunggu', EXPIRED: 'kedaluwarsa', FAILED: 'gagal' }[s] || s; }

  $$('[data-range]').forEach(function (b) {
    b.addEventListener('click', function () {
      range = Number(b.dataset.range);
      $$('[data-range]').forEach(function (x) { x.classList.toggle('on', x === b); });
      loadOverview();
    });
  });
  var rz;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (lastOverview && !$('[data-tab=ringkasan]').classList.contains('hide')) drawChart(lastOverview.series); }, 120); });
  window.addEventListener('zp-theme', function () { if (lastOverview) drawChart(lastOverview.series); });

  // ---------- transaksi ----------
  var tx = { status: '', q: '', from: '', to: '', page: 1, limit: 15 };
  function txQuery(extra) {
    var p = new URLSearchParams();
    if (tx.status) p.set('status', tx.status);
    if (tx.q) p.set('q', tx.q);
    if (tx.from) p.set('from', tx.from);
    if (tx.to) p.set('to', tx.to);
    p.set('page', tx.page); p.set('limit', tx.limit);
    if (extra) Object.keys(extra).forEach(function (k) { p.set(k, extra[k]); });
    return p.toString();
  }
  function loadTx() {
    api('/transactions?' + txQuery()).then(function (r) {
      var d = r.data;
      $('#tx-body').innerHTML = d.items.length
        ? d.items.map(function (i) {
            return '<tr class="row" data-id="' + esc(i.invoice_id) + '"><td class="num mute">' + esc(fdate(i.created_at, true)) + '</td><td class="oid">' + esc(i.order_id) + '</td><td class="r"><span class="amt">' + rp(i.payable_amount) + '</span>' + (i.unique_code ? '<small>+' + i.unique_code + ' unik</small>' : '') + '</td><td><span class="stamp ' + esc(i.status) + '">' + esc(statusName(i.status)) + '</span></td><td class="num mute">' + esc(i.paid_at ? fdate(i.paid_at, true) : '—') + '</td></tr>';
          }).join('')
        : '<tr><td colspan="5"><div class="empty"><b>Tidak ada hasil</b>Ubah filter atau kata kunci pencarian.</div></td></tr>';
      var pages = Math.max(1, Math.ceil(d.total / tx.limit));
      $('#tx-sum').textContent = nf.format(d.total) + ' transaksi · lunas ' + nf.format(d.paid_count) + ' (' + rp(d.paid_amount) + ')';
      $('#tx-page').textContent = 'Hal. ' + tx.page + ' / ' + pages;
      $('#tx-prev').disabled = tx.page <= 1;
      $('#tx-next').disabled = tx.page >= pages;
    }).catch(function (e) { if (e.message !== 'login') toast(e.message, true); });
  }
  $$('[data-status]').forEach(function (b) {
    b.addEventListener('click', function () {
      tx.status = b.dataset.status; tx.page = 1;
      $$('[data-status]').forEach(function (x) { x.classList.toggle('on', x === b); });
      loadTx();
    });
  });
  var qt;
  $('#tx-q').addEventListener('input', function (e) { clearTimeout(qt); qt = setTimeout(function () { tx.q = e.target.value; tx.page = 1; loadTx(); }, 280); });
  $('#tx-from').addEventListener('change', function (e) { tx.from = e.target.value; tx.page = 1; loadTx(); });
  $('#tx-to').addEventListener('change', function (e) { tx.to = e.target.value; tx.page = 1; loadTx(); });
  $('#tx-prev').addEventListener('click', function () { tx.page--; loadTx(); });
  $('#tx-next').addEventListener('click', function () { tx.page++; loadTx(); });
  $('#tx-csv').addEventListener('click', function () { location.href = '/admin/api/transactions.csv?' + txQuery({ page: 1, limit: 5000 }); });

  // ---------- detail (drawer) ----------
  var scrim = $('#scrim'), drawer = $('#drawer');
  function closeDrawer() { scrim.classList.remove('on'); drawer.classList.remove('on'); }
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  document.addEventListener('click', function (e) {
    var row = e.target.closest && e.target.closest('tr.row');
    if (row && row.dataset.id) openDetail(row.dataset.id);
  });
  function openDetail(id) {
    drawer.innerHTML = '<p class="mute">Memuat…</p>';
    scrim.classList.add('on'); drawer.classList.add('on');
    api('/invoices/' + encodeURIComponent(id)).then(function (r) {
      var i = r.data.invoice, ev = r.data.events;
      var canPay = i.status === 'PENDING';
      drawer.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Detail invoice</span><button class="icon-btn" id="dr-x" aria-label="Tutup">✕</button></div>' +
        '<h3 class="num" style="font-family:var(--f-display)">' + rp(i.payable_amount) + '</h3>' +
        '<span class="stamp ' + esc(i.status) + '">' + esc(statusName(i.status)) + '</span>' +
        '<dl class="dl">' +
        '<dt>Order ID</dt><dd class="mono">' + esc(i.order_id) + '</dd>' +
        '<dt>Nominal</dt><dd class="num">' + rp(i.amount) + (i.unique_code ? ' + kode unik ' + i.unique_code : '') + '</dd>' +
        '<dt>Dibuat</dt><dd>' + esc(fdate(i.created_at, true)) + ' WIB</dd>' +
        '<dt>Kedaluwarsa</dt><dd>' + esc(fdate(i.expires_at, true)) + ' WIB</dd>' +
        '<dt>Dibayar</dt><dd>' + esc(i.paid_at ? fdate(i.paid_at, true) + ' WIB' : '—') + '</dd>' +
        '<dt>ID transaksi</dt><dd class="mono">' + esc(i.provider_txn_id || '—') + '</dd>' +
        '<dt>Invoice ID</dt><dd class="mono">' + esc(i.invoice_id) + '</dd></dl>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn ghost sm" id="dr-copy">Salin order ID</button>' +
        (canPay ? '<a class="btn ghost sm" target="_blank" rel="noopener" href="/pay/' + esc(i.invoice_id) + '">Buka halaman bayar</a><button class="btn danger sm" id="dr-cancel">Batalkan invoice</button>' : '') +
        '</div>' +
        '<h4 class="eyebrow" style="margin:26px 0 12px">Riwayat</h4><ul class="timeline" style="padding-left:18px">' +
        '<li><b>DIBUAT</b><br><span class="mute num">' + esc(fdate(i.created_at, true)) + '</span></li>' +
        (ev.length ? ev.map(function (e) { return '<li><b>' + esc(e.type) + '</b> <span class="mute">' + esc(e.from || '') + ' → ' + esc(e.to || '') + '</span><br><span class="mute num">' + esc(fdate(e.at, true)) + ' · ' + esc(e.source || '') + '</span></li>'; }).join('') : '') + '</ul>';
      $('#dr-x').addEventListener('click', closeDrawer);
      $('#dr-copy').addEventListener('click', function () { copy(i.order_id); });
      var c = $('#dr-cancel');
      if (c) c.addEventListener('click', function () {
        if (!confirm('Batalkan invoice ini? Pelanggan tidak bisa membayarnya lagi.')) return;
        api('/invoices/' + encodeURIComponent(id) + '/cancel', { method: 'POST', body: {} }).then(function () { toast('Invoice dibatalkan.'); closeDrawer(); loadTx(); loadOverview(true); }).catch(function (e) { toast(e.message, true); });
      });
    }).catch(function (e) { drawer.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  // ---------- uji QRIS ----------
  var lab = { inv: null, timer: null, tick: null };
  function parseAmount(s) { return parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0; }
  var amtIn = $('#lab-amount');
  amtIn.addEventListener('input', function () { var n = parseAmount(amtIn.value); amtIn.value = n ? nf.format(n) : ''; });
  $$('[data-quick]').forEach(function (b) { b.addEventListener('click', function () { amtIn.value = nf.format(Number(b.dataset.quick)); }); });
  $('#lab-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var amount = parseAmount(amtIn.value);
    if (amount < boot.limits.min || amount > boot.limits.max) { toast('Nominal harus antara ' + rp(boot.limits.min) + ' dan ' + rp(boot.limits.max) + '.', true); return; }
    var btn = $('#lab-go'); btn.disabled = true;
    api('/test-qris', { method: 'POST', body: { amount: amount } }).then(function (r) {
      showReceipt(r.data);
    }).catch(function (err) { toast(err.message, true); }).then(function () { btn.disabled = false; });
  });
  function showReceipt(inv) {
    lab.inv = inv;
    clearInterval(lab.timer); clearInterval(lab.tick);
    $('#lab-empty').classList.add('hide');
    var box = $('#lab-receipt');
    box.classList.remove('hide');
    box.innerHTML =
      '<div class="stamp-big" id="lab-stamp"></div>' +
      '<div class="brand"><b>' + esc(boot.brand.split(' ')[0].toLowerCase()) + '</b><i>.pay</i></div>' +
      '<div class="eyebrow" style="margin-top:14px">Total bayar</div><div class="amt-xl">' + rp(inv.payable_amount) + '</div>' +
      '<img class="qr" alt="QRIS" src="/qr/' + esc(inv.invoice_id) + '?t=' + Date.now() + '">' +
      '<div class="rrow"><span>ORDER</span><span>' + esc(inv.order_id) + '</span></div>' +
      '<div class="rrow"><span>SISA WAKTU</span><span id="lab-left" class="count">—</span></div>' +
      '<div class="rrow"><span>STATUS</span><span id="lab-st">MENUNGGU</span></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><a class="btn ghost sm" style="color:#17140f;border-color:#17140f" target="_blank" rel="noopener" href="/pay/' + esc(inv.invoice_id) + '">Halaman bayar</a><button class="btn danger sm" id="lab-cancel">Batalkan</button></div>';
    $('#lab-cancel').addEventListener('click', function () {
      api('/invoices/' + encodeURIComponent(inv.invoice_id) + '/cancel', { method: 'POST', body: {} }).then(function () { settle('EXPIRED'); toast('Invoice dibatalkan.'); }).catch(function (e) { toast(e.message, true); });
    });
    var exp = new Date(inv.expires_at).getTime();
    lab.tick = setInterval(function () {
      var s = Math.max(0, Math.round((exp - Date.now()) / 1000));
      var el = $('#lab-left'); if (el) el.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 500);
    lab.timer = setInterval(poll, 5000);
    setTimeout(poll, 1500);
  }
  function settle(st) {
    clearInterval(lab.timer); clearInterval(lab.tick);
    var el = $('#lab-stamp'); if (!el) return;
    el.className = 'stamp-big on ' + st;
    el.textContent = st === 'PAID' ? 'Lunas' : st === 'FAILED' ? 'Gagal' : 'Selesai';
    var s = $('#lab-st'); if (s) s.textContent = statusName(st).toUpperCase();
    if (st === 'PAID') loadOverview(true);
  }
  function poll() {
    if (!lab.inv) return;
    api('/invoices/' + encodeURIComponent(lab.inv.invoice_id) + '/check', { method: 'POST', body: {} }).then(function (r) {
      if (r.data.status !== 'PENDING') settle(r.data.status);
    }).catch(function () {});
  }

  // ---------- sistem ----------
  function loadSystem() {
    api('/system').then(function (r) {
      loaded.sys = true;
      var s = r.data;
      var cells = [
        ['Gateway', 'Online', 'Versi ' + esc(s.version) + ' · Node ' + esc(s.node) + (s.vercel ? ' · Vercel' : '')],
        ['Pembuatan QRIS', s.can_create ? 'Siap' : 'Mati', s.can_create ? 'QRIS statis terpasang (' + esc(s.qris_kind) + ').' : 'Isi env QRIS_STATIC.'],
        ['Pemantauan pembayaran', s.can_check ? 'Siap' : 'Belum siap', s.can_check ? 'Sesi portal terpasang' + (s.session.jwt_expires_at ? ', JWT berlaku s/d ' + esc(fdate(s.session.jwt_expires_at, true)) : '') + '.' : 'Isi sesi ShopeePay di bawah.'],
        ['Rentang nominal', rp(s.limits.min) + ' – ' + rp(s.limits.max), 'Kedaluwarsa ' + s.limits.ttl_minutes + ' mnt (+' + s.limits.grace_minutes + ' mnt tenggang). Kode unik: ' + (s.limits.unique_code_max ? '1–' + s.limits.unique_code_max + ' (mulai ' + rp(s.limits.unique_code_min_amount) + ')' : 'nonaktif') + '.'],
        ['Callback', s.callback ? 'Aktif' : 'Nonaktif', s.callback ? 'Antrean: ' + s.callbacks.pending + ' menunggu, ' + s.callbacks.failed + ' gagal.' : 'Isi CALLBACK_URL dan CALLBACK_SECRET.'],
        ['Penyimpanan', { remote: 'Redis (tahan lama)', file: 'Berkas lokal', ephemeral: 'Sementara (/tmp)' }[s.storage], s.invoice_count + ' invoice tersimpan.'],
      ];
      $('#sys-cells').innerHTML = cells.map(function (c) { return '<div class="cell"><span class="eyebrow">' + esc(c[0]) + '</span><b>' + c[1] + '</b><p>' + c[2] + '</p></div>'; }).join('');
      var notes = [];
      if (s.storage === 'ephemeral') notes.push('<div class="note"><b>Data bisa hilang.</b> Di Vercel, berkas /tmp dihapus saat instance restart (cold start), jadi grafik dan riwayat bisa kosong sewaktu-waktu. Isi <code>UPSTASH_REDIS_REST_URL</code> dan <code>UPSTASH_REDIS_REST_TOKEN</code> agar data tersimpan permanen.</div>');
      if (!s.watcher_active && s.vercel) notes.push('<div class="note ok">Pemantauan otomatis lewat <code>setInterval</code> tidak berjalan di Vercel. Pembayaran terdeteksi saat bot memanggil <code>/check-payment</code>, saat pelanggan membuka halaman bayar, atau lewat cron ke <code>/cron/tick</code>.</div>');
      if (s.default_login) notes.push('<div class="note bad"><b>Kredensial login masih bawaan.</b> Atur <code>DASH_USER</code> dan <code>DASH_PASS</code> di Environment Variables Vercel, lalu redeploy.</div>');
      $('#sys-notes').innerHTML = notes.join('');
    }).catch(function (e) { if (e.message !== 'login') toast(e.message, true); });
  }
  $('#sys-test').addEventListener('click', function () {
    var b = $('#sys-test'); b.disabled = true; b.textContent = 'Menguji…';
    api('/system/test-session', { method: 'POST', body: {} }).then(function (r) {
      var st = r.data.state;
      var cls = st === 'VALID' ? 'ok' : st === 'INVALID' ? 'bad' : '';
      $('#sys-test-out').innerHTML = '<div class="note ' + cls + '"><b>' + esc(st) + '</b> — ' + esc(r.data.message) + '</div>';
    }).catch(function (e) { toast(e.message, true); }).then(function () { b.disabled = false; b.textContent = 'Uji sesi ShopeePay'; });
  });
  $('#sys-session-go').addEventListener('click', function () {
    var v = $('#sys-curl').value.trim();
    if (!v) { toast('Tempel hasil “Copy as cURL (bash)” dulu.', true); return; }
    var b = $('#sys-session-go'); b.disabled = true;
    api('/system/session', { method: 'POST', body: { curl: v } }).then(function (r) {
      $('#sys-curl').value = '';
      toast('Sesi diperbarui di memori. Jalankan uji sesi.');
      loaded.sys = false; loadSystem();
    }).catch(function (e) { toast(e.message, true); }).then(function () { b.disabled = false; });
  });
  $('#logout').addEventListener('click', function () {
    fetch('/logout', { method: 'POST', credentials: 'same-origin' }).then(function () { location.href = '/login'; });
  });

  // ---------- start ----------
  showTab();
  setInterval(function () {
    if (document.hidden) return;
    var name = (location.hash || '#ringkasan').slice(1);
    if (name === 'ringkasan') loadOverview(true);
  }, 30000);
})();
