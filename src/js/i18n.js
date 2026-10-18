"use strict";
/*
  Daheer i18n
  ---------------------------------------------------------------
  - t('key', {n: 3})   looks the text up in js/strings.js. A value can be a
                       plain string or a plural object {one, other} (Arabic
                       uses zero / one / two / few / many / other).
  - N(12.5)            formats a number with Western (0-9) or Arabic-Indic digits.
  - fmtDate(...)       dates, always in the Gregorian calendar.
  - setLang('ar')      switches the whole UI to RTL (sidebar moves right).
*/
(function () {
    'use strict';
    var D = window.D = window.D || {};
    var lang = 'en', digits = 'latn', rules = new Intl.PluralRules('en');
    var AR_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';
    function lookup(key) {
        var S = D.strings;
        var v = S[lang] && S[lang][key];
        if (v == null)
            v = S.en[key];
        return v;
    }
    function digitize(s) {
        if (digits !== 'arab')
            return s;
        return String(s).replace(/[0-9]/g, function (c) { return AR_DIGITS[+c]; }).replace(/\./g, '\u066B');
    }
    function t(key, p) {
        var v = lookup(key);
        if (v == null) {
            if (window.console)
                console.warn('missing string: ' + key);
            return key;
        }
        p = p || {};
        if (typeof v === 'object')
            v = v[rules.select(p.n != null ? p.n : 0)] || v.other || '';
        return v.replace(/\{(\w+)\}/g, function (m, name) {
            if (p[name] == null)
                return m;
            return (typeof p[name] === 'number') ? N(p[name]) : p[name];
        });
    }
    // number -> text in the chosen digit style. opts: {dp: decimals, max}
    function N(x, dp) {
        if (x == null || isNaN(x))
            return '\u2013';
        var s = dp != null ? Number(x).toFixed(dp) : String(Math.round(x * 100) / 100);
        return digitize(s);
    }
    function pct(x) { return x == null ? '\u2013' : N(Math.round(x * 100)) + '%'; }
    function locale() {
        if (lang === 'ar')
            return 'ar-u-ca-gregory-nu-' + (digits === 'arab' ? 'arab' : 'latn');
        return ({
            fr: 'fr-FR-u-ca-gregory',
            es: 'es-ES-u-ca-gregory',
            zh: 'zh-CN-u-ca-gregory',
            ja: 'ja-JP-u-ca-gregory',
            ko: 'ko-KR-u-ca-gregory',
            en: 'en-US-u-ca-gregory'
        })[lang] || 'en-US-u-ca-gregory';
    }
    // d: JS Date or 'YYYY-MM-DD'
    function toDate(d) { if (typeof d === 'string') {
        var p = d.split('-');
        return new Date(+p[0], +p[1] - 1, +p[2]);
    } return d; }
    function fmtDate(d, opts) { return new Intl.DateTimeFormat(locale(), opts).format(toDate(d)); }
    function fmtTime(mins) {
        var d = new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60);
        return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(d);
    }
    function weekdayName(dow, style) {
        return new Intl.DateTimeFormat(locale(), { weekday: style || 'long' }).format(new Date(2023, 0, 1 + dow));
    }
    function monthName(m, style) { return new Intl.DateTimeFormat(locale(), { month: style || 'long' }).format(new Date(2023, m, 1)); }
    function dur(min) {
        var h = Math.floor(min / 60), m = Math.round(min % 60);
        if (h && m)
            return t('dur.hm', { h: h, m: m });
        if (h)
            return t('dur.h', { h: h });
        return t('dur.m', { m: m });
    }
    // "5 minutes ago" style
    function ago(ts) {
        var s = Math.max(0, (Date.now() - ts) / 1000);
        if (s < 45)
            return t('ago.now');
        if (s < 3600)
            return t('ago.m', { n: Math.round(s / 60) });
        if (s < 86400)
            return t('ago.h', { n: Math.round(s / 3600) });
        return t('ago.d', { n: Math.round(s / 86400) });
    }
    // fill static markup:  data-i18n="key"  data-i18n-attr="placeholder:key;aria-label:key2"
    function apply(root) {
        (root || document).querySelectorAll('[data-i18n]').forEach(function (el) {
            el.textContent = t(el.dataset.i18n);
            el.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        });
        (root || document).querySelectorAll('[data-i18n-attr]').forEach(function (el) {
            el.dataset.i18nAttr.split(';').forEach(function (pair) {
                var a = pair.split(':');
                if (a[1])
                    el.setAttribute(a[0].trim(), t(a[1].trim()));
            });
        });
    }
    function setLang(l) {
        lang = /^(en|ar|fr|es|zh|ja|ko)$/.test(l) ? l : 'en';
        rules = new Intl.PluralRules(lang);
        var h = document.documentElement;
        h.lang = lang;
        // Arabic is a true RTL UI: the document direction controls grid/flex flow,
        // while code/calculator/time surfaces can opt back into LTR with dir="ltr".
        h.dir = lang === 'ar' ? 'rtl' : 'ltr';
        h.dataset.textDir = h.dir;
        document.title = t('app.title');
        apply();
    }
    function setDigits(d) { digits = d === 'arab' ? 'arab' : 'latn'; }
    /* ----- Arabic type -----
       Thmanyah is installed privately on the user's machine. Electron reads the
       original, unmodified WOFF2 files through the preload bridge and constructs
       FontFace objects in memory before the Arabic UI is rendered. */
    var arabicLoaded = null;
    var AR_FONTS = [
        ['Thmanyah Sans', 'thmanyahsans', [['Light', 300], ['Regular', 400], ['Medium', 500], ['Bold', 700], ['Black', 900]]],
        ['Thmanyah Serif Display', 'thmanyahserifdisplay', [['Light', 300], ['Regular', 400], ['Medium', 500], ['Bold', 700], ['Black', 900]]],
        ['Thmanyah Serif Text', 'thmanyahseriftext', [['Light', 300], ['Regular', 400], ['Medium', 500], ['Bold', 700], ['Black', 900]]]
    ];
    function loadArabicFonts() {
        if (arabicLoaded)
            return arabicLoaded;
        var native = window.daheerNative;
        if (!native || !native.loadFont) {
            arabicLoaded = Promise.resolve(false);
            return arabicLoaded;
        }
        var jobs = [];
        AR_FONTS.forEach(function (f) {
            f[2].forEach(function (w) {
                var file = f[1] + '-' + w[0] + '.woff2';
                jobs.push(native.loadFont(file).then(function (buf) {
                    var data = buf instanceof ArrayBuffer ? buf : (ArrayBuffer.isView(buf) ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf);
                    var face = new FontFace(f[0], data, { weight: String(w[1]), style: 'normal', display: 'swap' });
                    return face.load().then(function () { document.fonts.add(face); });
                }));
            });
        });
        arabicLoaded = Promise.all(jobs).then(function () {
            document.documentElement.classList.add('ar-fonts');
            return true;
        }).catch(function (err) {
            console.warn('Thmanyah fonts unavailable; using Arabic fallback fonts.', err);
            return false;
        });
        return arabicLoaded;
    }
    D.t = t;
    D.N = N;
    D.digits = digitize;
    D.pct = pct;
    D.fmtDate = fmtDate;
    D.fmtTime = fmtTime;
    D.weekdayName = weekdayName;
    D.monthName = monthName;
    D.dur = dur;
    D.ago = ago;
    D.i18n = { apply: apply, setLang: setLang, setDigits: setDigits, loadArabicFonts: loadArabicFonts, get lang() { return lang; }, get digits() { return digits; } };
    D.isRTL = function () { return lang === 'ar'; };
})();
