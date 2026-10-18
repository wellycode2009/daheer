"use strict";
/*
  Daheer app shell
  ---------------------------------------------------------------
  Boots the store, renders whichever view is active into #viewport, and wires
  the sidebar: navigation, the streak mini-card, ambience toggles, and the
  theme / language switches (both go through D.pixel.run so the DOM change
  happens invisibly under the pixel-transition cover).
*/
(function () {
    'use strict';
    var D = window.D, HM = window.HM, t = D.t, N = D.N, esc = D.esc, icon = D.icon, $ = D.$, $$ = D.$$;
    var VIEWS = {
        desk: { render: D.desk.render, bind: D.desk.bind, pad: true },
        notes: { render: D.notes.render, bind: D.notes.bind, pad: false },
        habits: { render: D.habits.render, bind: D.habits.bind, pad: true },
        focus: { render: D.focus.render, bind: D.focus.bind, pad: true },
        tools: { render: D.tools.render, bind: D.tools.bind, pad: true },
        insights: { render: D.insights.render, bind: D.insights.bind, pad: true },
        adventure: { render: D.adventure.render, bind: D.adventure.bind, pad: true },
        achievements: { render: D.achievements.render, bind: null, pad: true }
    };
    var current = 'desk';
    function go(view) {
        if (!VIEWS[view])
            view = 'desk';
        if (current === 'tools' && view !== 'tools' && D.tools.suspend)
            D.tools.suspend();
        current = view;
        D.store.mutate(function (S) { S.meta.lastPage = view; }, { silent: true });
        paintNav();
        renderView();
        $('#main').scrollTop = 0;
    }
    D.go = go;
    D.refresh = function () { renderView(); };
    function renderView() {
        var v = VIEWS[current], root = $('#viewport');
        root.className = 'view' + (v.pad ? ' pad' : '');
        try {
            v.render(root);
            if (v.bind)
                v.bind(root);
        }
        catch (e) {
            console.error('render failed for view "' + current + '":', e);
            root.innerHTML = '<div class="card c-paper" style="margin:24px"><h3>' + esc(t('app.title')) + '</h3><p class="meta">' + esc(e.message || String(e)) + '</p><button class="btn" data-go="desk">' + icon('desk') + esc(t('nav.desk')) + '</button></div>';
        }
    }
    function paintNav() {
        $$('.nav button').forEach(function (b) {
            var on = b.dataset.go === current;
            b.toggleAttribute('aria-current', on);
            if (on)
                b.setAttribute('aria-current', 'page');
            else
                b.removeAttribute('aria-current');
        });
    }
    /* ---------- streak mini-card + capture bar live update ---------- */
    function paintChrome() {
        var s = D.habits.summary(), c = s.comp;
        $('#dayStreak').textContent = t('unit.day', { n: c.chain.cur });
        $('#miniTxt').textContent = D.store.activeHabits().length ? t('d.hcount', { a: s.done, b: s.total }) : t('hb.sub.empty');
        $('#miniBar').style.width = Math.round((s.total ? s.done / s.total : 0) * 100) + '%';
        $$('[data-sound]').forEach(function (b) { });
    }
    D.paintChrome = paintChrome;
    /* ---------- brand wordmark swap ---------- */
    function paintBrand() {
        var brand = $('.brand');
        var en = $('.brand .brand-logo-en');
        var ar = $('.brand .brand-logo-ar');
        var rtl = D.isRTL();
        if (en)
            en.style.display = rtl ? 'none' : 'block';
        if (ar)
            ar.style.display = rtl ? 'flex' : 'none';
        if (brand)
            brand.setAttribute('aria-label', rtl ? 'ظهير' : 'Daheer');
    }
    /* ---------- theme ---------- */
    function isDark() {
        var t0 = D.store.S.settings.theme;
        if (t0 === 'dark')
            return true;
        if (t0 === 'light')
            return false;
        return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    }
    D.isDark = isDark;
    function applyTheme() {
        var d = isDark();
        document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
        $('#themeBtn use').setAttribute('href', d ? '#i-sun' : '#i-moon');
        $('#themeBtn .lbl').textContent = t(d ? 'th.day' : 'th.night');
        D.focus && D.focus.refreshRainColor && D.focus.refreshRainColor();
    }
    D.applyTheme = applyTheme;
    function toggleTheme() {
        var next = isDark() ? 'light' : 'dark';
        D.pixel.run(function () {
            D.store.mutate(function (S) { S.settings.theme = next; }, { silent: true });
            applyTheme();
            renderView();
            paintChrome();
        }, next);
    }
    /* ---------- language ---------- */
    function applyLangDigits() {
        D.i18n.setLang(D.store.S.settings.lang);
        D.i18n.setDigits(D.store.S.settings.digits);
        document.body.classList.toggle('rtl', D.isRTL());
        document.body.dir = D.isRTL() ? 'rtl' : 'ltr';
        document.body.dataset.locale = D.store.S.settings.lang;
        paintBrand();
        paintNav();
    }
    D.applyLangDigits = applyLangDigits;
    function transitionLanguage(next, done) {
        var run = function () {
            document.documentElement.dataset.localeSwitching = 'true';
            D.store.mutate(function (S) {
                S.settings.lang = next;
                S.settings.digits = next === 'ar' ? 'arab' : 'latn';
            }, { silent: true });
            applyLangDigits();
            renderView();
            paintChrome();
            requestAnimationFrame(function () { setTimeout(function () { delete document.documentElement.dataset.localeSwitching; if (done)
                done(); }, 120); });
        };
        var fonts = next === 'ar' ? D.i18n.loadArabicFonts() : Promise.resolve(true);
        return fonts.then(function () {
            // The language curtain keeps the DOM covered while typography, RTL flow,
            // and translated strings are swapped together.
            return D.pixel.run(run, D.isDark && D.isDark() ? 'dark' : 'light');
        });
    }
    D.changeLanguageNow = transitionLanguage;
    function toggleLang() {
        var next = D.store.S.settings.lang === 'ar' ? 'en' : 'ar';
        transitionLanguage(next);
    }
    /* ---------- settings dialog ---------- */
    function openSettings() {
        var S = D.store.S, body = document.createElement('div');
        body.innerHTML =
            '<label class="fld"><span>' + esc(t('set.name')) + '</span><input class="inp" data-set="name" value="' + esc(S.settings.name || '') + '" placeholder="' + esc(t('set.nameph')) + '"></label>' +
                '<div class="fld"><span>' + esc(t('tz.title')) + '</span><div data-set-tz></div></div>' +
                '<label class="fld"><span>' + esc(t('tz.format')) + '</span><select class="inp" data-set="clockFormat"><option value="auto">' + esc(t('tz.fmt.auto')) + '</option><option value="12">' + esc(t('tz.fmt.12')) + '</option><option value="24">' + esc(t('tz.fmt.24')) + '</option></select></label>' +
                '<label class="fld"><span>' + esc(t('set.xpgoal')) + '</span><input class="inp" type="number" min="10" step="5" data-set="xpGoal" value="' + S.settings.xpGoal + '"></label>' +
                '<label class="fld"><span>' + esc(t('set.goalmin')) + '</span><input class="inp" type="number" min="10" step="10" data-set="goalMin" value="' + S.settings.goalMin + '"></label>' +
                '<label class="fld row"><input type="checkbox" data-set="sfx"' + (S.settings.sfx ? ' checked' : '') + '> ' + esc(t('set.sfx')) + '</label>' +
                '<label class="fld row"><input type="checkbox" data-set="celebrate"' + (S.settings.celebrate ? ' checked' : '') + '> ' + esc(t('set.celebrate')) + '</label>' +
                '<div class="settings-links"><button class="btn btn-ghost sm" data-set="about">' + icon('leaf') + esc(t('about.open')) + '</button>' +
                '<button class="btn btn-ghost sm" data-set="reset">' + icon('trash') + esc(t('set.reset')) + '</button></div>';
        D.tz.picker(body.querySelector('[data-set-tz]'), { onChange: function (id) { D.tz.set(id); } });
        body.querySelector('[data-set="clockFormat"]').value = S.settings.clockFormat || 'auto';
        body.addEventListener('input', function (e) {
            var k = e.target.dataset.set;
            if (!k)
                return;
            var v = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'number' ? (+e.target.value || 0) : e.target.value);
            D.store.mutate(function (S2) { S2.settings[k] = v; }, { silent: k !== 'clockFormat' }); // the clock format changes what the desk shows
            if (k === 'xpGoal')
                paintChrome();
        });
        body.addEventListener('click', function (e) {
            if (e.target.closest('[data-set="about"]')) {
                D.about.open();
                return;
            }
            if (e.target.closest('[data-set="reset"]')) {
                D.ui.confirm({ title: t('set.resetq'), text: t('set.resettxt'), ok: t('common.delete'), danger: true }).then(function (ok) {
                    if (!ok)
                        return;
                    D.store.reset();
                    go('desk');
                    paintChrome();
                    applyTheme();
                    applyLangDigits();
                    D.ui.dialog.close && D.ui.dialog.close();
                });
            }
        });
        D.ui.dialog({ title: t('set.title'), html: body, actions: [{ label: t('common.close'), kind: 'warm', value: true }] });
    }
    /* ---------- customise: choose which desk cards you see ---------- */
    function openCustomise() {
        var CARDS = [['time', 'd.time'], ['focus', 'cust.focus'], ['sticky', 'cust.sticky'], ['mood', 'mood.title'], ['screen', 'st.title'], ['streak', 'sk.title'], ['growth', 'd.growth'], ['heat', 'd.heat'], ['coll', 'd.ws'], ['amb', 'd.amb']];
        var hid = D.store.S.settings.hiddenCards || [];
        var body = '<p class="dlg-p">' + esc(t('cust.sub')) + '</p><div class="cust-list">' + CARDS.map(function (c) {
            return '<label class="cust-row"><span>' + esc(t(c[1])) + '</span><input type="checkbox" data-card-on="' + c[0] + '"' + (hid.indexOf(c[0]) < 0 ? ' checked' : '') + '></label>';
        }).join('') + '</div><button class="btn btn-ghost sm" data-card-reset>' + esc(t('cust.reset')) + '</button>';
        D.ui.dialog({
            title: t('cust.title'), cls: 'cust', html: body, actions: [{ label: t('common.close'), kind: 'warm', value: true }],
            onOpen: function (box) {
                box.addEventListener('change', function (e) {
                    var k = e.target.dataset && e.target.dataset.cardOn;
                    if (!k)
                        return;
                    var on = e.target.checked;
                    D.store.mutate(function (S) {
                        var h = S.settings.hiddenCards = S.settings.hiddenCards || [], i = h.indexOf(k);
                        if (on && i >= 0) h.splice(i, 1);
                        if (!on && i < 0) h.push(k);
                    });
                    D.refresh();
                });
                box.addEventListener('click', function (e) {
                    if (!e.target.closest('[data-card-reset]'))
                        return;
                    D.store.mutate(function (S) { S.settings.hiddenCards = []; });
                    D.refresh();
                    box.querySelectorAll('[data-card-on]').forEach(function (i) { i.checked = true; });
                });
            }
        });
    }
    /* ---------- command palette ---------- */
    function openPalette(anchor) {
        var items = [
            { label: t('hb.title'), icon: 'sprout', fn: function () { go('habits'); } },
            { label: t('n.new'), icon: 'notes', fn: function () { go('notes'); D.notes.create(''); } },
            { label: t('f.title'), icon: 'timer', fn: function () { go('focus'); } },
            { label: t('in.title'), icon: 'chart', fn: function () { go('insights'); } },
            { label: t('ad.title'), icon: 'gift', fn: function () { go('adventure'); } },
            { label: t('ac.title'), icon: 'gift', fn: function () { go('achievements'); } },
            { label: t('tools.title'), icon: 'tools', fn: function () { go('tools'); } },
            { label: t('calc.title'), icon: 'box', fn: function () { D.calc.open(); } },
            { label: t('he.new'), icon: 'plus', fn: function () { D.habits.openEditor(); } }
        ];
        D.ui.menu(anchor || document.body, items, { at: 'start' });
    }
    /* ---------- boot ---------- */
    function boot() {
        D.store.load();
        applyTheme();
        var lang = D.store.S.settings.lang;
        // Load Thmanyah before the first Arabic paint so the layout is measured with
        // the real family rather than a fallback font.
        (lang === 'ar' ? D.i18n.loadArabicFonts() : Promise.resolve()).then(function () {
            applyLangDigits();
            go(D.store.S.meta.lastPage && VIEWS[D.store.S.meta.lastPage] ? D.store.S.meta.lastPage : 'desk');
            paintChrome();
            document.body.classList.toggle('macos-window', !!(window.daheerNative && window.daheerNative.platform === 'darwin'));
            if (D.onboarding)
                D.onboarding.maybeOpen();
        });
        document.body.addEventListener('click', function (e) {
            var nav = e.target.closest('[data-go]');
            if (nav && nav.closest('.nav')) {
                go(nav.dataset.go);
                return;
            }
            var jump = e.target.closest('[data-go]:not(.nav button)');
            if (jump) {
                go(jump.dataset.go);
                if (jump.dataset.tab)
                    D.habits.setTab(jump.dataset.tab);
                if (jump.dataset.start)
                    D.focus.startIfIdle();
                renderView();
                return;
            }
            if (e.target.closest('#themeBtn'))
                return toggleTheme();
            if (e.target.closest('#langBtn'))
                return D.openLanguagePicker(e.target.closest('#langBtn'));
            if (e.target.closest('#settingsBtn'))
                return openSettings();
            if (e.target.closest('#customiseBtn'))
                return openCustomise();
            var pal = e.target.closest('[data-palette]');
            if (pal)
                return openPalette(pal);
        });
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                openPalette($('[data-palette]') || $('.head') || document.body);
            }
        });
        D.on('change', function (meta) {
            meta = meta || {};
            if (meta.replaced) {
                applyTheme();
                applyLangDigits();
                go('desk');
                paintChrome();
                return;
            }
            if (!meta.silent) {
                paintChrome();
                renderView();
            }
        });
        if (window.matchMedia)
            matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (D.store.S.settings.theme === 'auto')
                applyTheme(); });
    }
    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', boot);
    else
        boot();
})();
