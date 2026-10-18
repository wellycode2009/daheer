"use strict";
/* Daheer desk: the home board. Same cards as the original design, now fed by real data. */
(function () {
    'use strict';
    var D = window.D, HM = window.HM, t = D.t, N = D.N, esc = D.esc, icon = D.icon, $ = D.$;
    /* ---------- the rainy window (the plant grows with your level) ---------- */
    D.scene = function (id, stage) {
        stage = D.clamp(stage || 1, 1, 10);
        var i, drops = '', streaks = '', motes = '', bulbs = '', pines = '';
        // rain: two layers (near drops fall faster and are longer)
        for (i = 0; i < 30; i++) {
            var x = 14 + ((i * 47) % 300), len = 14 + ((i * 7) % 24), delay = ((i * 0.37) % 2.4).toFixed(2), dur = (1.0 + ((i * 13) % 11) / 10).toFixed(2);
            drops += '<line class="drop" x1="' + x + '" y1="-40" x2="' + (x - 3) + '" y2="' + (-40 + len) + '" style="animation-delay:-' + delay + 's;animation-duration:' + dur + 's;opacity:' + (i % 3 ? 1 : .55) + '"/>';
        }
        // drops that run down the glass
        [[62, 70, 5.2], [118, 40, 6.4], [176, 96, 4.4], [236, 54, 5.8], [268, 130, 4.8], [96, 150, 5.6]].forEach(function (r, k) {
            streaks += '<path class="z-run" d="M' + r[0] + ' ' + r[1] + 'c3 18-3 34 1 56s-2 26 0 40" style="animation-delay:-' + (k * 1.7).toFixed(1) + 's;animation-duration:' + r[2] + 's"/>' +
                '<circle class="z-bead" cx="' + r[0] + '" cy="' + (r[1]) + '" r="2.6" style="animation-delay:-' + (k * 1.7).toFixed(1) + 's;animation-duration:' + r[2] + 's"/>';
        });
        // fireflies / dust motes in the lamp light
        [[92, 300], [128, 262], [206, 284], [246, 250], [60, 250], [170, 318], [286, 300]].forEach(function (m, k) {
            motes += '<circle class="z-mote" cx="' + m[0] + '" cy="' + m[1] + '" r="' + (1.3 + (k % 3) * 0.5) + '" style="animation-delay:-' + (k * 0.9).toFixed(1) + 's;animation-duration:' + (5 + (k % 4)) + 's"/>';
        });
        // fairy lights strung across the arch
        function q(a, c, b, tt) { var u = 1 - tt; return [u * u * a[0] + 2 * u * tt * c[0] + tt * tt * b[0], u * u * a[1] + 2 * u * tt * c[1] + tt * tt * b[1]]; }
        var seg = [[[44, 112], [102, 160], [160, 128]], [[160, 128], [218, 160], [276, 112]]];
        seg.forEach(function (sg, si) {
            [0.18, 0.5, 0.82].forEach(function (tt, k) {
                var pt = q(sg[0], sg[1], sg[2], tt), n = si * 3 + k;
                bulbs += '<g class="z-twinkle" style="animation-delay:-' + (n * 0.7).toFixed(1) + 's"><circle cx="' + pt[0].toFixed(1) + '" cy="' + (pt[1] + 5).toFixed(1) + '" r="8" style="fill:var(--lamp);opacity:.22"/>' +
                    '<ellipse cx="' + pt[0].toFixed(1) + '" cy="' + (pt[1] + 5).toFixed(1) + '" rx="2.8" ry="3.8" style="fill:var(--lamp)"/></g>';
            });
        });
        // distant pines on the far hill
        [[112, 232, 1], [124, 230, .8], [150, 226, .7], [268, 222, .9]].forEach(function (pn) { pines += '<path d="M' + pn[0] + ' ' + pn[1] + 'l' + (7 * pn[2]) + ' ' + (-26 * pn[2]) + ' ' + (7 * pn[2]) + ' ' + (26 * pn[2]) + 'z" style="fill:var(--tree);opacity:.75"/>'; });
        var A = id;
        var sc = 1 + (stage - 1) * 0.045, A = id;
        return '<svg viewBox="0 0 320 400" role="img" aria-label="' + esc(t('scene.alt')) + '">' +
            '<defs><linearGradient id="sky-' + A + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient>' +
            '<radialGradient id="gl-' + A + '" cx="85%" cy="95%" r="80%"><stop offset="0" style="stop-color:var(--lamp);stop-opacity:1"/><stop offset="1" style="stop-color:var(--lamp);stop-opacity:0"/></radialGradient>' +
            '<radialGradient id="cg-' + A + '"><stop offset="0" style="stop-color:var(--lamp);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--lamp);stop-opacity:0"/></radialGradient>' +
            '<linearGradient id="fog-' + A + '" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color:var(--sun);stop-opacity:.34"/><stop offset="1" style="stop-color:var(--sun);stop-opacity:0"/></linearGradient>' +
            '<clipPath id="arch-' + A + '"><path d="M24 372V160a136 136 0 0 1 272 0V372z"/></clipPath></defs>' +
            /* ---- the view through the glass ---- */
            '<g clip-path="url(#arch-' + A + ')"><rect width="320" height="400" fill="url(#sky-' + A + ')"/>' +
            '<circle cx="222" cy="118" r="54" style="fill:var(--sun);opacity:.16"/><circle cx="222" cy="118" r="30" style="fill:var(--sun);opacity:.85"/>' +
            '<g class="z-cloud" style="animation-duration:52s"><ellipse cx="84" cy="96" rx="34" ry="9" style="fill:var(--sun);opacity:.34"/><ellipse cx="108" cy="90" rx="22" ry="8" style="fill:var(--sun);opacity:.34"/><ellipse cx="66" cy="92" rx="18" ry="6" style="fill:var(--sun);opacity:.34"/></g>' +
            '<g class="z-cloud" style="animation-duration:70s;animation-direction:alternate-reverse"><ellipse cx="236" cy="162" rx="30" ry="8" style="fill:var(--sun);opacity:.26"/><ellipse cx="256" cy="157" rx="18" ry="7" style="fill:var(--sun);opacity:.26"/></g>' +
            '<path d="M0 250C50 215 90 235 140 220S250 200 320 230V400H0z" style="fill:var(--hill1)"/>' + pines +
            /* little cabin with a lit window and chimney smoke */
            '<g><circle cx="199" cy="209" r="14" style="fill:url(#cg-' + A + ')"/><rect x="190" y="202" width="21" height="15" rx="1.5" style="fill:var(--frame);opacity:.85"/><path d="M187 203l13.5-12 13.5 12z" style="fill:var(--frame)"/>' +
            '<rect x="205" y="191" width="4" height="9" style="fill:var(--frame)"/><rect class="z-twinkle" x="196" y="207" width="6" height="6" rx="1" style="fill:var(--lamp)"/>' +
            '<circle class="z-smoke" cx="207" cy="188" r="3" style="animation-delay:0s"/><circle class="z-smoke" cx="207" cy="188" r="2.6" style="animation-delay:-1.6s"/><circle class="z-smoke" cx="207" cy="188" r="2.2" style="animation-delay:-3.2s"/></g>' +
            '<path d="M0 290C60 255 120 285 180 262S280 262 320 280V400H0z" style="fill:var(--hill2)"/>' +
            '<g style="fill:var(--tree)"><path d="M78 284l12-36 12 36z"/><path d="M82 268l8-28 8 28z"/><path d="M236 276l10-32 10 32z"/><path d="M240 262l6-24 6 24z"/></g>' +
            '<path d="M0 330C70 300 130 325 200 308S290 305 320 320V400H0z" style="fill:var(--hill3)"/>' +
            '<g style="fill:var(--tree)"><path d="M36 328l16-48 16 48z"/><path d="M40 306l12-38 12 38z"/><path d="M272 322l14-44 14 44z"/></g>' +
            '<g>' + drops + '</g>' + streaks +
            '<rect y="250" width="320" height="150" fill="url(#fog-' + A + ')"/>' +
            '<rect width="320" height="400" fill="url(#gl-' + A + ')" style="opacity:var(--glow)"/>' + motes + '</g>' +
            /* ---- window frame ---- */
            '<path d="M24 372V160a136 136 0 0 1 272 0V372z" fill="none" style="stroke:var(--frame)" stroke-width="10" stroke-linejoin="round"/><path d="M160 24V372M24 220H296" fill="none" style="stroke:var(--frame)" stroke-width="6"/>' +
            '<g clip-path="url(#arch-' + A + ')"><path d="M44 110Q102 160 160 128Q218 160 276 110" fill="none" style="stroke:var(--frame)" stroke-width="1.4" opacity=".7"/>' + bulbs + '</g>' +
            /* ---- the sill and everything cosy on it ---- */
            '<rect x="8" y="366" width="304" height="28" rx="9" style="fill:var(--sill)"/><path d="M16 372H304" style="stroke:#fff" stroke-width="1.6" opacity=".35" stroke-linecap="round"/><path d="M26 381c40-3 80 3 130 0s90 3 138 0" fill="none" style="stroke:var(--frame)" stroke-width="1.2" opacity=".16"/>' +
            '<g transform="translate(72 ' + (366 - 36 * (1.12 - stage * 0.048)).toFixed(1) + ') scale(' + (1.12 - stage * 0.048).toFixed(3) + ')">' + D.plantG(stage) + '</g>' +
            /* books with a candle */
            '<g transform="translate(40 0)">' +
            '<rect x="110" y="354" width="62" height="12" rx="2.5" style="fill:#8C6B4A"/><rect x="114" y="343" width="54" height="11" rx="2.5" style="fill:#C9704F"/><rect x="112" y="333" width="58" height="10" rx="2.5" style="fill:#5B7C6B"/>' +
            '<path d="M118 357v6M160 357v6M120 346v5M158 346v5M118 336v4M162 336v4" style="stroke:#fff" stroke-width="1.3" opacity=".35" stroke-linecap="round"/>' +
            '<circle class="z-pulse" cx="141" cy="318" r="22" style="fill:url(#cg-' + A + ')"/><rect x="136.5" y="318" width="9" height="15" rx="2" style="fill:var(--mug)"/><path d="M141 318v-3" style="stroke:var(--frame)" stroke-width="1.2"/>' +
            '<g class="z-flame"><ellipse cx="141" cy="311" rx="3.3" ry="6" style="fill:var(--lamp)"/><ellipse cx="141" cy="312.5" rx="1.5" ry="3.2" style="fill:#fff" opacity=".85"/></g></g>' +
            /* mug and saucer */
            '<ellipse cx="256" cy="367" rx="22" ry="4" style="fill:var(--pot)"/><rect x="239" y="338" width="34" height="28" rx="8" style="fill:var(--mug)"/><path d="M273 346h5a7 7 0 0 1 0 14h-5" fill="none" style="stroke:var(--mug)" stroke-width="5"/>' +
            '<path d="M241 350H271" style="stroke:var(--leaf)" stroke-width="3" opacity=".5"/><ellipse cx="256" cy="339" rx="15" ry="3.4" style="fill:var(--tea)"/>' +
            '<path class="steam" d="M249 330c-6-8 6-12 0-22"/><path class="steam" style="animation-delay:-1.1s" d="M257 330c-6-8 6-12 0-22"/><path class="steam" style="animation-delay:-2.1s" d="M265 330c-6-8 6-12 0-22"/></svg>';
    };
    /* ---------- helpers ---------- */
    D.relDay = function (key) {
        var d = HM.di(key), td = D.store.today(), diff = d - td;
        if (diff === 0)
            return t('rel.today');
        if (diff === 1)
            return t('rel.tomorrow');
        if (diff === -1)
            return t('rel.yesterday');
        if (diff > 1 && diff < 7)
            return t('rel.on', { d: D.fmtDate(key, { weekday: 'long' }) });
        return t('rel.on', { d: D.fmtDate(key, { month: 'long', day: 'numeric' }) });
    };
    function greeting() {
        var h = D.now().getHours(), k = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night', name = (D.store.S.settings.name || '').trim();
        var g = t('greet.' + k);
        return name ? t('greet.named', { g: g, name: name }) : g + '.';
    }
    function caption(k, dflt) { var c = (D.store.S.meta.caps || {})[k]; return c != null ? c : t(dflt); }
    /* ---------- the time card (uses the time zone chosen at sign-up) ---------- */
    var clockTimer = null;
    function digitsHTML(hour, min) {
        return (hour + ':' + min).split('').map(function (ch) {
            return ch === ':' ? '<span class="ck-colon" aria-hidden="true"><i></i><i></i></span>' : '<span class="ck-d">' + ch + '</span>';
        }).join('');
    }
    function clockCardHTML() {
        var now = D.now(), id = D.tz.effective(), tp = D.tz.timeParts(now), cf = D.store.S.settings.clockFormat || 'auto';
        var pctDay = Math.round((now.getHours() * 60 + now.getMinutes()) / 1440 * 100);
        var fmtBtn = function (v, label) { return '<button type="button" data-ckfmt="' + v + '" aria-pressed="' + (cf === v) + '">' + esc(label) + '</button>'; };
        return '<article class="card c-clock clockcard" data-clockcard>' +
            '<div class="card-head"><h3>' + esc(t('d.time')) + '</h3>' +
            '<button type="button" class="chip ck-zone" data-tzedit aria-expanded="false" title="' + esc(t('tz.change')) + '" aria-label="' + esc(t('tz.change')) + ': ' + esc(D.tz.place(id)) + '">' + icon('globe') + '<span>' + esc(D.tz.place(id)) + '</span></button></div>' +
            '<div class="ck-time" dir="ltr" role="timer" aria-label="' + esc(tp.hour + ':' + tp.min + ' ' + tp.ap) + '"><span class="ck-digits" data-ck-digits>' + digitsHTML(tp.hour, tp.min) + '</span><span class="ck-ap" data-ck-ap>' + esc(tp.ap) + '</span></div>' +
            '<p class="ck-date" data-ck-date>' + esc(D.fmtDate(now, { weekday: 'long', month: 'long', day: 'numeric' })) + '</p>' +
            '<div class="ck-meta"><span>' + esc(D.tz.offsetLabel(D.tz.offsetMinutes(id))) + '</span><span data-ck-day>' + esc(t('d.timeday', { n: N(pctDay) })) + '</span></div>' +
            '<div class="ck-track" role="img" aria-label="' + esc(t('d.timeday', { n: pctDay })) + '"><i data-ck-fill style="width:' + pctDay + '%"></i></div>' +
            '<div class="ck-panel" data-ck-panel hidden><div data-ck-tz></div><div class="seg ck-fmt" role="group" aria-label="' + esc(t('tz.format')) + '">' + fmtBtn('auto', t('tz.fmt.auto')) + fmtBtn('12', t('tz.fmt.12')) + fmtBtn('24', t('tz.fmt.24')) + '</div></div></article>';
    }
    function tickClock(root) {
        clearTimeout(clockTimer);
        var card = root && root.isConnected && root.querySelector('[data-clockcard]');
        if (!card)
            return; // left the desk: stop quietly
        var now = D.now(), tp = D.tz.timeParts(now), pctDay = Math.round((now.getHours() * 60 + now.getMinutes()) / 1440 * 100);
        var box = card.querySelector('[data-ck-digits]'), shown = (box.textContent || '').replace(/\s/g, ''), next = tp.hour + tp.min; // digits only (the colon has no text)
        if (shown !== next) {
            var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (shown.length !== next.length)
                box.innerHTML = digitsHTML(tp.hour, tp.min);
            else {
                var ds = card.querySelectorAll('.ck-d'), chars = next.split('');
                for (var i = 0; i < ds.length; i++) {
                    if (ds[i].textContent === chars[i])
                        continue;
                    ds[i].textContent = chars[i];
                    if (ds[i].animate)
                        ds[i].animate(reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(.16em)' }, { opacity: 1, transform: 'none' }], { duration: reduce ? 160 : 420, easing: 'cubic-bezier(.22,1,.36,1)' }); // critically damped: settles without overshoot
                }
            }
            card.querySelector('.ck-time').setAttribute('aria-label', tp.hour + ':' + tp.min + ' ' + tp.ap);
        }
        card.querySelector('[data-ck-ap]').textContent = tp.ap;
        card.querySelector('[data-ck-fill]').style.width = pctDay + '%';
        card.querySelector('[data-ck-day]').textContent = t('d.timeday', { n: N(pctDay) });
        card.querySelector('[data-ck-date]').textContent = D.fmtDate(now, { weekday: 'long', month: 'long', day: 'numeric' });
        clockTimer = setTimeout(function () { tickClock(root); }, 60000 - (Date.now() % 60000) + 40); // wake up on the next minute
    }
    function bindClock(root) {
        if (root.dataset.ckBound)
            return;
        root.dataset.ckBound = '1'; // the root outlives re-renders; bind once
        root.addEventListener('click', function (e) {
            var ed = e.target.closest('[data-tzedit]');
            if (ed) {
                var panel = root.querySelector('[data-ck-panel]'), open = panel.hidden;
                panel.hidden = !open;
                ed.setAttribute('aria-expanded', String(open));
                if (open && !panel.dataset.ready) {
                    panel.dataset.ready = '1';
                    D.tz.picker(panel.querySelector('[data-ck-tz]'), { onChange: function (id) { D.tz.set(id); } });
                }
                return;
            }
            var fb = e.target.closest('[data-ckfmt]');
            if (fb)
                D.store.mutate(function (S) { S.settings.clockFormat = fb.dataset.ckfmt; });
        });
        document.addEventListener('visibilitychange', function () { if (!document.hidden)
            tickClock(root); });
    }
    /* ---------- the view ---------- */
    D.desk = {
        render: function (root) {
            var S = D.store.S, s = D.habits.summary(), c = s.comp, xp = c.xp, hasH = s.list.length;
            var left = !hasH ? t('d.sub.nohabits') : s.restToday ? t('d.sub.rest') : (s.total && s.done === s.total) ? t('d.sub.alldone') : t('d.sub.left', { n: s.left });
            var due = D.notes.nextDue(), date = D.fmtDate(D.now(), { weekday: 'long', month: 'long', day: 'numeric' });
            var sub = due ? t('d.sub.due', { date: date, left: left, what: due.label, when: D.relDay(due.date) }) : t('d.sub', { date: date, left: left });
            var hr = D.now().getHours(), nudge = '';
            if (c.chain.atRisk && hr >= 17)
                nudge = '<div class="nudge">' + icon('flame', 'i-fill') + '<span>' + esc(t('d.nudge', { n: c.chain.cur })) + '</span></div>';
            // linked page + tonight tasks
            var pg = D.notes.focusPage(), todos = pg ? D.notes.todosOf(pg) : [], doneN = todos.filter(function (x) { return x.done; }).length;
            var tasks = todos.slice(0, 6).map(function (x) { return '<label class="chk"><input type="checkbox" data-task="' + esc(pg.id) + ':' + esc(x.id) + '"' + (x.done ? ' checked' : '') + '><span>' + esc(x.text) + '</span></label>'; }).join('');
            var tonight = '<article class="card c-paper"><div class="card-head"><h3>' + esc(t('d.tonight')) + '</h3><span class="meta">' + (todos.length ? esc(t('d.tcount', { a: doneN, b: todos.length })) : '') + '</span></div>' +
                (tasks || '<p class="meta">' + esc(t('d.tonight.empty')) + '</p>') + '<input class="quick" data-quick placeholder="' + esc(t('d.quick')) + '" aria-label="' + esc(t('d.quick')) + '">' + (pg && todos.length ? '<p class="meta from">' + esc(t('d.from', { page: pg.title || t('n.untitled') })) + '</p>' : '') + '</article>';
            var focusMin = S.settings.focus.focus, lastPage = pg;
            var focusCard = '<article class="card c-pine card-focus"><div class="art" data-scene>' + D.scene('d', xp.stage) + '</div><h3>' + esc(t('d.focus', { n: focusMin })) + '</h3><p class="meta">' + esc(lastPage ? t('d.linked', { page: lastPage.title || t('n.untitled') }) : t('d.unlinked')) + '</p><button class="btn btn-warm" data-go="focus" data-start="1">' + icon('play', 'i-fill') + esc(t('d.start')) + '</button></article>';
            var sticky = '<article class="card c-lamp sticky"><span class="tape"></span><p class="hand" contenteditable="plaintext-only" spellcheck="false" data-sticky data-ph="' + esc(t('d.sticky.ph')) + '" dir="auto">' + esc(S.meta.sticky) + '</p></article>';
            var habitsCard = '<article class="card"><div class="card-head"><h3>' + esc(t('d.habits')) + '</h3><span class="meta">' + (hasH ? esc(t('d.hcount', { a: s.done, b: s.total })) : '') + '</span></div>' +
                (hasH ? '<div data-hlist>' + D.habits.listHTML(false) + '</div>' : '<p class="meta">' + esc(t('d.habits.empty')) + '</p>' + D.habits.suggestHTML() + '<button class="btn btn-ghost sm" data-hb="new">' + icon('plus') + esc(t('hb.new')) + '</button>') + '</article>';
            var moodCard = '<article class="card c-mist"><div class="card-head"><h3>' + esc(t('mood.title')) + '</h3></div><div data-moodcard>' + D.mood.cardHTML() + '</div></article>';
            var last = D.notes.latest(), noteCard = last ?
                '<article class="card c-paper note" data-open-page="' + esc(last.id) + '" role="link" tabindex="0"><h3>' + esc(last.title || t('n.untitled')) + '</h3><p>' + esc(D.notes.excerpt(last, 170)) + '</p>' + (last.tags.length ? '<div class="tags">' + last.tags.slice(0, 3).map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('') + '</div>' : '') + '<p class="meta">' + esc(t('n.edited', { when: D.ago(last.edited) })) + '</p></article>' :
                '<article class="card c-paper note" data-go="notes" role="link" tabindex="0"><h3>' + esc(t('d.note.empty.t')) + '</h3><p>' + esc(t('d.note.empty.p')) + '</p><p class="meta">' + esc(t('d.note.empty.cta')) + '</p></article>';
            var pin1 = '<figure class="card c-matcha pin"><svg class="pinart" aria-hidden="true"><use href="#pic-matcha"/></svg><figcaption contenteditable="plaintext-only" spellcheck="false" data-cap="matcha" dir="auto">' + esc(caption('matcha', 'd.cap1')) + '</figcaption></figure>';
            var wk = c.week, qs = c.quests || [], qd = qs.filter(function (q) { return q.done; }).length;
            var growth = '<article class="card c-paper growmini" data-go="habits" data-tab="rewards" role="link" tabindex="0"><div class="card-head"><h3>' + esc(t('d.growth')) + '</h3><span class="meta">' + esc(t('hb.lvl', { n: xp.level })) + '</span></div>' +
                '<div class="gm-row"><div class="gm-plant">' + D.plantSVG(xp.stage) + '</div><div class="gm-tx"><b>' + esc(t('lv.' + xp.stage)) + '</b><div class="bar"><i style="width:' + Math.round(xp.pct * 100) + '%"></i></div><small class="meta">' + esc(t('rw.toNext', { n: xp.toNext, l: xp.level + 1 })) + '</small></div></div>' +
                '<div class="gm-q"><span>' + icon('check') + esc(t('d.quests', { a: qd, b: qs.length || 3 })) + '</span><span class="xpchip">+' + N(xp.today) + ' XP</span></div>' +
                (hasH ? '<div class="gm-q"><span>' + icon('sprout') + esc(t('d.week', { a: wk.done, b: wk.target })) + '</span><div class="bar mini"><i style="width:' + Math.round(wk.pct * 100) + '%"></i></div></div>' : '') + '</article>';
            // last 12 weeks
            var ws = S.settings.weekStart, today = D.store.today(), w0 = HM.weekStart(today, ws), cells = '', shown = 0, lit = 0;
            for (var w = 0; w < 12; w++)
                for (var r = 0; r < 7; r++) {
                    var d = w0 - (11 - w) * 7 + r, day = c.days[d];
                    if (d > today) {
                        cells += '<i style="visibility:hidden"></i>';
                        continue;
                    }
                    var lv = day ? day.level : 0;
                    if (d > today - 84) {
                        shown++;
                        if (day && day.done > 0)
                            lit++;
                    }
                    cells += '<i class="l' + lv + '" title="' + esc(D.fmtDate(HM.key(d), { weekday: 'short', month: 'short', day: 'numeric' }) + (day ? ' · ' + t('hm.n', { n: day.done }) : '')) + '"></i>';
                }
            var heat = '<article class="card"><div class="card-head"><h3>' + esc(t('d.heat')) + '</h3></div><div class="heat" style="--w:12" role="img" aria-label="' + esc(t('d.heat')) + '">' + cells + '</div><p class="meta">' + esc(hasH ? t('d.heat.sum', { a: lit, b: 84 }) : t('d.heat.empty')) + '</p></article>';
            var pin2 = '<figure class="card c-mist pin"><svg class="pinart" aria-hidden="true"><use href="#pic-books"/></svg><figcaption contenteditable="plaintext-only" spellcheck="false" data-cap="lib" dir="auto">' + esc(caption('lib', 'd.cap2')) + '</figcaption></figure>';
            var coll = '<article class="card c-paper"><div class="mosaic"><div class="m1"><svg aria-hidden="true"><use href="#pic-books"/></svg></div><div class="m2"><svg aria-hidden="true"><use href="#pic-matcha"/></svg></div><div class="m3"><svg aria-hidden="true"><use href="#pic-leaf"/></svg></div></div>' +
                '<h3 contenteditable="plaintext-only" spellcheck="false" data-ws data-ph="' + esc(t('d.ws.ph')) + '" dir="auto">' + esc(S.meta.workspace || t('d.ws')) + '</h3><p class="meta">' + esc(t('d.coll', { a: S.notes.length, b: D.store.activeHabits().length })) + '</p></article>';
            var amb = '<article class="card c-paper"><div class="card-head"><h3>' + esc(t('d.amb')) + '</h3></div><div class="chips">' + ['cafe', 'stream', 'brown', 'pad'].map(function (k) { return '<button class="chip" data-sound="' + k + '" aria-pressed="false">' + esc(t('snd.' + k)) + '</button>'; }).join('') + '</div><input type="range" min="0" max="100" value="' + S.settings.vol + '" data-vol aria-label="' + esc(t('snd.vol')) + '"></article>';
            root.innerHTML = '<header class="head"><div><h1>' + esc(greeting()) + '</h1><p class="sub">' + esc(sub) + '</p></div><button class="capture" data-palette>' + icon('search') + '<span>' + esc(t('d.capture')) + '</span><kbd>Ctrl K</kbd></button></header>' + nudge +
                '<div class="board">' + clockCardHTML() + focusCard + tonight + sticky + habitsCard + moodCard + noteCard + pin1 + growth + heat + pin2 + coll + amb + '</div>';
            D.focus && D.focus.paintSound();
            tickClock(root);
        },
        bind: function (root) {
            D.habits.bind(root);
            bindClock(root);
            root.addEventListener('change', function (e) {
                var tk = e.target.closest('[data-task]');
                if (tk) {
                    var p = tk.dataset.task.split(':');
                    D.notes.setTodo(p[0], p[1], tk.checked);
                    D.sfx(tk.checked ? 'tick' : 'untick');
                }
            });
            root.addEventListener('keydown', function (e) {
                if (e.target.matches('[data-quick]') && e.key === 'Enter') {
                    var v = e.target.value.trim();
                    if (v) {
                        D.notes.addTask(v);
                    }
                }
                if (e.target.matches('[contenteditable]') && e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur();
                }
                if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open-page]')) {
                    e.preventDefault();
                    D.notes.open(e.target.dataset.openPage);
                }
            });
            root.addEventListener('focusout', function (e) {
                var el = e.target;
                if (el.matches('[data-sticky]'))
                    D.store.mutate(function (S) { S.meta.sticky = el.textContent.trim(); }, { silent: true });
                if (el.matches('[data-ws]'))
                    D.store.mutate(function (S) { S.meta.workspace = el.textContent.trim(); }, { silent: true });
                if (el.matches('[data-cap]')) {
                    var k = el.dataset.cap;
                    D.store.mutate(function (S) { S.meta.caps = S.meta.caps || {}; S.meta.caps[k] = el.textContent.trim(); }, { silent: true });
                }
            });
            root.addEventListener('click', function (e) {
                var op = e.target.closest('[data-open-page]');
                if (op && !e.target.closest('[contenteditable]'))
                    D.notes.open(op.dataset.openPage);
            });
        }
    };
})();
