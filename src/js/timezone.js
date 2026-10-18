"use strict";
/*
  Daheer time zone
  ---------------------------------------------------------------
  Works like the "where are you?" step of a Linux installer: the zone is detected from the system,
  shown first, and the user can search any country or city to change it. The choice is stored as
  settings.tz (an IANA id such as "Africa/Casablanca"); an empty value follows the system clock.

    D.now()            a Date whose local fields (getHours() ...) show the wall clock of the chosen zone
    D.tz.picker(el)    the searchable country/city combobox
    D.tz.timeParts(d)  { hour, min, ap } honouring the 12/24-hour setting
*/
(function () {
    'use strict';
    var D = window.D, t = D.t, esc = D.esc, $ = D.$;
    var entries = [], byId = {}, aliases = {};
    (function parse() {
        D.tzdata.zones.split('|').forEach(function (g) {
            var p = g.split(':'), cc = p[0];
            p[1].split(',').forEach(function (id) { var e = { id: id, cc: cc, city: cityOf(id) }; entries.push(e); byId[id] = e; });
        });
        D.tzdata.aliases.split('|').forEach(function (a) { var p = a.split('>'); if (p[1])
            aliases[p[0]] = p[1]; });
    })();
    function cityOf(id) { var s = id.split('/'); return s[s.length - 1].replace(/_/g, ' '); }
    function canon(id) { return aliases[id] || id; }
    function lang() { return (D.i18n && D.i18n.lang) || 'en'; }
    /* ---------- zone lookup ---------- */
    function valid(id) { try {
        new Intl.DateTimeFormat('en-US', { timeZone: id });
        return true;
    }
    catch (e) {
        return false;
    } }
    function systemZone() { try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    }
    catch (e) {
        return '';
    } }
    function detected() { var z = canon(systemZone()); return z && valid(z) ? z : 'UTC'; }
    function current() {
        var S = D.store && D.store.S, z = S && S.settings && S.settings.tz;
        z = z ? canon(z) : '';
        return z && valid(z) ? z : '';
    }
    function effective() { return current() || detected(); }
    /* ---------- reading the clock in a zone ---------- */
    var fmts = {};
    function wallFmt(id) {
        return fmts[id] || (fmts[id] = new Intl.DateTimeFormat('en-US', { timeZone: id, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
    }
    function parts(date, id) {
        var o = {};
        wallFmt(id).formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
        return { y: +o.year, m: +o.month - 1, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
    }
    function now() {
        var z = current();
        if (!z || z === canon(systemZone()))
            return new Date();
        var p = parts(new Date(), z);
        return new Date(p.y, p.m, p.d, p.h, p.mi, p.s);
    }
    function offsetMinutes(id, at) {
        var d = at || new Date(), p = parts(d, id);
        return Math.round((Date.UTC(p.y, p.m, p.d, p.h, p.mi, p.s) - Math.floor(d.getTime() / 1000) * 1000) / 60000);
    }
    function offsetLabel(min) {
        var sign = min < 0 ? '\u2212' : '+', a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
        return 'UTC' + sign + h + (m ? ':' + (m < 10 ? '0' : '') + m : '');
    }
    /* ---------- names ---------- */
    var dn = {};
    function country(cc) {
        try {
            var l = lang();
            return (dn[l] || (dn[l] = new Intl.DisplayNames([l], { type: 'region' }))).of(cc) || cc;
        }
        catch (e) {
            return cc;
        }
    }
    function place(id) {
        var e = byId[id];
        return e ? e.city + ', ' + country(e.cc) : cityOf(id);
    }
    /* ---------- 12 / 24 hour display ---------- */
    function hour12() {
        var f = D.store.S.settings.clockFormat;
        if (f === '12')
            return true;
        if (f === '24')
            return false;
        try {
            return !!new Intl.DateTimeFormat(lang(), { hour: 'numeric' }).resolvedOptions().hour12;
        }
        catch (e) {
            return false;
        }
    }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function meridiem(d) {
        try {
            var p = new Intl.DateTimeFormat(lang(), { hour: 'numeric', hour12: true }).formatToParts(d).filter(function (x) { return x.type === 'dayPeriod'; })[0];
            if (p)
                return p.value;
        }
        catch (e) { /* fall through */ }
        return d.getHours() < 12 ? 'AM' : 'PM';
    }
    function timeParts(d) {
        var h = d.getHours(), h12 = hour12();
        return { hour: h12 ? String(h % 12 || 12) : pad2(h), min: pad2(d.getMinutes()), ap: h12 ? meridiem(d) : '' };
    }
    var rowFmts = {};
    function timeIn(id) {
        var key = id + '|' + lang() + '|' + hour12();
        var f = rowFmts[key] || (rowFmts[key] = new Intl.DateTimeFormat(lang() + '-u-nu-latn', { timeZone: id, hour: 'numeric', minute: '2-digit', hour12: hour12() }));
        return f.format(new Date());
    }
    function set(id) { D.store.mutate(function (S) { S.settings.tz = id; }); }
    /* ---------- the picker ---------- */
    function fold(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
    var uid = 0;
    function picker(host, opts) {
        var value = canon(opts.value || effective()), n = ++uid, listId = 'tzl' + n, active = -1, rows = [];
        var english = {};
        try {
            var en = new Intl.DisplayNames(['en'], { type: 'region' });
            entries.forEach(function (e) { if (!english[e.cc])
                english[e.cc] = en.of(e.cc) || ''; });
        }
        catch (e) { /* optional */ }
        host.classList.add('tzpick');
        host.innerHTML = '<div class="tz-field"><span class="tz-ic" aria-hidden="true">' + D.icon('globe') + '</span>' +
            '<input class="inp tz-input" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="' + listId + '" autocomplete="off" spellcheck="false" placeholder="' + esc(t('tz.search')) + '" aria-label="' + esc(t('tz.title')) + '">' +
            '<span class="tz-now" aria-hidden="true"></span></div>' +
            '<ul class="tz-list" role="listbox" id="' + listId + '" hidden></ul>' +
            '<button type="button" class="tz-detect" hidden></button>';
        var input = $('.tz-input', host), list = $('.tz-list', host), nowEl = $('.tz-now', host), detect = $('.tz-detect', host);
        function paintValue() {
            input.value = place(value);
            nowEl.textContent = timeIn(value) + ' \u00b7 ' + offsetLabel(offsetMinutes(value));
            var det = detected();
            if (value !== det) {
                detect.hidden = false;
                detect.textContent = t('tz.useDetected', { place: place(det) });
            }
            else
                detect.hidden = true;
        }
        function filter(q) {
            var f = fold(q.trim()), det = detected();
            var scored = entries.map(function (e) {
                var c = fold(country(e.cc)), ce = fold(english[e.cc] || ''), city = fold(e.city), score = 9;
                if (!f)
                    score = e.id === det ? 0 : e.id === value ? 1 : 5;
                else if (city.indexOf(f) === 0)
                    score = 0;
                else if (c.indexOf(f) === 0 || ce.indexOf(f) === 0)
                    score = 1;
                else if (city.indexOf(f) > 0 || (' ' + city).indexOf(' ' + f) >= 0)
                    score = 2;
                else if (c.indexOf(f) >= 0 || ce.indexOf(f) >= 0 || fold(e.id).indexOf(f) >= 0 || e.cc.toLowerCase() === f)
                    score = 3;
                return { e: e, score: score, key: city };
            }).filter(function (x) { return x.score < 9; });
            scored.sort(function (a, b) { return a.score - b.score || (a.key < b.key ? -1 : 1); });
            return scored.slice(0, 80).map(function (x) { return x.e; });
        }
        function render(q) {
            rows = filter(q);
            var det = detected();
            list.innerHTML = rows.length ? rows.map(function (e, i) {
                return '<li role="option" id="' + listId + '-' + i + '" data-id="' + esc(e.id) + '" aria-selected="' + (e.id === value) + '">' +
                    '<span class="tz-main"><b>' + esc(e.city) + '</b><small>' + esc(country(e.cc)) + (e.id === det ? ' \u00b7 ' + esc(t('tz.detected')) : '') + '</small></span>' +
                    '<span class="tz-time">' + esc(timeIn(e.id)) + '<small>' + esc(offsetLabel(offsetMinutes(e.id))) + '</small></span></li>';
            }).join('') : '<li class="tz-none" role="presentation">' + esc(t('tz.none')) + '</li>';
            active = rows.length ? Math.max(0, rows.map(function (e) { return e.id; }).indexOf(value)) : -1;
            if (q.trim())
                active = rows.length ? 0 : -1;
            highlight(true);
        }
        function highlight(scroll) {
            $$('[role="option"]', list).forEach(function (li, i) { li.classList.toggle('on', i === active); });
            if (active >= 0) {
                input.setAttribute('aria-activedescendant', listId + '-' + active);
                var li = $('#' + listId + '-' + active, list);
                if (li && scroll !== false)
                    li.scrollIntoView({ block: 'nearest' });
            }
            else
                input.removeAttribute('aria-activedescendant');
        }
        function open() { if (!list.hidden)
            return; render(''); list.hidden = false; input.setAttribute('aria-expanded', 'true'); host.classList.add('open'); input.select(); }
        function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); host.classList.remove('open'); paintValue(); }
        function choose(id) { value = id; close(); if (opts.onChange)
            opts.onChange(id); }
        input.addEventListener('focus', open);
        input.addEventListener('pointerdown', function () { if (list.hidden)
            open(); });
        input.addEventListener('input', function () { list.hidden = false; input.setAttribute('aria-expanded', 'true'); host.classList.add('open'); render(input.value); });
        input.addEventListener('blur', function () { setTimeout(function () { if (!host.contains(document.activeElement))
            close(); }, 0); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (list.hidden)
                    open();
                else {
                    active = Math.max(0, Math.min(rows.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
                    highlight();
                }
            }
            else if (e.key === 'Enter') {
                if (!list.hidden) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (active >= 0 && rows[active])
                        choose(rows[active].id);
                }
            }
            else if (e.key === 'Escape') {
                if (!list.hidden) {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                }
            }
        });
        // keep focus in the field while the list is used, and respond on press (not release)
        list.addEventListener('mousedown', function (e) { e.preventDefault(); });
        list.addEventListener('click', function (e) { var li = e.target.closest('[data-id]'); if (li)
            choose(li.dataset.id); });
        list.addEventListener('mousemove', function (e) { var li = e.target.closest('[role="option"]'); if (!li)
            return; var i = $$('[role="option"]', list).indexOf(li); if (i !== active) {
            active = i;
            highlight(false);
        } });
        detect.addEventListener('click', function () { choose(detected()); });
        paintValue();
        host.__tz = { get value() { return value; }, set: function (id) { value = canon(id); paintValue(); } };
        return host.__tz;
    }
    function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
    D.now = now;
    D.tz = { now: now, parts: parts, detected: detected, current: current, effective: effective, offsetMinutes: offsetMinutes, offsetLabel: offsetLabel, place: place, country: country, hour12: hour12,
        timeParts: timeParts, timeIn: timeIn, set: set, picker: picker, valid: valid, count: function () { return entries.length; } };
})();
