// names.js — Player and bot display names for Poker Sparring.
// The user picks a username for themselves and can rename any bot archetype.
// Overrides are keyed by archetype id and stored in localStorage, so the
// underlying archetype (and its playstyle) never changes — only the label.
//
// DOM-free except for guarded localStorage access: in Node/tests the store
// falls back to memory, so this file runs in the unit suite like the rest of
// the core layer. Load order: after bots.js, before ui.js.

var NamePrefs = (function () {
  'use strict';

  var USERNAME_KEY = 'ps_username_v1';
  var BOT_NAMES_KEY = 'ps_bot_names_v1';
  var MAX_LEN = 18;

  var mem = {}; // fallback when localStorage is unavailable (Node/tests)

  function rawStore() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch { /* private mode etc. */ }
    return null;
  }

  function read(key) {
    var s = rawStore();
    if (s) { try { return s.getItem(key); } catch { return mem[key] || null; } }
    return mem[key] || null;
  }

  function write(key, val) {
    var s = rawStore();
    if (s) { try { s.setItem(key, val); return; } catch { /* fall through */ } }
    mem[key] = val;
  }

  function clean(name) {
    return String(name == null ? '' : name).trim().slice(0, MAX_LEN);
  }

  function getUsername() {
    return clean(read(USERNAME_KEY));
  }

  function setUsername(name) {
    write(USERNAME_KEY, clean(name));
  }

  function getBotOverrides() {
    try {
      var o = JSON.parse(read(BOT_NAMES_KEY) || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch { return {}; }
  }

  function setBotOverride(id, name) {
    var o = getBotOverrides();
    var n = clean(name);
    if (n) o[id] = n; else delete o[id]; // empty name resets to the default
    write(BOT_NAMES_KEY, JSON.stringify(o));
  }

  function clearBotOverride(id) {
    setBotOverride(id, '');
  }

  // Display name for an archetype object (or id with a lookup). Never mutates
  // the archetype: the id stays the key for all game logic.
  function displayName(archetype, overrides) {
    if (!archetype) return '';
    var o = overrides || getBotOverrides();
    var custom = o[archetype.id];
    if (custom) return clean(custom);
    return archetype.name || archetype.id || '';
  }

  // Hero's seat label: username when set, 'You' otherwise.
  function heroName() {
    return getUsername() || 'You';
  }

  function resetAll() {
    write(USERNAME_KEY, '');
    write(BOT_NAMES_KEY, '{}');
  }

  return {
    getUsername: getUsername,
    setUsername: setUsername,
    getBotOverrides: getBotOverrides,
    setBotOverride: setBotOverride,
    clearBotOverride: clearBotOverride,
    displayName: displayName,
    heroName: heroName,
    resetAll: resetAll,
    MAX_LEN: MAX_LEN
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NamePrefs: NamePrefs };
}
