'use strict';

/**
 * Halaman HTML (server-rendered, tanpa framework). Semua JS/CSS dimuat dari /assets (CSP: script-src 'self').
 * Data awal diberikan lewat <script type="application/json" id="boot"> (bukan eksekusi, aman dari CSP).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ASSET_DIR = path.join(__dirname, 'assets');
const ASSET_TYPES = {
  'base.css': 'text/css; charset=utf-8',
  'theme.js': 'application/javascript; charset=utf-8',
  'dash.js': 'application/javascript; charset=utf-8',
  'docs.js': 'application/javascript; charset=utf-8',
  'login.js': 'application/javascript; charset=utf-8',
  'pay.js': 'application/javascript; charset=utf-8',
};

const assets = {};
for (const name of Object.keys(ASSET_TYPES)) {
  const body = fs.readFileSync(path.join(ASSET_DIR, name));
  assets[name] = { body, type: ASSET_TYPES[name], etag: `"${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}"` };
}
const V = (name) => assets[name].etag.replace(/"/g, '');

const esc = (v) =>
  String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600;700&display=swap">';

const ICON_THEME =
  '<svg class="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' +
  '<svg class="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>';

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='5' fill='%2317140f'/%3E%3Cpath d='M9 10h14l-9 12h9' fill='none' stroke='%23ff6b3d' stroke-width='3' stroke-linecap='square'/%3E%3C/svg%3E";

function head(title, extra = '') {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><link rel="icon" href="${FAVICON}">
<script src="/assets/theme.js?v=${V('theme.js')}"></script>${FONTS}<link rel="stylesheet" href="/assets/base.css?v=${V('base.css')}">${extra}</head>`;
}

function brandMark(brand, href = '/dashboard') {
  const first = String(brand).split(' ')[0].toLowerCase();
  return `<a class="brand" href="${href}"><b>${esc(first)}</b><i>.pay</i></a>`;
}

// ---------------------------------------------------------------- login
function loginPage({ brand }) {
  const ticks = Array.from({ length: 14 }, (_, i) => `<line x1="0" y1="${i * 28 + 4}" x2="${i % 3 === 0 ? 300 : 210}" y2="${i * 28 + 4}" stroke="#efe8d7" stroke-width="2"/>`).join('');
  return `${head(`Masuk · ${brand}`)}<body><div class="login">
<section class="login-art">
  <svg class="ticks" viewBox="0 0 300 400" aria-hidden="true">${ticks}</svg>
  <div>${brandMark(brand, '/')}</div>
  <p class="quote">Setiap rupiah <em>tercatat</em>, satu per satu.</p>
  <div class="foot"><span>QRIS · Rp1 – Rp10.000.000</span><span>Ruang kerja pribadi</span></div>
</section>
<section class="login-form">
  <form id="login-form" autocomplete="on">
    <div><span class="eyebrow">Masuk dashboard</span><h1 style="margin-top:12px">Selamat datang kembali.</h1></div>
    <label class="field"><span>Username</span><input class="input" name="username" autocomplete="username" required autofocus></label>
    <label class="field"><span>Password</span><div class="pw"><input class="input" id="pw" name="password" type="password" autocomplete="current-password" required><button type="button" id="pw-toggle">LIHAT</button></div></label>
    <div class="err" id="login-err" role="alert"></div>
    <button class="btn" type="submit">Masuk</button>
    <p class="mute" style="font-size:13px">Dokumentasi API tersedia untuk umum di <a href="/docs">/docs</a>.</p>
  </form>
</section></div>
<script src="/assets/login.js?v=${V('login.js')}"></script></body></html>`;
}

// ---------------------------------------------------------------- dashboard
function dashboardPage({ brand, user, limits }) {
  const boot = json({ brand, user, limits });
  return `${head(`Dashboard · ${brand}`)}<body>
<header class="top"><div class="wrap">
  ${brandMark(brand)}
  <nav class="nav"><a href="#ringkasan">Ringkasan</a><a href="#transaksi">Transaksi</a><a href="#uji">Uji QRIS</a><a href="#sistem">Sistem</a><a href="/docs">Dokumentasi ↗</a></nav>
  <span class="sp"></span>
  <div class="right" style="display:flex;gap:10px;align-items:center">
    <span class="live"><span>memuat</span></span>
    <button class="icon-btn" data-theme-toggle aria-label="Ganti tema">${ICON_THEME}</button>
    <button class="btn ghost sm" id="logout">Keluar</button>
  </div>
</div></header>
<main class="wrap">

<section data-tab="ringkasan">
  <div class="page-title"><div><span class="eyebrow">Halo, ${esc(user)}</span><h1 style="margin-top:10px">Buku kas <em>hari ini.</em></h1></div>
    <div class="chips" role="group" aria-label="Rentang waktu"><button class="chip" data-range="7">7 hari</button><button class="chip" data-range="14">14 hari</button><button class="chip on" data-range="30">30 hari</button><button class="chip" data-range="90">90 hari</button></div></div>

  <div class="hero">
    <div class="hero-main"><span class="eyebrow" id="hero-label">Total masuk</span>
      <div class="big"><small>Rp</small><span id="hero-big" class="skel">0000000</span></div>
      <div class="hero-sub" id="hero-sub"></div></div>
    <aside class="hero-side" id="side-today"></aside>
  </div>
  <div class="kpis" id="kpis"></div>

  <div class="grid-2">
    <div class="panel"><div class="panel-h"><h3>Arus dana harian</h3><span class="eyebrow">batang = nominal · titik = jumlah transaksi</span></div><div class="panel-b"><div id="chart"></div></div></div>
    <div class="stack">
      <div class="panel"><div class="panel-h"><h3>Hasil invoice</h3></div><div class="panel-b"><div class="seg" id="status-seg"></div><div class="legend" id="status-legend"></div></div></div>
      <div class="panel"><div class="panel-h"><h3>Jam ramai <span class="mute" style="font-size:15px">(WIB)</span></h3></div><div class="panel-b"><div class="heat" id="heat"></div><div class="heat-x"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div><p class="mute" id="heat-note" style="font-size:13px;margin-top:12px"></p></div></div>
    </div>
  </div>

  <div class="grid-2" style="grid-template-columns:1fr 1.6fr">
    <div class="panel"><div class="panel-h"><h3>Sebaran nominal</h3></div><div class="panel-b"><div class="blist" id="buckets"></div></div></div>
    <div class="panel"><div class="panel-h"><h3>Terbaru</h3><a class="eyebrow" href="#transaksi">lihat semua →</a></div><div class="panel-b tbl-wrap"><table class="ledger" style="min-width:0"><tbody id="recent"></tbody></table></div></div>
  </div>
</section>

<section data-tab="transaksi" class="hide">
  <div class="page-title"><div><span class="eyebrow">Semua invoice</span><h1 style="margin-top:10px">Daftar <em>transaksi.</em></h1></div><button class="btn ghost" id="tx-csv">Unduh CSV</button></div>
  <div class="panel"><div class="panel-b">
    <div class="filters">
      <div class="chips"><button class="chip on" data-status="">Semua</button><button class="chip" data-status="PAID">Lunas</button><button class="chip" data-status="PENDING">Menunggu</button><button class="chip" data-status="EXPIRED">Kedaluwarsa</button></div>
      <input class="input" id="tx-q" placeholder="Cari order ID / nominal / ID transaksi" aria-label="Cari">
      <input class="input" id="tx-from" type="date" aria-label="Dari tanggal" style="min-width:0"><input class="input" id="tx-to" type="date" aria-label="Sampai tanggal" style="min-width:0">
    </div>
    <div class="tbl-wrap"><table class="ledger"><thead><tr><th>Dibuat (WIB)</th><th>Order ID</th><th class="r">Total bayar</th><th>Status</th><th>Dibayar</th></tr></thead><tbody id="tx-body"></tbody></table></div>
    <div class="pager"><span id="tx-sum"></span><span><button class="btn ghost sm" id="tx-prev">←</button> <span id="tx-page" style="margin:0 8px"></span> <button class="btn ghost sm" id="tx-next">→</button></span></div>
  </div></div>
</section>

<section data-tab="uji" class="hide">
  <div class="page-title"><div><span class="eyebrow">Sandbox pribadi</span><h1 style="margin-top:10px">Uji <em>QRIS.</em></h1></div></div>
  <div class="lab">
    <div class="panel"><div class="panel-h"><h3>Buat QRIS percobaan</h3></div><div class="panel-b">
      <form id="lab-form" style="display:grid;gap:16px">
        <label class="field"><span>Nominal (Rp)</span><input class="input num" id="lab-amount" inputmode="numeric" placeholder="25.000" autocomplete="off" style="font-size:22px"></label>
        <div class="chips"><button type="button" class="chip" data-quick="1">1</button><button type="button" class="chip" data-quick="1000">1.000</button><button type="button" class="chip" data-quick="10000">10.000</button><button type="button" class="chip" data-quick="100000">100.000</button><button type="button" class="chip" data-quick="1000000">1.000.000</button><button type="button" class="chip" data-quick="10000000">10.000.000</button></div>
        <button class="btn" id="lab-go" type="submit">Buat QRIS</button>
        <p class="mute" style="font-size:13px">Invoice dicatat sebagai <code>TEST-…</code> dan ikut tampil di riwayat. Bayar dengan aplikasi apa pun yang mendukung QRIS; status berubah otomatis.</p>
      </form></div></div>
    <div style="position:relative"><div class="empty panel" id="lab-empty" style="padding:70px 20px"><b>Belum ada QRIS</b>Struk akan muncul di sini.</div><div class="receipt hide" id="lab-receipt"></div></div>
  </div>
</section>

<section data-tab="sistem" class="hide">
  <div class="page-title"><div><span class="eyebrow">Kondisi mesin</span><h1 style="margin-top:10px">Status <em>sistem.</em></h1></div></div>
  <div style="display:grid;gap:18px">
    <div id="sys-notes" style="display:grid;gap:10px"></div>
    <div class="panel"><div class="panel-b"><div class="sys" id="sys-cells"></div></div></div>
    <div class="grid-2" style="grid-template-columns:1fr 1fr">
      <div class="panel"><div class="panel-h"><h3>Uji sesi ShopeePay</h3></div><div class="panel-b" style="display:grid;gap:14px"><p class="mute" style="font-size:14px">Mengetes langsung ke Partner Portal. Bila hasilnya bukan VALID, pembayaran tidak akan terdeteksi otomatis.</p><div><button class="btn" id="sys-test">Uji sesi ShopeePay</button></div><div id="sys-test-out"></div></div></div>
      <div class="panel"><div class="panel-h"><h3>Perbarui sesi</h3></div><div class="panel-b" style="display:grid;gap:12px"><p class="mute" style="font-size:14px">Tempel hasil <b>Copy as cURL (bash)</b> dari request <code>get-transaction-list</code> di DevTools. Disimpan di memori instance (hilang saat restart); untuk permanen isi env di Vercel.</p><textarea class="input" id="sys-curl" placeholder="curl 'https://partner.shopee.co.id/…' -H 'cookie: …'" spellcheck="false"></textarea><div><button class="btn" id="sys-session-go">Terapkan sesi</button></div></div></div>
    </div>
  </div>
</section>
</main>
<div class="scrim" id="scrim"></div><aside class="drawer" id="drawer" aria-live="polite"></aside><div class="toast-host"></div>
<script type="application/json" id="boot">${boot}</script>
<script src="/assets/dash.js?v=${V('dash.js')}"></script></body></html>`;
}

// ---------------------------------------------------------------- bayar (publik)
function payPage({ brand, inv }) {
  const boot = json({ id: inv.id, status: inv.status, expires_at: inv.expires_at, payable: Number(inv.payable_amount) });
  const rupiah = new Intl.NumberFormat('id-ID').format(Number(inv.payable_amount));
  const live = inv.status === 'PENDING' && new Date(inv.expires_at).getTime() > Date.now() && inv.qris_payload;
  return `${head(`Bayar Rp${rupiah} · ${brand}`)}<body><div class="pay-body"><div>
<div class="receipt">
  <div class="stamp-big" id="stamp"></div>
  ${brandMark(brand, '#').replace('class="brand"', 'class="brand" style="pointer-events:none"')}
  <div class="eyebrow" style="margin-top:16px">Total pembayaran</div>
  <div class="amt-xl num" style="font-family:var(--f-display)">Rp${esc(rupiah)}</div>
  ${inv.unique_code ? `<div class="mute" style="font-size:12.5px;font-family:var(--f-mono);color:#7a725f">termasuk kode unik ${esc(inv.unique_code)}</div>` : ''}
  ${live ? `<img class="qr" id="qr" alt="Kode QRIS" src="/qr/${esc(inv.id)}">` : '<div class="qr" id="qr" style="display:grid;place-items:center;color:#8a8272;font:500 13px var(--f-mono)">QR tidak aktif</div>'}
  <div class="rrow"><span>ORDER</span><span>${esc(inv.order_id)}</span></div>
  <div class="rrow"><span>SISA WAKTU</span><span class="count" id="left">—</span></div>
  <div class="rrow"><span>STATUS</span><span id="st">${inv.status === 'PAID' ? 'LUNAS' : inv.status === 'PENDING' ? 'MENUNGGU' : 'KEDALUWARSA'}</span></div>
  <ol class="steps"><li>Buka aplikasi e-wallet atau mobile banking.</li><li>Pilih <b>Scan QRIS</b> lalu arahkan ke kode di atas.</li><li>Pastikan nominal <b>sama persis</b>, lalu bayar.</li></ol>
  <p id="hint" style="font-size:12.5px;margin-top:12px;color:#4b453a"></p>
  <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
    <button class="btn ghost sm" id="copy-amt" style="color:#17140f;border-color:#17140f">Salin nominal</button>
    ${live ? `<a class="btn ghost sm" style="color:#17140f;border-color:#17140f" href="/qr/${esc(inv.id)}" download="qris-${esc(inv.order_id)}.png">Unduh QR</a>` : ''}
  </div>
</div>
<p class="pay-foot">Halaman ini diperbarui otomatis · ${esc(brand)}</p>
</div></div>
<script type="application/json" id="boot">${boot}</script><script src="/assets/pay.js?v=${V('pay.js')}"></script></body></html>`;
}

function payNotFoundPage({ brand }) {
  return `${head(`Tidak ditemukan · ${brand}`)}<body><div class="pay-body"><div class="receipt"><div class="eyebrow">404</div><div class="amt-xl" style="font-size:40px;margin-top:10px">Invoice tidak ditemukan</div><p style="margin-top:10px;color:#4b453a">Tautan salah atau invoice sudah dihapus. Minta tautan baru ke penjual.</p></div></div></body></html>`;
}

// ---------------------------------------------------------------- docs (publik)
function box(samples, label) {
  const langs = Object.keys(samples);
  const names = { curl: 'cURL', node: 'Node.js', php: 'PHP', python: 'Python', json: 'JSON', http: 'HTTP' };
  const bar =
    langs.length > 1 || !label
      ? `<div class="bar">${langs.map((l, i) => `<button data-lang="${l}" class="${i === 0 ? 'on' : ''}">${names[l] || l}</button>`).join('')}<button class="cp" data-copy-code>salin</button></div>`
      : `<div class="lbl" style="display:flex;justify-content:space-between"><span>${esc(label)}</span><button data-copy-code style="border:0;background:none;color:#9b927f;font:500 12px var(--f-mono);cursor:pointer">salin</button></div>`;
  return `<div class="codebox">${bar}${langs.map((l, i) => `<pre data-lang="${l}" class="${i === 0 ? '' : 'hide'}"><code>${esc(samples[l])}</code></pre>`).join('')}</div>`;
}

function params(rows) {
  return `<table class="kv"><thead><tr><th>Nama</th><th>Tipe</th><th>Keterangan</th></tr></thead><tbody>${rows
    .map(([n, t, d, req]) => `<tr><td><code>${esc(n)}</code>${req ? '<span class="req">WAJIB</span>' : ''}</td><td class="mono">${esc(t)}</td><td>${d}</td></tr>`)
    .join('')}</tbody></table>`;
}

function endpoint(verb, route, tag, inner) {
  return `<div class="ep"><div class="ep-h"><span class="verb ${verb}">${verb}</span><code>${esc(route)}</code><span class="tag">${esc(tag)}</span></div><div class="ep-b">${inner}</div></div>`;
}

function docsPage({ brand, base, limits }) {
  const min = new Intl.NumberFormat('id-ID').format(limits.min);
  const max = new Intl.NumberFormat('id-ID').format(limits.max);

  const createReq = {
    curl: `curl -X POST ${base}/create-qris \\\n  -H "X-API-Key: API_KEY_KAMU" \\\n  -H "Content-Type: application/json" \\\n  -d '{"amount": 25000, "order_id": "INV-0001"}'`,
    node: `const res = await fetch('${base}/create-qris', {\n  method: 'POST',\n  headers: {\n    'X-API-Key': process.env.GATEWAY_API_KEY,\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify({ amount: 25000, order_id: 'INV-0001' }),\n});\nconst { data } = await res.json();\nconsole.log(data.pay_url, data.payable_amount);`,
    php: `<?php\n$ch = curl_init('${base}/create-qris');\ncurl_setopt_array($ch, [\n  CURLOPT_POST => true,\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => [\n    'X-API-Key: ' . getenv('GATEWAY_API_KEY'),\n    'Content-Type: application/json',\n  ],\n  CURLOPT_POSTFIELDS => json_encode(['amount' => 25000, 'order_id' => 'INV-0001']),\n]);\n$data = json_decode(curl_exec($ch), true)['data'];\necho $data['pay_url'];`,
    python: `import os, requests\n\nres = requests.post(\n    "${base}/create-qris",\n    headers={"X-API-Key": os.environ["GATEWAY_API_KEY"]},\n    json={"amount": 25000, "order_id": "INV-0001"},\n    timeout=15,\n)\ndata = res.json()["data"]\nprint(data["pay_url"], data["payable_amount"])`,
  };
  const createRes = JSON.stringify(
    {
      success: true,
      data: {
        invoice_id: '3f9c2a1e-5b7d-4c80-9a42-0d1e6f7b8c21',
        order_id: 'INV-0001',
        amount: 25000,
        unique_code: 0,
        payable_amount: 25000,
        currency: 'IDR',
        status: 'PENDING',
        qris_kind: 'static_injected',
        expires_at: '2026-10-31T09:15:00.000Z',
        paid_at: null,
        created_at: '2026-10-31T09:00:00.000Z',
        qris_url: `${base}/qr/3f9c2a1e-5b7d-4c80-9a42-0d1e6f7b8c21`,
        pay_url: `${base}/pay/3f9c2a1e-5b7d-4c80-9a42-0d1e6f7b8c21`,
        qris_payload: '000201010212...6304ABCD',
      },
    },
    null,
    2
  );
  const checkReq = {
    curl: `curl -X POST ${base}/check-payment \\\n  -H "X-API-Key: API_KEY_KAMU" \\\n  -H "Content-Type: application/json" \\\n  -d '{"order_id": "INV-0001"}'`,
    node: `const res = await fetch('${base}/check-payment', {\n  method: 'POST',\n  headers: { 'X-API-Key': process.env.GATEWAY_API_KEY, 'Content-Type': 'application/json' },\n  body: JSON.stringify({ order_id: 'INV-0001' }),\n});\nconst r = await res.json();\nif (r.paid) console.log('Lunas!', r.transaction.paid_at);`,
    php: `<?php\n$ch = curl_init('${base}/check-payment');\ncurl_setopt_array($ch, [\n  CURLOPT_POST => true,\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => ['X-API-Key: ' . getenv('GATEWAY_API_KEY'), 'Content-Type: application/json'],\n  CURLOPT_POSTFIELDS => json_encode(['order_id' => 'INV-0001']),\n]);\n$r = json_decode(curl_exec($ch), true);\nif ($r['paid']) { /* kirim produk */ }`,
    python: `r = requests.post(\n    "${base}/check-payment",\n    headers={"X-API-Key": os.environ["GATEWAY_API_KEY"]},\n    json={"order_id": "INV-0001"},\n    timeout=15,\n).json()\nif r["paid"]:\n    print("Lunas!", r["transaction"]["paid_at"])`,
  };
  const paidRes = JSON.stringify(
    { success: true, paid: true, status: 'PAID', order_id: 'INV-0001', transaction: { transaction_id: 'TX-889120', amount: 25000, paid_at: '2026-10-31T09:04:12.000Z' }, data: { '…': 'sama seperti objek invoice' } },
    null,
    2
  );
  const cbPayload = JSON.stringify(
    { event: 'payment.paid', event_id: 'evt_3f9c2a1e-…', order_id: 'INV-0001', invoice_id: '3f9c2a1e-…', amount: 25000, payable_amount: 25000, currency: 'IDR', status: 'PAID', transaction_id: 'TX-889120', paid_at: '2026-10-31T09:04:12.000Z', source: 'watcher' },
    null,
    2
  );
  const verify = {
    node: `const crypto = require('crypto');\n\n// WAJIB pakai body mentah (string persis yang diterima), bukan hasil JSON.parse.\napp.post('/payment-callback', express.raw({ type: 'application/json' }), (req, res) => {\n  const raw = req.body.toString('utf8');\n  const h = Object.fromEntries(req.get('x-gateway-signature').split(',').map(p => p.trim().split('=')));\n  const expected = crypto.createHmac('sha256', process.env.CALLBACK_SECRET)\n    .update(h.t + '.' + raw).digest('hex');\n  const ok = h.v1.length === expected.length &&\n    crypto.timingSafeEqual(Buffer.from(h.v1), Buffer.from(expected)) &&\n    Math.abs(Date.now() / 1000 - Number(h.t)) < 300;\n  if (!ok) return res.sendStatus(401);\n\n  const evt = JSON.parse(raw);\n  // idempotent: abaikan bila evt.order_id sudah diproses\n  res.json({ ok: true });\n});`,
    php: `<?php\n$raw = file_get_contents('php://input');\nparse_str(str_replace(',', '&', $_SERVER['HTTP_X_GATEWAY_SIGNATURE']), $h);\n$expected = hash_hmac('sha256', $h['t'] . '.' . $raw, getenv('CALLBACK_SECRET'));\n\nif (!hash_equals($expected, $h['v1']) || abs(time() - (int)$h['t']) > 300) {\n  http_response_code(401); exit;\n}\n$evt = json_decode($raw, true);\n// idempotent: abaikan bila $evt['order_id'] sudah diproses\nhttp_response_code(200); echo json_encode(['ok' => true]);`,
    python: `import hmac, hashlib, time, os\nfrom flask import Flask, request\n\n@app.post("/payment-callback")\ndef callback():\n    raw = request.get_data(as_text=True)  # body mentah\n    h = dict(p.strip().split("=", 1) for p in request.headers["X-Gateway-Signature"].split(","))\n    expected = hmac.new(os.environ["CALLBACK_SECRET"].encode(), f'{h["t"]}.{raw}'.encode(), hashlib.sha256).hexdigest()\n    if not hmac.compare_digest(expected, h["v1"]) or abs(time.time() - int(h["t"])) > 300:\n        return "", 401\n    evt = request.get_json()\n    # idempotent: abaikan bila evt["order_id"] sudah diproses\n    return {"ok": True}`,
  };
  const errors = [
    ['UNAUTHORIZED', 401, 'Header <code>X-API-Key</code> tidak ada atau salah.'],
    ['INVALID_JSON', 400, 'Body bukan JSON yang valid.'],
    ['INVALID_AMOUNT', 400, '<code>amount</code> harus bilangan bulat positif (bukan string, bukan desimal).'],
    ['AMOUNT_OUT_OF_RANGE', 400, `Nominal di luar rentang Rp${min} – Rp${max}.`],
    ['INVALID_ORDER_ID', 400, '<code>order_id</code> 3–64 karakter: huruf, angka, titik, garis bawah, atau strip.'],
    ['DUPLICATE_ORDER_ID', 409, '<code>order_id</code> sudah pernah dipakai.'],
    ['AMOUNT_IN_USE', 409, 'Masih ada invoice PENDING dengan total bayar yang sama. Gunakan kode unik atau nominal lain.'],
    ['INVOICE_NOT_FOUND', 404, 'Tidak ada invoice untuk <code>order_id</code> tersebut.'],
    ['INVOICE_INACTIVE', 410, 'QR diminta untuk invoice yang sudah lunas/kedaluwarsa.'],
    ['NOT_CONFIGURED', 501, 'Fitur belum dikonfigurasi (mis. <code>QRIS_STATIC</code> atau sesi portal).'],
    ['RATE_LIMITED', 429, 'Terlalu banyak request. Tunggu lalu coba lagi.'],
    ['PROVIDER_TOKEN_INVALID', 502, 'Sesi ShopeePay kedaluwarsa; perbarui sesi di dashboard → Sistem.'],
    ['PROVIDER_*', 502, 'Gangguan saat membaca mutasi (tidak terjangkau, dibatasi, atau respons tak dikenali).'],
  ];

  const nav = [
    ['mulai', 'Mulai cepat'],
    ['auth', 'Autentikasi'],
    ['create', 'Buat QRIS'],
    ['check', 'Cek pembayaran'],
    ['pay', 'Halaman bayar'],
    ['callback', 'Callback'],
    ['riwayat', 'Riwayat transaksi'],
    ['ops', 'Operasional'],
    ['error', 'Kode error'],
  ];

  return `${head(`Dokumentasi API · ${brand}`)}<body>
<header class="top"><div class="wrap">${brandMark(brand, '/')}<nav class="nav"><a class="on" href="/docs">Dokumentasi</a></nav><span class="sp"></span>
<div class="right" style="display:flex;gap:10px;align-items:center"><button class="icon-btn" data-theme-toggle aria-label="Ganti tema">${ICON_THEME}</button><a class="btn sm" href="/dashboard">Dashboard</a></div></div></header>
<div class="wrap docs">
<nav class="toc" aria-label="Daftar isi"><span class="eyebrow">Isi</span>${nav.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}</nav>
<article class="doc">
<span class="eyebrow">Referensi API · v1</span>
<h1 style="margin-top:14px">Terima pembayaran <em>QRIS</em> dalam tiga panggilan.</h1>
<p class="lede">Buat QRIS dengan nominal tepat dari Rp${min} sampai Rp${max}, tampilkan ke pelanggan, lalu ketahui kapan lunas — lewat polling atau callback bertanda tangan ke servermu.</p>
<div class="baseurl"><span>Base URL</span><code>${esc(base)}</code><button data-copy-text="${esc(base)}">salin</button></div>

<section id="mulai"><h2><span class="n">01</span>Mulai cepat</h2>
<p>Alur paling sederhana untuk toko, bot, atau website:</p>
<ul><li><b>Buat</b> invoice dengan <code>POST /create-qris</code>. Simpan <code>order_id</code> milikmu.</li><li><b>Tampilkan</b> <code>pay_url</code> (halaman bayar siap pakai) atau gambar dari <code>qris_url</code> ke pelanggan.</li><li><b>Konfirmasi</b> lewat <code>POST /check-payment</code> berkala, atau terima <a href="#callback">callback</a> saat lunas.</li></ul>
${box(createReq)}</section>

<section id="auth"><h2><span class="n">02</span>Autentikasi</h2>
<p>Semua endpoint bertanda <span class="verb POST" style="font-size:10px">KUNCI</span> memerlukan header <code>X-API-Key</code> berisi API key gateway (env <code>API_KEY</code> di Vercel). Kunci <b>tidak</b> diterima lewat query string agar tidak bocor ke log.</p>
<div class="callout">Simpan API key hanya di server/backend. Jangan pernah menaruhnya di JavaScript browser atau aplikasi mobile.</div>
${box({ http: 'X-API-Key: API_KEY_KAMU\nContent-Type: application/json' }, 'Header wajib')}</section>

<section id="create"><h2><span class="n">03</span>Buat QRIS</h2>
${endpoint(
  'POST',
  '/create-qris',
  'butuh API key',
  `<p>Menerbitkan invoice QRIS bernominal. Invoice berlaku ${limits.ttl_minutes} menit.</p>${params([
    ['amount', 'integer', `Rupiah, bilangan bulat, antara <b>${min}</b> dan <b>${max}</b>.`, true],
    ['order_id', 'string', 'ID unik pesananmu, 3–64 karakter (huruf, angka, <code>. _ -</code>).', true],
  ])}`
)}
${box(createReq)}
<h3>Respons <span class="mono mute">201 Created</span></h3>
${box({ json: createRes }, 'application/json')}
${params([
  ['payable_amount', 'integer', 'Nominal yang <b>harus dibayar</b> pelanggan (amount + kode unik bila aktif).'],
  ['unique_code', 'integer', 'Tambahan 1–N rupiah agar dua invoice tak bentrok. 0 bila fitur nonaktif atau nominal kecil.'],
  ['pay_url', 'string', 'Halaman bayar publik: QR, hitung mundur, dan status otomatis.'],
  ['qris_url', 'string', 'Gambar PNG QR untuk disematkan di aplikasimu.'],
  ['qris_payload', 'string', 'Isi QRIS mentah bila ingin membuat gambar QR sendiri.'],
  ['expires_at', 'ISO 8601', 'Batas waktu bayar (UTC).'],
])}
<div class="callout"><b>Nominal kecil:</b> Rp1 diterima. Kode unik tidak dipakai untuk nominal di bawah Rp${new Intl.NumberFormat('id-ID').format(limits.unique_code_min_amount)}, sehingga Rp1 tetap Rp1 — dua invoice PENDING dengan nominal sama tidak boleh berjalan bersamaan.</div>
</section>

<section id="check"><h2><span class="n">04</span>Cek pembayaran</h2>
${endpoint('POST', '/check-payment', 'butuh API key', `<p>Mengembalikan status terbaru. Aman dipanggil tiap 5–10 detik; panggilan lebih rapat dibatasi otomatis (<code>throttled: true</code>) untuk melindungi sesi ShopeePay.</p>${params([['order_id', 'string', 'ID pesanan yang sama saat membuat QRIS.', true]])}`)}
${box(checkReq)}
<h3>Respons saat lunas</h3>
${box({ json: paidRes }, 'application/json')}
<p>Nilai <code>status</code>: <code>PENDING</code> (menunggu), <code>PAID</code> (lunas), <code>EXPIRED</code> (kedaluwarsa/dibatalkan), <code>FAILED</code>. Anggap pesanan lunas hanya bila <code>paid === true</code>.</p></section>

<section id="pay"><h2><span class="n">05</span>Halaman bayar</h2>
${endpoint('GET', '/pay/{invoice_id}', 'publik', '<p>Halaman checkout siap pakai berbentuk struk: QR, nominal, hitung mundur, dan stempel <b>LUNAS</b> otomatis saat pembayaran masuk. Cukup kirim <code>pay_url</code> ke pelanggan (chat, email, tombol bayar).</p>')}
${endpoint('GET', '/qr/{invoice_id}', 'publik', '<p>Gambar PNG 512×512 untuk invoice yang masih aktif. Mengembalikan <code>410</code> bila sudah lunas atau kedaluwarsa.</p>')}</section>

<section id="callback"><h2><span class="n">06</span>Callback (webhook)</h2>
<p>Bila <code>CALLBACK_URL</code> dan <code>CALLBACK_SECRET</code> diisi, gateway mengirim <code>POST</code> ke servermu begitu invoice lunas, dengan percobaan ulang bertahap sampai servermu membalas <code>2xx</code>. Pengiriman bersifat <i>at-least-once</i>, jadi buat handler yang <b>idempotent</b>.</p>
${box({ json: cbPayload }, 'Body callback')}
${params([
  ['X-Gateway-Signature', 'header', '<code>t=&lt;unix&gt;,v1=&lt;hex&gt;</code>. <code>v1</code> = HMAC-SHA256(<code>CALLBACK_SECRET</code>, <code>t + "." + bodyMentah</code>).'],
  ['X-Gateway-Event', 'header', 'Selalu <code>payment.paid</code>.'],
  ['X-Gateway-Event-Id', 'header', 'ID unik peristiwa untuk deduplikasi.'],
])}
<h3>Verifikasi tanda tangan</h3>
${box(verify)}</section>

<section id="riwayat"><h2><span class="n">07</span>Riwayat transaksi</h2>
${endpoint('GET', '/transactions', 'butuh API key', '<p>Daftar invoice terbaru. Parameter: <code>page</code>, <code>limit</code> (1–100), <code>status</code>, <code>order_id</code>.</p>')}
${endpoint('GET', '/transactions/all', 'butuh API key', '<p>Seperti di atas dengan filter tanggal <code>start_date</code> / <code>end_date</code> (<code>YYYY-MM-DD</code>, zona WIB), <code>limit</code> sampai 500, serta <code>total_paid_amount</code>.</p>')}
${endpoint('GET', '/transactions/provider', 'butuh API key', '<p>Membaca mutasi langsung dari Partner Portal ShopeePay (butuh sesi aktif).</p>')}
${box({ curl: `curl "${base}/transactions/all?status=PAID&start_date=2026-10-01&end_date=2026-10-31&limit=100" \\\n  -H "X-API-Key: API_KEY_KAMU"` })}</section>

<section id="ops"><h2><span class="n">08</span>Operasional</h2>
${endpoint('GET', '/api/health', 'publik', '<p>Cek hidup. Mengembalikan <code>{"status":"online"}</code> tanpa data sensitif.</p>')}
${endpoint('GET', '/token-status', 'butuh API key', '<p>Menguji sesi ShopeePay: <code>VALID</code>, <code>INVALID</code>, <code>UNVERIFIED</code>, atau <code>NOT_CONFIGURED</code>.</p>')}
${endpoint('POST', '/update-session', 'butuh API key', '<p>Mengganti sesi portal di memori. Body: <code>{"curl": "…hasil Copy as cURL…"}</code>. Bisa juga lewat dashboard → Sistem.</p>')}
${endpoint('GET', '/cron/tick', 'API key / CRON_SECRET', '<p>Satu putaran pemantauan: menutup invoice kedaluwarsa, mencocokkan mutasi, dan mengirim callback tertunda. Jadwalkan tiap menit dari cron eksternal bila berjalan di Vercel.</p>')}
${endpoint('GET', '/callbacks', 'butuh API key', '<p>Antrean callback. Pantau <code>status=FAILED</code>; kirim ulang dengan <code>POST /callbacks/retry</code> dan body <code>{"order_id": "…"}</code>.</p>')}</section>

<section id="error"><h2><span class="n">09</span>Kode error</h2>
<p>Semua error berbentuk <code>{"success": false, "error": {"code": "…", "message": "…"}}</code>.</p>
<table class="kv errtbl"><thead><tr><th>Kode</th><th>HTTP</th><th>Arti</th></tr></thead><tbody>${errors.map(([c, s, d]) => `<tr><td><code>${esc(c)}</code></td><td class="mono">${s}</td><td>${d}</td></tr>`).join('')}</tbody></table>
<h3>Batas</h3>
<ul><li>Nominal: Rp${min} – Rp${max} per invoice.</li><li>Rate limit: ${limits.rate_limit} request per menit per IP.</li><li>Masa berlaku invoice: ${limits.ttl_minutes} menit, ditambah tenggang ${limits.grace_minutes} menit untuk mutasi yang terlambat.</li></ul></section>
</article></div>
<script src="/assets/docs.js?v=${V('docs.js')}"></script></body></html>`;
}

module.exports = { assets, loginPage, dashboardPage, payPage, payNotFoundPage, docsPage };
