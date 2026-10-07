// update-check.js — lets a long-open tab discover new releases without a hard
// refresh. Polls version.txt (bumped on every release); when the server's
// version differs from this page's APP_VERSION, a calm toast offers one-click
// Refresh. Never force-reloads: interrupting a live hand would be terrible.
(function () {
  'use strict';

  var POLL_MS = 5 * 60 * 1000;   // steady-state poll
  var FIRST_CHECK_MS = 30 * 1000; // one early check, catches deploys mid-session

  var myVersion = (typeof window !== 'undefined' && typeof window.APP_VERSION === 'string')
    ? window.APP_VERSION : null;
  if (!myVersion) return; // dev build without a stamped version: stay quiet

  var toastShown = false;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showToast(serverVersion) {
    toastShown = true;
    var el = document.createElement('div');
    el.className = 'update-toast';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="update-toast-msg">New version available (v' + esc(serverVersion) + ')</span>' +
      '<button type="button" class="update-toast-btn">Refresh</button>';
    var btn = el.querySelector('button');
    if (btn) btn.addEventListener('click', function () { location.reload(); });
    document.body.appendChild(el);
    var raf = window.requestAnimationFrame || function (fn) { fn(); };
    raf(function () { el.classList.add('show'); });
  }

  function check() {
    if (toastShown || document.hidden) return; // background tabs wait for visibilitychange
    if (typeof fetch === 'undefined') return;
    fetch('version.txt', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return null;
      return r.text();
    }).then(function (t) {
      if (!t) return;
      var v = t.trim();
      if (v && v !== myVersion) showToast(v);
    }).catch(function () { /* offline or unreachable: stay quiet, retry next poll */ });
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check();
    });
  }
  setInterval(check, POLL_MS);
  setTimeout(check, FIRST_CHECK_MS);
})();
