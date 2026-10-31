(function () {
  'use strict';
  var form = document.getElementById('login-form');
  var err = document.getElementById('login-err');
  var pw = document.getElementById('pw');
  document.getElementById('pw-toggle').addEventListener('click', function (e) {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'SEMBUNYI' : 'LIHAT';
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.textContent = '';
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    fetch('/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.username.value, password: pw.value }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (r.ok && r.j.success) {
          var next = new URLSearchParams(location.search).get('next');
          location.href = next && /^\/[A-Za-z0-9\/_-]*$/.test(next) && next.indexOf('//') !== 0 ? next : '/dashboard';
        } else {
          err.textContent = (r.j.error && r.j.error.message) || 'Login gagal.';
          btn.disabled = false;
          pw.select();
        }
      })
      .catch(function () { err.textContent = 'Tidak dapat menghubungi server.'; btn.disabled = false; });
  });
})();
