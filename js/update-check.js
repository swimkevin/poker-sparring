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
    // Dismissible: the X just hides the toast so you can finish your hand.
    // Online tables auto-rejoin by name after refresh; offline hands are lost
    // on refresh (history is kept, the live hand is not).
    el.innerHTML =
      '<span class="update-toast-msg">New version available (v' + esc(serverVersion) + ')</span>' +
      '<button type="button" class="update-toast-btn">Refresh</button>' +
      '<button type="button" class="update-toast-x" aria-label="Dismiss">✕</button>';
    var btn = el.querySelector('.update-toast-btn');
    // Force a cache-bypassing reload: append the version as a query param so
    // the browser fetches a fresh index.html (which itself cache-busts all
    // its assets via ?v= params). Plain location.reload() can serve stale HTML.
    if (btn) btn.addEventListener('click', function () {
      var u = window.location.pathname + '?v=' + encodeURIComponent(serverVersion) + window.location.hash;
      window.location.href = u;
    });
    var x = el.querySelector('.update-toast-x');
    if (x) x.addEventListener('click', function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
      // Remind again in 30 minutes, not never — the update still matters.
      setTimeout(function () { toastShown = false; }, 30 * 60 * 1000);
    });
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
