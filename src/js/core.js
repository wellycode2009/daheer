"use strict";
/* Daheer core: tiny helpers shared by every module */
(function () {
    'use strict';
    var D = window.D = window.D || {};
    D.$ = function (s, r) { return (r || document).querySelector(s); };
    D.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
    var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    D.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
    D.uid = function (p) { return (p || 'x') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); };
    D.debounce = function (fn, ms) { var t; var f = function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; f.flush = function () { clearTimeout(t); }; return f; };
    D.reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    D.icon = function (id, cls) { return '<svg class="i ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>'; };
    D.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    D.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
    // event bus
    var subs = {};
    D.on = function (ev, fn) { (subs[ev] = subs[ev] || []).push(fn); };
    D.emit = function (ev, data) { (subs[ev] || []).slice().forEach(function (f) { try {
        f(data);
    }
    catch (e) {
        console.error(e);
    } }); };
    // strings register themselves here, per module (see strings-*.js)
    D.strings = { en: {}, ar: {}, fr: {}, es: {}, zh: {}, ja: {}, ko: {} };
    D.addStrings = function (en, ar) { Object.assign(D.strings.en, en); Object.assign(D.strings.ar, ar); };
    D.addLanguage = function (lang, strings) { D.strings[lang] = D.strings[lang] || {}; Object.assign(D.strings[lang], strings); };
})();
