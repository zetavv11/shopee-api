(function () {
  'use strict';
  var boot = JSON.parse(document.getElementById('boot').textContent);
  var left = document.getElementById('left');
  var st = document.getElementById('st');
  var stamp = document.getElementById('stamp');
  var qr = document.getElementById('qr');
  var hint = document.getElementById('hint');
  var exp = new Date(boot.expires_at).getTime();
  var done = boot.status !== 'PENDING';

  function finish(status) {
    if (done && stamp.classList.contains('on')) return;
    done = true;
    stamp.className = 'stamp-big on ' + status;
    stamp.textContent = status === 'PAID' ? 'Lunas' : 'Selesai';
    st.textContent = status === 'PAID' ? 'LUNAS' : status === 'EXPIRED' ? 'KEDALUWARSA' : status;
    qr.style.opacity = '0.12';
    left.textContent = status === 'PAID' ? '—' : '0:00';
    hint.textContent = status === 'PAID' ? 'Pembayaran diterima. Terima kasih! Kamu boleh menutup halaman ini.' : 'Invoice ini sudah tidak aktif. Minta QRIS baru ke penjual.';
  }
  if (done) { finish(boot.status); return; }

  setInterval(function () {
    if (done) return;
    var s = Math.max(0, Math.round((exp - Date.now()) / 1000));
    left.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }, 500);

  function poll() {
    if (done || document.hidden) return;
    fetch('/pay/' + boot.id + '/status', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.status && j.status !== 'PENDING') finish(j.status); })
      .catch(function () {});
  }
  setInterval(poll, 4000);
  document.addEventListener('visibilitychange', poll);

  document.getElementById('copy-amt').addEventListener('click', function (e) {
    var b = e.currentTarget, t = b.textContent;
    var v = String(boot.payable);
    var ok = function () { b.textContent = 'tersalin ✓'; setTimeout(function () { b.textContent = t; }, 1300); };
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(ok, ok); else ok();
  });
})();
