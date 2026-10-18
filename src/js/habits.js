"use strict";
/* Daheer habits: check-ins, rows, editor, detail sheet, month sheet, rewards, quests, mood */
(function () {
    'use strict';
    var D = window.D, HM = window.HM, $ = D.$, $$ = D.$$, t = D.t, N = D.N, esc = D.esc, icon = D.icon;
    var ST = function () { return D.store.S; };
    var EMOJI = ['📖', '💧', '🚶', '🧘', '✍️', '🏃', '🥗', '🍎', '🛌', '🌙', '☀️', '🪥', '💊', '🧹', '🎧', '🎨', '💻', '🧠', '🙏', '📵', '🚭', '🍬', '☕', '🌱', '💪', '🧴', '🐕'];
    var SUGGEST = [
        { k: 'water', emoji: '💧', kind: 'amount', target: 2, unit: 'L', step: 0.25 }, { k: 'read', emoji: '📖', kind: 'normal' }, { k: 'walk', emoji: '🚶', kind: 'normal' },
        { k: 'meditate', emoji: '🧘', kind: 'normal' }, { k: 'journal', emoji: '✍️', kind: 'normal' }, { k: 'stretch', emoji: '🤸', kind: 'normal' },
        { k: 'sleep', emoji: '🌙', kind: 'normal' }, { k: 'sunlight', emoji: '☀️', kind: 'normal' }, { k: 'tidy', emoji: '🧹', kind: 'normal' }, { k: 'deepwork', emoji: '🧠', kind: 'normal' }
    ];
    var ringSeq = 0;
    /* ---------- small view helpers ---------- */
    function ring(p, o) {
        o = o || {};
        var size = o.size || 64, sw = o.sw || 7, r = (size - sw) / 2, c = 2 * Math.PI * r;
        p = D.clamp(p || 0, 0, 1);
        return '<svg class="ring ' + (o.cls || '') + '" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true"><circle class="rt" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + sw + '"/><circle class="rp" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
    }
    D.ring = ring;
    function seg(p, n) { n = n || 10; var on = Math.round(D.clamp(p, 0, 1) * n), h = ''; for (var i = 0; i < n; i++)
        h += '<i' + (i < on ? ' class="on"' : '') + '></i>'; return '<span class="segbar" style="--n:' + n + '">' + h + '</span>'; }
    D.segbar = seg;
    function num(v) { return N(Math.round(v * 100) / 100); }
    function stageName(s) { return t(s >= 0.8 ? 'st.5' : s >= 0.6 ? 'st.4' : s >= 0.4 ? 'st.3' : s >= 0.2 ? 'st.2' : 'st.1'); }
    D.strengthName = stageName;
    function dayShort(d) { return D.weekdayName(d, 'short'); }
    function cadence(h) {
        var s = h.sched || { type: 'daily' };
        if (s.type === 'days') {
            var ws = ST().settings.weekStart;
            return s.days.slice().sort(function (a, b) { return ((a - ws + 7) % 7) - ((b - ws + 7) % 7); }).map(dayShort).join(t('common.sep'));
        }
        if (s.type === 'weekly')
            return t('h.perweek', { n: HM.weeklyN(h) });
        return t('h.everyday');
    }
    function sub(h, st) {
        var s = h.sched || { type: 'daily' };
        if (h.kind === 'amount')
            return t('h.amt', { v: num(st.todayValue), t: num(h.target), u: h.unit || '' });
        if (s.type === 'weekly')
            return t('h.week', { c: st.weekCount, n: st.weekTarget });
        if (h.kind === 'avoid')
            return st.doneToday ? t('h.held') : t('h.notyet');
        return cadence(h);
    }
    function isLeft(h, st) { if (st.doneToday)
        return false; if (st.weekly)
        return st.weekCount < st.weekTarget; return st.dueToday; }
    function summary() {
        var c = D.store.comp(), list = D.store.activeHabits().map(function (h) { return { h: h, st: c.habits[h.id] }; }).filter(function (x) { return x.st; });
        var rel = list.filter(function (x) { return x.st.dueToday || x.st.doneToday || (x.st.weekly && x.st.weekCount < x.st.weekTarget); });
        var done = rel.filter(function (x) { return x.st.doneToday; }).length;
        var left = list.filter(function (x) { return isLeft(x.h, x.st); }).length;
        return { list: list, total: rel.length, done: done, left: left, comp: c, restToday: !!ST().rest[D.store.todayKey()] };
    }
    /* ---------- check-ins ---------- */
    function minuteNow() { var d = D.now(); return d.getHours() * 60 + d.getMinutes(); }
    function setValue(id, di, v, opts) {
        opts = opts || {};
        var h = D.store.habit(id);
        if (!h)
            return;
        var before = D.store.comp(), isToday = di === D.store.today(), k = HM.key(di);
        D.store.mutate(function (S) {
            var day = S.logs[k] = S.logs[k] || {};
            v = Math.max(0, Math.round(v * 1000) / 1000);
            if (v <= 0) {
                delete day[id];
                if (!Object.keys(day).length)
                    delete S.logs[k];
            }
            else
                day[id] = isToday ? { v: v, t: minuteNow() } : { v: v, t: (day[id] && day[id].t != null) ? day[id].t : undefined };
        }, { habit: id, pop: id });
        var after = D.store.comp();
        if (before.habits[id] && after.habits[id] && valueOf(before, id, di, h) !== valueOf(after, id, di, h))
            D.store.record('habit.checkin', { habitId: id, value: getValue(id, di), previous: valueOf(before, id, di, h) });
        if (isToday && !opts.quiet)
            D.game.after(before, after, { habitId: id, el: opts.el, wasDone: HM.isDone(h, valueOf(before, id, di, h)) });
        return after;
    }
    function valueOf(c, id, di, h) { var e = ST().logs[HM.key(di)]; var x = e && e[id]; return x ? x.v : 0; }
    function getValue(id, di) { var e = ST().logs[HM.key(di)]; var x = e && e[id]; return x ? (typeof x === 'number' ? x : x.v) : 0; }
    function toggle(id, di, el) {
        var h = D.store.habit(id);
        di = di == null ? D.store.today() : di;
        var cur = getValue(id, di), done = HM.isDone(h, cur);
        var wasDone = done;
        setValue(id, di, done ? 0 : (h.kind === 'amount' ? h.target : 1), { el: el, quiet: false });
        if (di === D.store.today())
            D.sfx(wasDone ? 'untick' : 'tick');
    }
    function step(id, dir, el) {
        var h = D.store.habit(id), di = D.store.today(), cur = getValue(id, di), s = h.step || 1;
        var nv = Math.max(0, cur + dir * s);
        if (nv === cur)
            return;
        setValue(id, di, nv, { el: el });
        D.sfx(dir > 0 ? 'tick' : 'untick');
    }
    D.habits = { setValue: setValue, toggle: toggle, step: step, summary: summary, value: getValue };
    /* ---------- rows ---------- */
    function rowHTML(h, st, full) {
        var done = st.doneToday, amount = h.kind === 'amount', pct = amount ? D.clamp(st.todayValue / (h.target || 1), 0, 1) : (done ? 1 : 0);
        var off = !st.dueToday && !st.weekly && !done;
        var streak = '<span class="flame" title="' + esc(t(st.weekly ? 'h.streakw' : 'h.streakd', { n: st.streak })) + '">' + icon('flame', 'i-fill') + N(st.streak) + (st.weekly ? '<small>' + t('h.wk') + '</small>' : '') + '</span>';
        var btn = '<button class="hbtn' + (amount ? ' amt' : '') + '" data-act="' + (amount ? 'inc' : 'toggle') + '" aria-pressed="' + done + '" aria-label="' + esc(h.name) + '">' + (amount ? ring(pct, { size: 46, sw: 4, cls: 'hring' }) : '') + '<span class="emo">' + esc(h.emoji || '🌱') + '</span>' + icon('check', 'ok') + '</button>';
        var steppers = amount ? '<span class="hstep"><button data-act="dec" aria-label="−">−</button><button data-act="inc" aria-label="+">+</button></span>' : '';
        var extra = '';
        if (full) {
            var c = D.store.comp(), today = D.store.today(), dots = '';
            for (var i = 6; i >= 0; i--) {
                var d = today - i, e = ST().logs[HM.key(d)], v = e && e[h.id] ? (typeof e[h.id] === 'number' ? e[h.id] : e[h.id].v) : 0;
                dots += '<i class="' + (HM.isDone(h, v) ? 'on' : '') + '"></i>';
            }
            extra = '<div class="dots7" aria-hidden="true">' + dots + '</div><div class="str"><small>' + esc(t('h.strength')) + ' ' + D.pct(st.strength) + '</small><div class="bar"><i style="width:' + Math.round(st.strength * 100) + '%"></i></div></div>';
        }
        return '<div class="hrow' + (done ? ' done' : '') + (off ? ' off' : '') + (D.lastPop === h.id ? ' pop' : '') + '" data-id="' + esc(h.id) + '">' + btn +
            '<div class="hmain" data-act="open" tabindex="0" role="button"><div class="hname">' + esc(h.name) + (h.kind !== 'normal' ? '<span class="kind">' + esc(t('kind.' + h.kind)) + '</span>' : '') + '</div><div class="hnote">' + esc(off ? t('h.nottoday') : sub(h, st)) + '</div></div>' +
            extra + steppers + streak + '</div>';
    }
    D.habits.rowHTML = rowHTML;
    D.habits.listHTML = function (full) {
        var s = summary();
        if (!s.list.length)
            return '';
        return s.list.map(function (x) { return rowHTML(x.h, x.st, full); }).join('');
    };
    D.habits.suggestHTML = function () {
        return '<div class="suggest">' + SUGGEST.map(function (s) { return '<button class="chip" data-suggest="' + s.k + '"><span>' + s.emoji + '</span> ' + esc(t('sg.' + s.k)) + '</button>'; }).join('') + '</div>';
    };
    D.habits.addSuggestion = function (k) {
        var s = SUGGEST.filter(function (x) { return x.k === k; })[0];
        if (!s)
            return;
        var h = { id: D.uid('h'), name: t('sg.' + k), emoji: s.emoji, kind: s.kind, sched: { type: 'daily' }, created: D.store.todayKey(), archived: false };
        if (s.kind === 'amount') {
            h.target = s.target;
            h.unit = s.unit;
            h.step = s.step;
        }
        D.store.mutate(function (S) { S.habits.push(h); });
        D.ui.toast({ icon: 'sprout', title: t('h.added', { name: h.name }) });
    };
    /* ---------- streak week strip ---------- */
    D.habits.weekStripHTML = function () {
        var c = D.store.comp(), today = D.store.today(), ws = ST().settings.weekStart, w0 = HM.weekStart(today, ws), out = '';
        for (var i = 0; i < 7; i++) {
            var d = w0 + i, day = c.days[d], cls = 'wd', inner = '';
            if (d > today)
                cls += ' fut';
            else if (day && day.lit) {
                cls += ' lit';
                inner = icon('check');
            }
            else if (c.frozen[d]) {
                cls += ' frz';
                inner = icon('leaf');
            }
            else if (ST().rest[HM.key(d)]) {
                cls += ' rst';
                inner = icon('leaf');
            }
            else if (d < today && day && !day.free)
                cls += ' miss';
            if (d === today)
                cls += ' now';
            out += '<span class="' + cls + '" title="' + esc(D.fmtDate(HM.key(d), { weekday: 'long', month: 'short', day: 'numeric' })) + '"><small>' + esc(D.weekdayName(HM.dow(d), 'narrow')) + '</small><b>' + inner + '</b></span>';
        }
        return '<div class="weekstrip">' + out + '</div>';
    };
    /* ---------- quests ---------- */
    var QICON = { habits: 'sprout', mood: 'smile', focus: 'timer', write: 'notes' };
    D.habits.questsHTML = function () {
        var c = D.store.comp(), qs = c.quests || [];
        if (!qs.length)
            return '<p class="meta">' + esc(t('q.empty')) + '</p>';
        var doneN = qs.filter(function (q) { return q.done; }).length;
        return '<ul class="quests">' + qs.map(function (q) {
            var txt = q.id === 'habits' ? t('q.habits', { n: q.target }) : q.id === 'focus' ? t('q.focus', { n: q.target }) : t('q.' + q.id);
            var act = q.id === 'focus' ? ' data-go="focus"' : q.id === 'write' ? ' data-go="notes"' : '';
            return '<li class="' + (q.done ? 'done' : '') + '"' + act + '><span class="qi">' + (q.done ? icon('check') : icon(QICON[q.id])) + '</span><span class="qt">' + esc(txt) + (q.target > 1 ? '<small>' + N(q.prog) + '/' + N(q.target) + '</small>' : '') + '</span><span class="xpchip">+' + N(q.xp) + '</span></li>';
        }).join('') + '</ul><div class="chest' + (c.chest && c.chest.done ? ' open' : '') + '"><span class="chest-ic">' + icon('gift') + '</span><span>' + esc(c.chest && c.chest.done ? t('q.chestdone') : t('q.chest', { n: 3 - doneN })) + '</span><span class="xpchip">+' + N(c.chest ? c.chest.xp : 30) + '</span></div>';
    };
    /* ---------- mood ---------- */
    D.mood = {
        set: function (v) {
            var k = D.store.todayKey(), before = D.store.comp(), old = (ST().mood[k] || {}).v || 0;
            D.store.mutate(function (S) { if (old === v)
                delete S.mood[k];
            else
                S.mood[k] = { v: v, t: minuteNow(), note: (S.mood[k] && S.mood[k].note) || '' }; }, { mood: true });
            if (old !== v) {
                D.store.record('mood.log', { value: v });
                D.sfx('coin');
                D.game.after(before, D.store.comp(), { mood: true });
            }
        },
        note: function (txt) { var k = D.store.todayKey(); if (!ST().mood[k])
            return; D.store.mutate(function (S) { S.mood[k].note = txt; }, { silent: true }); },
        cardHTML: function () {
            var k = D.store.todayKey(), cur = ST().mood[k] || {}, m = D.store.mood(), btns = '';
            for (var v = 1; v <= 5; v++)
                btns += '<button class="mood-btn m' + v + '" data-mood="' + v + '" aria-pressed="' + (cur.v === v) + '" title="' + esc(t('mood.' + v)) + '"><svg class="face"><use href="#f-' + v + '"/></svg><small>' + esc(t('mood.' + v)) + '</small></button>';
            var avg = m.avg7 != null ? '<span class="meta">' + esc(t('mood.avg7', { v: N(m.avg7, 1) })) + (m.trend != null && Math.abs(m.trend) >= 0.15 ? ' <b class="' + (m.trend > 0 ? 'up' : 'dn') + '">' + (m.trend > 0 ? '▲' : '▼') + '</b>' : '') + '</span>' : '<span class="meta">' + esc(t('mood.first')) + '</span>';
            return '<div class="moodrow">' + btns + '</div>' + (cur.v ? '<input class="inp mood-note" data-mood-note placeholder="' + esc(t('mood.note')) + '" value="' + esc(cur.note || '') + '">' : '') + '<div class="mood-foot">' + avg + (cur.v ? '' : '<span class="xpchip">+5</span>') + '</div>';
        }
    };
    /* ---------- habit editor ---------- */
    function editor(id) {
        var h = id ? D.store.habit(id) : null, ws = ST().settings.weekStart;
        var m = h ? JSON.parse(JSON.stringify(h)) : { name: '', emoji: '🌱', kind: 'normal', sched: { type: 'daily', days: [1, 2, 3, 4, 5], n: 3 }, target: 1, unit: '', step: 1 };
        m.sched = m.sched || { type: 'daily' };
        m.sched.days = m.sched.days || [1, 2, 3, 4, 5];
        m.sched.n = m.sched.n || 3;
        var body = document.createElement('div');
        body.className = 'editor-form';
        function draw() {
            var days = '';
            for (var i = 0; i < 7; i++) {
                var dw = (ws + i) % 7;
                days += '<button type="button" class="chip sm" data-day="' + dw + '" aria-pressed="' + (m.sched.days.indexOf(dw) >= 0) + '">' + esc(D.weekdayName(dw, 'short')) + '</button>';
            }
            body.innerHTML =
                '<label class="fld"><span>' + esc(t('he.name')) + '</span><input class="inp" data-f="name" autofocus maxlength="60" placeholder="' + esc(t('he.nameph')) + '" value="' + esc(m.name) + '"></label>' +
                    '<div class="fld"><span>' + esc(t('he.icon')) + '</span><div class="emojis">' + EMOJI.map(function (e) { return '<button type="button" class="emo-b" data-emo="' + e + '" aria-pressed="' + (m.emoji === e) + '">' + e + '</button>'; }).join('') + '</div></div>' +
                    '<div class="fld"><span>' + esc(t('he.type')) + '</span><div class="seg wide">' + ['normal', 'amount', 'avoid'].map(function (k) { return '<button type="button" data-kind="' + k + '" aria-pressed="' + (m.kind === k) + '">' + esc(t('he.k.' + k)) + '</button>'; }).join('') + '</div><small class="hint2">' + esc(t('he.kh.' + m.kind)) + '</small></div>' +
                    (m.kind === 'amount' ? '<div class="fld row3"><label><span>' + esc(t('he.target')) + '</span><input class="inp" type="number" min="0.01" step="any" data-f="target" value="' + m.target + '"></label><label><span>' + esc(t('he.unit')) + '</span><input class="inp" data-f="unit" maxlength="12" placeholder="' + esc(t('he.unitph')) + '" value="' + esc(m.unit || '') + '"></label><label><span>' + esc(t('he.step')) + '</span><input class="inp" type="number" min="0.01" step="any" data-f="step" value="' + m.step + '"></label></div>' : '') +
                    (m.kind === 'avoid' ? '<div class="fld"><span>' + esc(t('he.badcost')) + '</span><input class="inp" type="number" min="1" step="1" data-f="badCost" value="' + (m.badCost || 15) + '" /><small class="hint2">' + esc(t('he.badcost.h')) + '</small></div>' : '') + '<div class="fld"><span>' + esc(t('he.sched')) + '</span><div class="seg wide">' + ['daily', 'days', 'weekly'].map(function (k) { return '<button type="button" data-sched="' + k + '" aria-pressed="' + (m.sched.type === k) + '">' + esc(t('he.s.' + k)) + '</button>'; }).join('') + '</div>' +
                    (m.sched.type === 'days' ? '<div class="daychips">' + days + '</div>' : '') +
                    (m.sched.type === 'weekly' ? '<div class="nstep"><button type="button" data-n="-1" aria-label="−">−</button><b>' + t('he.nweek', { n: m.sched.n }) + '</b><button type="button" data-n="1" aria-label="+">+</button></div>' : '') + '</div>';
        }
        draw();
        body.addEventListener('input', function (e) { var f = e.target.dataset.f; if (!f)
            return; m[f] = (f === 'target' || f === 'step' || f === 'badCost') ? parseFloat(e.target.value) || 0 : e.target.value; });
        body.addEventListener('click', function (e) {
            var b = e.target.closest('button');
            if (!b)
                return;
            if (b.dataset.emo) {
                m.emoji = b.dataset.emo;
                draw();
            }
            else if (b.dataset.kind) {
                m.kind = b.dataset.kind;
                if (m.kind === 'amount' && (!m.target || m.target < 1) && !h) {
                    m.target = 2;
                    m.step = 0.25;
                    m.unit = m.unit || '';
                }
                draw();
            }
            else if (b.dataset.sched) {
                m.sched.type = b.dataset.sched;
                draw();
            }
            else if (b.dataset.day) {
                var d = +b.dataset.day, i = m.sched.days.indexOf(d);
                if (i >= 0) {
                    if (m.sched.days.length > 1)
                        m.sched.days.splice(i, 1);
                }
                else
                    m.sched.days.push(d);
                draw();
            }
            else if (b.dataset.n) {
                m.sched.n = D.clamp(m.sched.n + (+b.dataset.n), 1, 7);
                draw();
            }
            if (b.dataset.emo || b.dataset.kind || b.dataset.sched || b.dataset.day || b.dataset.n) {
                var f = body.querySelector('[data-f=name]');
            }
        });
        return D.ui.dialog({
            title: t(h ? 'he.edit' : 'he.new'), html: body, cls: 'habit-editor',
            actions: [{ label: t('common.cancel'), kind: 'ghost', value: null }, { label: t('common.save'), value: 'save', validate: function () { m.name = (m.name || '').trim(); if (!m.name) {
                        body.querySelector('[data-f=name]').focus();
                        D.ui.toast({ icon: 'x', title: t('he.needname'), tone: 'lamp' });
                        return false;
                    } return true; } }]
        }).then(function (v) {
            if (v !== 'save')
                return null;
            var out = { id: h ? h.id : D.uid('h'), name: m.name, emoji: m.emoji, kind: m.kind, sched: m.sched.type === 'days' ? { type: 'days', days: m.sched.days.slice() } : m.sched.type === 'weekly' ? { type: 'weekly', n: m.sched.n } : { type: 'daily' }, created: h ? h.created : D.store.todayKey(), archived: h ? h.archived : false };
            if (m.kind === 'amount') {
                out.target = m.target > 0 ? m.target : 1;
                out.unit = (m.unit || '').trim();
                out.step = m.step > 0 ? m.step : 1;
            }
            if (m.kind === 'avoid')
                out.badCost = Math.max(1, +m.badCost || 15);
            D.store.mutate(function (S) { if (h) {
                var i = S.habits.indexOf(D.store.habit(h.id));
                S.habits[i] = out;
            }
            else
                S.habits.push(out); });
            D.store.record(h ? 'habit.update' : 'habit.create', { habitId: out.id, kind: out.kind });
            if (!h)
                D.ui.toast({ icon: 'sprout', title: t('h.added', { name: out.name }) });
            return out.id;
        });
    }
    D.habits.openEditor = editor;
    /* ---------- detail sheet ---------- */
    var detailMonth = null;
    function openDetail(id) {
        var h = D.store.habit(id);
        if (!h)
            return;
        var today = D.store.today(), td = D.now();
        detailMonth = { y: td.getFullYear(), m: td.getMonth() };
        var body = document.createElement('div');
        body.className = 'detail';
        function draw() {
            h = D.store.habit(id);
            if (!h)
                return;
            var c = D.store.comp(), st = c.habits[id];
            if (!st)
                return;
            var wk = st.weekly, unit = t(wk ? 'u.week' : 'u.day', { n: st.streak });
            var trend = st.trend == null ? '<span class="meta">–</span>' : '<b class="' + (st.trend >= 0.03 ? 'up' : st.trend <= -0.03 ? 'dn' : '') + '">' + (st.trend >= 0.03 ? '▲ +' : st.trend <= -0.03 ? '▼ ' : '● ') + N(Math.round(st.trend * 100)) + '</b><small> ' + esc(t('d.pts')) + '</small>';
            var ms = st.nextMs ? t('d.next', { n: st.toMs, m: st.nextMs, u: t(wk ? 'u.weekp' : 'u.dayp', { n: st.nextMs }) }) : '';
            var eta = st.nextMs && !wk ? D.fmtDate(HM.key(today + st.toMs - (st.doneToday ? 0 : 1)), { month: 'short', day: 'numeric' }) : '';
            var bw = st.bestWeekday >= 0 ? D.weekdayName(st.bestWeekday, 'long') : '–';
            var fm = detailMonth, first = Math.round(Date.UTC(fm.y, fm.m, 1) / 86400000), dim = HM.daysInMonth(fm.y, fm.m), lead = HM.rel(first, ST().settings.weekStart), cal = '';
            for (var i = 0; i < 7; i++)
                cal += '<b>' + esc(D.weekdayName((ST().settings.weekStart + i) % 7, 'narrow')) + '</b>';
            for (i = 0; i < lead; i++)
                cal += '<span></span>';
            for (i = 1; i <= dim; i++) {
                var d = first + i - 1, k = HM.key(d), v = getValue(id, d), dn = HM.isDone(h, v), fut = d > today, rst = c.frozen[d] || ST().rest[k], pre = d < st.start;
                cal += '<button class="cd' + (dn ? ' on' : '') + (fut || pre ? ' fut' : '') + (rst && !dn ? ' rest' : '') + (d === today ? ' now' : '') + '" data-day="' + d + '"' + (fut ? ' disabled' : '') + '>' + N(i) + '</button>';
            }
            body.innerHTML =
                '<div class="d-top"><div class="d-emo">' + esc(h.emoji || '🌱') + '</div><div class="d-tt"><h3>' + esc(h.name) + '</h3><p class="meta">' + esc(cadence(h)) + (h.kind === 'amount' ? ' · ' + esc(t('h.goal', { t: num(h.target), u: h.unit || '' })) : '') + '</p></div>' +
                    '<button class="ib" data-d="edit" aria-label="' + esc(t('common.edit')) + '">' + icon('edit') + '</button><button class="ib" data-d="more" aria-label="' + esc(t('common.more')) + '">' + icon('more') + '</button></div>' +
                    '<div class="d-hero"><div class="d-ring">' + ring(st.strength, { size: 104, sw: 9, cls: 'big' }) + '<div class="d-ring-t"><b>' + D.pct(st.strength) + '</b><small>' + esc(stageName(st.strength)) + '</small></div></div>' +
                    '<div class="d-side"><div class="d-streak">' + icon('flame', 'i-fill') + '<b>' + N(st.streak) + '</b><span>' + esc(unit) + '</span></div><p class="meta">' + esc(t('d.best', { n: st.best, u: t(wk ? 'u.weekp' : 'u.dayp', { n: st.best }) })) + '</p>' +
                    (ms ? '<p class="d-next">' + esc(ms) + (eta ? ' <span class="meta">· ' + esc(eta) + '</span>' : '') + '</p>' : '') + '</div></div>' +
                    '<div class="d-stats"><div><small>' + esc(t('d.r7')) + '</small><b>' + D.pct(st.r7) + '</b></div><div><small>' + esc(t('d.r30')) + '</small><b>' + D.pct(st.r30) + '</b></div><div><small>' + esc(t('d.r90')) + '</small><b>' + D.pct(st.r90) + '</b></div><div><small>' + esc(t('d.trend')) + '</small>' + trend + '</div>' +
                    '<div><small>' + esc(t('d.total')) + '</small><b>' + N(st.total) + '</b></div><div><small>' + esc(t('d.bestday')) + '</small><b class="sm">' + esc(bw) + '</b></div>' +
                    (h.kind === 'amount' ? '<div><small>' + esc(t('d.sum')) + '</small><b class="sm">' + num(st.sum) + ' ' + esc(h.unit || '') + '</b></div>' : '') + '</div>' +
                    '<div class="d-cal"><div class="d-cal-h"><button class="ib" data-d="prev" aria-label="' + esc(t('common.prev')) + '">' + icon('chev-l', 'mir') + '</button><b>' + esc(D.fmtDate(new Date(fm.y, fm.m, 1), { month: 'long', year: 'numeric' })) + '</b><button class="ib" data-d="next" aria-label="' + esc(t('common.next')) + '">' + icon('chev-r', 'mir') + '</button></div><div class="cal">' + cal + '</div><p class="meta">' + esc(t('d.calhint')) + '</p></div>' +
                    '<p class="formula">' + esc(t('d.formula')) + '</p>';
        }
        draw();
        var unsub = function () { D.off && 0; };
        var redraw = function () { if (body.isConnected)
            draw(); };
        D.on('change', redraw);
        body.addEventListener('click', function (e) {
            var b = e.target.closest('[data-d],[data-day]');
            if (!b)
                return;
            if (b.dataset.day) {
                var d = +b.dataset.day, hh = D.store.habit(id), dn = HM.isDone(hh, getValue(id, d));
                setValue(id, d, dn ? 0 : (hh.kind === 'amount' ? hh.target : 1), { el: b });
                D.sfx(dn ? 'untick' : 'tick');
                return;
            }
            var a = b.dataset.d;
            if (a === 'prev') {
                detailMonth.m--;
                if (detailMonth.m < 0) {
                    detailMonth.m = 11;
                    detailMonth.y--;
                }
                draw();
            }
            else if (a === 'next') {
                detailMonth.m++;
                if (detailMonth.m > 11) {
                    detailMonth.m = 0;
                    detailMonth.y++;
                }
                draw();
            }
            else if (a === 'edit')
                editor(id);
            else if (a === 'more')
                D.ui.menu(b, [
                    { label: t('h.archive'), icon: 'box', fn: function () { D.store.mutate(function (S) { D.store.habit(id).archived = true; }); D.ui.toast({ icon: 'box', title: t('h.archived'), action: { label: t('common.undo'), fn: function () { D.store.mutate(function (S) { D.store.habit(id).archived = false; }); } } }); document.querySelector('.dlg-back.sheet-back [data-x]') && document.querySelector('.dlg-back.sheet-back [data-x]').click(); } },
                    { label: t('common.delete'), icon: 'trash', danger: true, fn: function () { D.ui.confirm({ title: t('h.delq', { name: h.name }), text: t('h.deltxt'), ok: t('common.delete'), danger: true }).then(function (ok) { if (!ok)
                            return; var snap = JSON.parse(JSON.stringify(h)), logsSnap = {}; Object.keys(ST().logs).forEach(function (k) { if (ST().logs[k][id])
                            logsSnap[k] = ST().logs[k][id]; }); D.store.mutate(function (S) { S.habits = S.habits.filter(function (x) { return x.id !== id; }); Object.keys(S.logs).forEach(function (k) { delete S.logs[k][id]; if (!Object.keys(S.logs[k]).length)
                            delete S.logs[k]; }); }); document.querySelector('.dlg-back.sheet-back [data-x]') && document.querySelector('.dlg-back.sheet-back [data-x]').click(); D.ui.toast({ icon: 'trash', title: t('h.deleted'), action: { label: t('common.undo'), fn: function () { D.store.mutate(function (S) { S.habits.push(snap); Object.keys(logsSnap).forEach(function (k) { (S.logs[k] = S.logs[k] || {})[id] = logsSnap[k]; }); }); } } }); }); } }
                ], { at: 'end' });
        });
        D.ui.dialog({ html: body, cls: 'sheet', close: true, title: null, onOpen: function (box) { box.parentNode.classList.add('sheet-back'); var x = document.createElement('button'); x.className = 'ib sheet-x'; x.dataset.x = '1'; x.setAttribute('aria-label', t('common.close')); x.innerHTML = icon('x'); box.prepend(x); } });
    }
    D.habits.openDetail = openDetail;
    /* ---------- the Habits view ---------- */
    var tab = 'today', monthSel = null;
    var hFilter = { q: '', hide: false, due: false }; // session-only list filters (not saved)
    function applyHabitSearch(root) {
        var q = hFilter.q.trim().toLowerCase();
        $$('[data-hlist] .hrow', root).forEach(function (r) {
            var n = r.querySelector('.hname');
            r.style.display = (!q || (n && n.textContent.toLowerCase().indexOf(q) >= 0)) ? '' : 'none';
        });
    }
    function filterBarHTML() {
        return '<div class="hfilters"><input class="inp sm" type="search" data-hsearch value="' + esc(hFilter.q) + '" placeholder="' + esc(t('hb.search')) + '" aria-label="' + esc(t('hb.search')) + '">' +
            '<button class="chip sm" data-hfilter="hide" aria-pressed="' + hFilter.hide + '">' + esc(t('hb.hidedone')) + '</button>' +
            '<button class="chip sm" data-hfilter="due" aria-pressed="' + hFilter.due + '">' + esc(t('hb.dueonly')) + '</button></div>';
    }
    function render(root) {
        var s = summary(), c = s.comp, S = ST();
        var ws = S.settings.weekStart;
        var tabs = ['today', 'report', 'month', 'rewards'].map(function (k) { return '<button data-tab="' + k + '" aria-pressed="' + (tab === k) + '">' + esc(t('hb.tab.' + k)) + '</button>'; }).join('');
        var head = '<header class="head"><div><h1>' + esc(t('hb.title')) + '</h1><p class="sub">' + esc(headline(s)) + '</p></div><div class="head-act"><div class="seg" role="tablist">' + tabs + '</div><button class="btn" data-hb="new">' + icon('plus') + esc(t('hb.new')) + '</button></div></header>';
        var body = '';
        if (!D.store.activeHabits().length && tab !== 'rewards')
            body = emptyHTML();
        else if (tab === 'today')
            body = todayHTML(s);
        else if (tab === 'report')
            body = reportHTML(s);
        else if (tab === 'month')
            body = monthHTML();
        else
            body = rewardsHTML(s);
        root.innerHTML = head + '<div class="hab-body tab-' + tab + '">' + body + '</div>';
    }
    function headline(s) {
        if (!D.store.activeHabits().length)
            return t('hb.sub.empty');
        if (s.restToday)
            return t('hb.sub.rest');
        if (s.total && s.done === s.total)
            return t('hb.sub.all');
        return t('hb.sub.left', { n: s.left });
    }
    function emptyHTML() {
        return '<section class="card c-paper empty-card"><div class="empty-art">' + icon('sprout') + '</div><h3>' + esc(t('hb.empty.t')) + '</h3><p class="meta">' + esc(t('hb.empty.p')) + '</p>' + D.habits.suggestHTML() + '<button class="btn" data-hb="new">' + icon('plus') + esc(t('hb.empty.cta')) + '</button></section>';
    }
    function todayHTML(s) {
        var c = s.comp, pct = s.total ? s.done / s.total : 0, w = c.week, xp = c.xp, goal = ST().settings.xpGoal, gp = D.clamp(xp.today / goal, 0, 1);
        var ch = c.chain, lamp = ch.atRisk ? t('hb.chain.risk') : ch.todayLit ? t('hb.chain.lit') : t('hb.chain.start');
        var restBtn = '<button class="btn btn-ghost sm" data-hb="rest">' + icon('leaf') + esc(s.restToday ? t('hb.rest.off') : t('hb.rest.on')) + '</button>';
        return '<div class="hstats">' +
            '<article class="card c-matcha stat"><div class="stat-ring">' + ring(pct, { size: 92, sw: 9 }) + '<div class="stat-ring-t"><b>' + N(s.done) + '<small>/' + N(s.total) + '</small></b></div></div><div><h3>' + esc(t('hb.today')) + '</h3><p class="meta">' + esc(s.total && s.done === s.total ? t('hb.perfect') : t('hb.leftn', { n: s.left })) + '</p></div></article>' +
            '<article class="card c-lamp stat chainstat"><div class="stat-flame ' + (ch.todayLit ? 'lit' : '') + '">' + icon('flame', 'i-fill') + '<b>' + N(ch.cur) + '</b></div><div class="stat-tx"><h3>' + esc(t('unit.day', { n: ch.cur })) + '</h3><p class="meta">' + esc(lamp) + '</p>' + D.habits.weekStripHTML() + '</div></article>' +
            '<article class="card c-mist stat"><div class="stat-ring">' + ring(gp, { size: 92, sw: 9, cls: 'goal' }) + '<div class="stat-ring-t"><b>' + N(xp.today) + '</b><small>xp</small></div></div><div><h3>' + esc(t('hb.goal')) + '</h3><p class="meta">' + esc(xp.today >= goal ? t('hb.goal.hit') : t('hb.goal.left', { n: goal - xp.today })) + '</p><p class="meta lv">' + esc(t('hb.lvl', { n: xp.level })) + ' · ' + esc(t('lv.' + xp.stage)) + '</p></div></article></div>' +
            '<div class="hgrid"><section class="card full"><div class="card-head"><h3>' + esc(t('hb.all')) + '</h3><div class="row-r">' + restBtn + '</div></div>' + filterBarHTML() + (s.restToday ? '<p class="restnote">' + icon('leaf') + esc(t('hb.rest.note')) + '</p>' : '') + '<div data-hlist class="' + (hFilter.hide ? 'hide-done ' : '') + (hFilter.due ? 'due-only' : '') + '">' + D.habits.listHTML(true) + '</div></section>' +
            '<div class="col">' +
            '<section class="card c-paper"><div class="card-head"><h3>' + esc(t('q.title')) + '</h3><span class="meta">' + esc(t('q.resets')) + '</span></div>' + D.habits.questsHTML() + '</section>' +
            '<section class="card c-paper"><div class="card-head"><h3>' + esc(t('mood.title')) + '</h3></div><div data-moodcard>' + D.mood.cardHTML() + '</div></section>' +
            '<section class="card c-paper"><div class="card-head"><h3>' + esc(t('wk.title')) + '</h3><span class="meta">' + esc(t('wk.left', { n: w.daysLeft })) + '</span></div><div class="wk-num"><b>' + N(w.done) + '</b><span>/ ' + N(w.target) + '</span></div><div class="bar thick"><i style="width:' + Math.round(w.pct * 100) + '%"></i></div><p class="meta wk-why">' + esc(w.met ? t('wk.met', { n: w.bonus }) : t('wk.why', { prev: w.prev, n: w.bonus })) + '</p></section>' +
            '</div></div>' + schoolReportHTML(s) + recommendedHTML();
    }
    function schoolReportHTML(s) {
        var report = HM.schoolReport(ST(), s.comp, D.store.today());
        var rows = report.rows.slice(0, 6).map(function (r) { return '<div class="result-row"><span class="result-name"><b>' + esc(r.emoji) + ' ' + esc(r.name) + '</b><small>' + esc(t('hr.completion', { n: r.completion })) + ' · ' + esc(t('hr.strength', { n: r.strength })) + '</small></span><span class="result-grade grade-' + r.grade.replace('+', 'plus').replace('-', 'minus').toLowerCase() + '">' + esc(r.grade) + '</span><span class="result-score">' + N(r.score) + '</span></div>'; }).join('');
        return '<section class="card c-pine school-report"><div class="card-head"><div><h3>' + esc(t('hr.title')) + '</h3><p class="meta">' + esc(t('hr.sub')) + '</p></div><span class="report-grade">' + esc(report.grade) + '</span></div><div class="report-overview"><div><b>' + N(report.overall) + '</b><small>/100</small></div><div class="bar thick"><i style="width:' + report.overall + '%"></i></div><p class="meta">' + esc(t('hr.note.' + report.note)) + '</p></div><div class="results">' + (rows || '<p class="meta">' + esc(t('hr.empty')) + '</p>') + '</div></section>';
    }
    function recommendedHTML() {
        var active = D.store.activeHabits().map(function (h) { return h.name.toLowerCase(); });
        var chips = SUGGEST.map(function (x) { var name = t('sg.' + x.k), exists = active.indexOf(name.toLowerCase()) >= 0; return '<button class="rec-chip' + (exists ? ' added' : '') + '" data-suggest="' + x.k + '" ' + (exists ? 'disabled' : '') + '><span>' + x.emoji + '</span><b>' + esc(name) + '</b><small>' + esc(t('sgdesc.' + x.k)) + '</small>' + (exists ? '<em>' + esc(t('rec.added')) + '</em>' : ''); }).join('');
        return '<section class="card recommended"><div class="card-head"><div><h3>' + esc(t('rec.title')) + '</h3><p class="meta">' + esc(t('rec.sub')) + '</p></div><span class="meta">' + N(SUGGEST.length) + '</span></div><div class="recommend-grid">' + chips + '</div></section>';
    }
    function reportHTML(s) {
        var report = HM.schoolReport(ST(), s.comp, D.store.today()), rows = report.rows.map(function (r) {
            var trend = r.trend > 2 ? '▲ +' + N(r.trend) + '%' : r.trend < -2 ? '▼ ' + N(r.trend) + '%' : '•';
            return '<tr><th><span>' + esc(r.emoji) + ' ' + esc(r.name) + '</span><small>' + esc(t('hr.completion', { n: r.completion })) + '</small></th><td><b class="result-grade">' + esc(r.grade) + '</b></td><td>' + N(r.score) + '/100</td><td>' + N(r.streak) + '</td><td>' + trend + '</td></tr>';
        }).join('');
        var actions = report.rows.filter(function (r) { return r.score < 75; }).slice(0, 3).map(function (r) { return '<li><b>' + esc(r.name) + '</b><span>' + esc(t('hr.action', { n: r.completion })) + '</span></li>'; }).join('');
        return '<div class="report-page"><section class="card c-pine report-hero"><div class="report-hero-score"><span>' + esc(t('hr.overall')) + '</span><b>' + N(report.overall) + '</b><em>' + esc(report.grade) + '</em></div><div class="report-hero-copy"><h2>' + esc(t('hr.title')) + '</h2><p>' + esc(t('hr.sub')) + '</p><div class="bar thick"><i style="width:' + report.overall + '%"></i></div><p class="meta">' + esc(t('hr.note.' + report.note)) + '</p></div></section><section class="card c-paper"><div class="card-head"><div><h3>' + esc(t('hr.subjects')) + '</h3><span class="meta">' + esc(t('hr.subjectsSub')) + '</span></div><span class="meta">' + N(report.rows.length) + '</span></div><div class="report-table-wrap"><table class="report-table"><thead><tr><th>' + esc(t('hr.habit')) + '</th><th>' + esc(t('hr.grade')) + '</th><th>' + esc(t('hr.score')) + '</th><th>' + esc(t('hr.streak')) + '</th><th>' + esc(t('hr.trend')) + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">' + esc(t('hr.empty')) + '</td></tr>') + '</tbody></table></div></section><section class="card c-paper"><div class="card-head"><h3>' + esc(t('hr.actions')) + '</h3></div><ul class="report-actions">' + (actions || '<li><b>' + esc(t('hr.keep')) + '</b><span>' + esc(t('hr.keepSub')) + '</span></li>') + '</ul></section></div>';
    }
    function monthHTML() {
        var td = D.now();
        if (!monthSel)
            monthSel = { y: td.getFullYear(), m: td.getMonth() };
        var M = D.store.monthSheet(monthSel.y, monthSel.m), c = D.store.comp(), ws = ST().settings.weekStart, today = D.store.today();
        var head = '<tr><th class="hn"></th>', head2 = '<tr><th class="hn">' + esc(t('ms.habit')) + '</th>';
        for (var i = 0; i < M.days; i++) {
            var d = M.first + i;
            head += '<th class="dw' + (d === today ? ' now' : '') + '">' + esc(D.weekdayName(HM.dow(d), 'narrow')) + '</th>';
            head2 += '<th class="dn' + (d === today ? ' now' : '') + '">' + N(i + 1) + '</th>';
        }
        head += '<th></th></tr>';
        head2 += '<th class="hp">' + esc(t('ms.progress')) + '</th></tr>';
        var rows = M.rows.map(function (r) {
            var h = D.store.habit(r.id);
            return '<tr data-id="' + esc(r.id) + '"><th class="hn"><button data-act="open"><span>' + esc(h.emoji || '🌱') + '</span> ' + esc(h.name) + '</button></th>' + r.cells.map(function (x) { return '<td><button class="mc ' + x.state + '" data-cell="' + x.d + '"' + (x.state === 'future' || x.state === 'pre' ? ' disabled' : '') + ' aria-label="' + x.day + '">' + (x.state === 'done' ? icon('check') : x.state === 'rest' ? icon('leaf') : '') + '</button></td>'; }).join('') + '<td class="hp">' + seg(r.pct, 10) + '<b>' + D.pct(r.pct) + '</b></td></tr>';
        }).join('');
        var lv = ['l0', 'l1', 'l2', 'l3', 'l4'], tot = '<tr class="tot"><th class="hn">' + esc(t('ms.total')) + '</th>' + M.dayTotals.map(function (n) { var r = M.active ? n / M.active : 0; return '<td><i class="' + lv[n === 0 ? 0 : r <= .25 ? 1 : r <= .5 ? 2 : r <= .75 ? 3 : 4] + '" title="' + n + '"></i></td>'; }).join('') + '<td class="hp"><b>' + N(M.done) + '/' + N(M.slots) + '</b></td></tr>';
        return '<section class="card c-paper msheet"><div class="ms-h"><div class="ms-nav"><button class="ib" data-ms="-1" aria-label="' + esc(t('common.prev')) + '">' + icon('chev-l', 'mir') + '</button><h3>' + esc(D.fmtDate(new Date(monthSel.y, monthSel.m, 1), { month: 'long', year: 'numeric' })) + '</h3><button class="ib" data-ms="1" aria-label="' + esc(t('common.next')) + '">' + icon('chev-r', 'mir') + '</button></div>' +
            '<div class="ms-all"><span>' + esc(t('ms.overall')) + '</span>' + seg(M.pct, 24) + '<b>' + D.pct(M.pct) + '</b></div></div>' +
            '<div class="scroll-x"><table class="mtable"><thead>' + head + head2 + '</thead><tbody>' + rows + tot + '</tbody></table></div><p class="meta">' + esc(t('ms.hint')) + '</p><p class="formula">' + esc(t('ms.formula')) + '</p></section>';
    }
    var BADGE_ICON = { first: '🌱', chain3: '🔥', chain7: '🔥', chain14: '🔥', chain30: '🏮', chain66: '🏮', chain100: '🌟', perfect: '✨', perfect7: '🌈', hundred: '💯', fivehundred: '🏆', rooted: '🌳', comeback: '🌤️', early: '🌅', owl: '🦉', lucky: '🍀', weekwin: '🎯', focus5: '⏳', focus25: '🕰️', writer: '📝', lvl5: '🌿', lvl10: '🌲' };
    D.badgeIcon = function (id) { return BADGE_ICON[id] || '⭐'; };
    function rewardsHTML(s) {
        var c = s.comp, xp = c.xp, ch = c.chain, leaves = '';
        for (var i = 0; i < HM.LEAF_MAX; i++)
            leaves += '<span class="lf' + (i < ch.leaves ? ' on' : '') + '">' + icon('leaf', i < ch.leaves ? 'i-fill' : '') + '</span>';
        var badges = c.badges.map(function (b) { return '<div class="badge' + (b.earned ? ' earned' : '') + '" title="' + esc(t('bd.' + b.id + '.d')) + '"><span class="bi">' + (b.earned ? BADGE_ICON[b.id] : icon('lock')) + '</span><b>' + esc(t('bd.' + b.id)) + '</b><small>' + esc(t('bd.' + b.id + '.d')) + '</small></div>'; }).join('');
        var earned = c.badges.filter(function (b) { return b.earned; }).length;
        return '<div class="hgrid rw"><div class="col">' +
            '<section class="card c-pine growcard"><div class="grow-art">' + D.plantSVG(xp.stage) + '</div><div><span class="lvbig">' + esc(t('hb.lvl', { n: xp.level })) + '</span><h3>' + esc(t('lv.' + xp.stage)) + '</h3><div class="bar onpine"><i style="width:' + Math.round(xp.pct * 100) + '%"></i></div><p class="meta">' + esc(t('rw.toNext', { n: xp.toNext, l: xp.level + 1 })) + ' · ' + N(xp.total) + ' xp</p></div></section>' +
            '<section class="card c-paper"><div class="card-head"><h3>' + esc(t('rw.badges')) + '</h3><span class="meta">' + N(earned) + '/' + N(c.badges.length) + '</span></div><div class="badges">' + badges + '</div></section></div>' +
            '<div class="col"><section class="card c-lamp"><div class="card-head"><h3>' + esc(t('rw.leaves')) + '</h3></div><div class="leaves">' + leaves + '</div><p class="meta">' + esc(t('rw.leaves.p', { n: ch.toNextLeaf })) + '</p></section>' +
            '<section class="card c-paper"><div class="card-head"><h3>' + esc(t('rw.chain')) + '</h3></div><div class="kv"><div><b>' + N(ch.cur) + '</b><small>' + esc(t('rw.cur')) + '</small></div><div><b>' + N(ch.best) + '</b><small>' + esc(t('rw.best')) + '</small></div><div><b>' + N(ch.litTotal) + '</b><small>' + esc(t('rw.lit')) + '</small></div><div><b>' + N(c.totals.perfectDays) + '</b><small>' + esc(t('rw.perfect')) + '</small></div></div><p class="meta">' + esc(t('rw.kind')) + '</p></section>' +
            '<section class="card c-paper"><div class="card-head"><h3>' + esc(t('rw.how')) + '</h3></div><ul class="howxp"><li><b>+10</b> ' + esc(t('rw.x1')) + '</li><li><b>×1.5</b> ' + esc(t('rw.x2')) + '</li><li><b>+8%</b> ' + esc(t('rw.x3')) + '</li><li><b>×2</b> ' + esc(t('rw.x4')) + '</li><li><b>×1.5</b> ' + esc(t('rw.x5')) + '</li><li><b>+20</b> ' + esc(t('rw.x6')) + '</li><li><b>+50</b> ' + esc(t('rw.x7')) + '</li></ul></section></div></div>';
    }
    /* ---------- events ---------- */
    function bind(root) {
        if (root.dataset.bound)
            return;
        root.dataset.bound = '1';
        root.addEventListener('click', function (e) {
            var t0 = e.target;
            var tb = t0.closest('[data-tab]');
            if (tb) {
                tab = tb.dataset.tab;
                D.refresh();
                return;
            }
            var hf = t0.closest('[data-hfilter]');
            if (hf) {
                var hk = hf.dataset.hfilter;
                hFilter[hk] = !hFilter[hk];
                hf.setAttribute('aria-pressed', hFilter[hk]);
                var hl = $('[data-hlist]', root);
                if (hl) {
                    hl.classList.toggle('hide-done', hFilter.hide);
                    hl.classList.toggle('due-only', hFilter.due);
                }
                return;
            }
            var hb = t0.closest('[data-hb]');
            if (hb) {
                var a = hb.dataset.hb;
                if (a === 'new')
                    editor();
                if (a === 'rest') {
                    var k = D.store.todayKey();
                    D.store.mutate(function (S) { if (S.rest[k])
                        delete S.rest[k];
                    else
                        S.rest[k] = true; });
                }
                return;
            }
            var sg = t0.closest('[data-suggest]');
            if (sg) {
                D.habits.addSuggestion(sg.dataset.suggest);
                return;
            }
            var mb = t0.closest('[data-mood]');
            if (mb) {
                D.mood.set(+mb.dataset.mood);
                return;
            }
            var ms = t0.closest('[data-ms]');
            if (ms) {
                monthSel.m += +ms.dataset.ms;
                if (monthSel.m < 0) {
                    monthSel.m = 11;
                    monthSel.y--;
                }
                if (monthSel.m > 11) {
                    monthSel.m = 0;
                    monthSel.y++;
                }
                D.refresh();
                return;
            }
            var cell = t0.closest('[data-cell]');
            if (cell) {
                var id = cell.closest('tr').dataset.id, hh = D.store.habit(id), d = +cell.dataset.cell, dn = HM.isDone(hh, getValue(id, d));
                setValue(id, d, dn ? 0 : (hh.kind === 'amount' ? hh.target : 1), { el: cell });
                D.sfx(dn ? 'untick' : 'tick');
                return;
            }
            var row = t0.closest('.hrow, tr[data-id]');
            var act = t0.closest('[data-act]');
            if (row && act) {
                var hid = row.dataset.id, ac = act.dataset.act;
                if (ac === 'toggle')
                    toggle(hid, null, act);
                else if (ac === 'inc')
                    step(hid, 1, act);
                else if (ac === 'dec')
                    step(hid, -1, act);
                else if (ac === 'open')
                    openDetail(hid);
            }
        });
        root.addEventListener('input', function (e) {
            if (e.target.matches('[data-hsearch]')) {
                hFilter.q = e.target.value;
                applyHabitSearch(root);
                return;
            }
            if (e.target.matches('[data-mood-note]'))
                D.mood.note(e.target.value);
        });
        root.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.hmain')) {
            e.preventDefault();
            openDetail(e.target.closest('.hrow').dataset.id);
        } });
    }
    D.habits.render = function (root) { bind(root); render(root); if (tab === 'today')
        applyHabitSearch(root); };
    D.habits.setTab = function (k) { tab = k; };
    D.habits.bind = bind;
})();
