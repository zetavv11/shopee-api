(function () {
  'use strict';
  function cp(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = 'tersalin ✓'; setTimeout(function () { btn.textContent = t; }, 1300); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done); else done();
  }
  // Tab bahasa: semua blok kode dalam satu halaman ikut berpindah bahasa.
  var lang = 'curl';
  try { lang = localStorage.getItem('zp-lang') || 'curl'; } catch (e) {}
  function applyLang() {
    document.querySelectorAll('.codebox').forEach(function (box) {
      var first = box.querySelector('pre');
      var use = box.querySelector('pre[data-lang="' + lang + '"]') ? lang : first ? first.dataset.lang : null;
      box.querySelectorAll('pre').forEach(function (p) { p.classList.toggle('hide', p.dataset.lang !== use); });
      box.querySelectorAll('.bar button[data-lang]').forEach(function (b) { b.classList.toggle('on', b.dataset.lang === use); });
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.bar button[data-lang]');
    if (b) { lang = b.dataset.lang; try { localStorage.setItem('zp-lang', lang); } catch (x) {} applyLang(); return; }
    var c = e.target.closest('[data-copy-code]');
    if (c) { var pre = c.closest('.codebox').querySelector('pre:not(.hide)'); if (pre) cp(pre.textContent, c); return; }
    var u = e.target.closest('[data-copy-text]');
    if (u) cp(u.dataset.copyText, u);
  });
  applyLang();

  // Scrollspy daftar isi
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
  var map = links.map(function (a) { return { a: a, s: document.getElementById(a.getAttribute('href').slice(1)) }; }).filter(function (x) { return x.s; });
  function spy() {
    var y = window.scrollY + 130, cur = map[0];
    map.forEach(function (m) { if (m.s.offsetTop <= y) cur = m; });
    links.forEach(function (a) { a.classList.toggle('on', cur && a === cur.a); });
  }
  window.addEventListener('scroll', spy, { passive: true });
  spy();
})();
