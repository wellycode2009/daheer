"use strict";
/*
  Daheer habit maths
  ---------------------------------------------------------------
  A pure module: give it the saved data and today's date, get back every
  number the app shows. Nothing here touches the page, so it can be tested
  in Node (see test/habitmath.test.js).

  Everything is REPLAYED from the check-in log. Because nothing is stored
  as a running total, editing yesterday fixes every streak, level and badge
  in one go, and the numbers can never drift out of sync.

  The formulas (also shown to the user in the "The math" card):

    Habit strength      s = s * a + c * (1 - a),   a = 0.5 ^ (sqrt(f) / 13)
                        c = credit for the day (0..1), f = expected times per day.
                        A smoothed score: one miss dents it, it does not erase it.
    Completion rate     sum of credits / scheduled days   (7, 30 and 90 days)
    Trend               rate(last 28 days) - rate(the 28 days before)
    Streak XP bonus     m = 1 + 0.5 * (1 - e^(-s / 21))     (caps at x1.5)
    Combo               +8% for each habit already done today (max +40%)
    Level               level = floor((1 + sqrt(1 + xp / 12.5)) / 2)
                        xp needed for level n = 50 * n * (n - 1)
    Compound growth     G = G * (1 + 0.5% * completion)   (only ever goes up)
    Weekly challenge    target = last week's check-ins * 1.1 (rounded up)
    Daily quests        3 small goals a day (habits, mood, focus or write); all three = a chest
    Mood                mean, 30-day trend (least-squares slope), Pearson r against completion,
                        and per-habit "lift" = mean mood on days done - mean mood on days not done
*/
(function (root, factory) {
    if (typeof module === 'object' && module.exports)
        module.exports = factory();
    else
        root.HM = factory();
})(this, function () {
    'use strict';
    var DAY = 86400000;
    var MILESTONES = [3, 7, 14, 21, 30, 50, 66, 100, 150, 200, 365, 500, 730, 1000];
    var LEAF_EVERY = 7; // a rest leaf is earned every 7 lit days in a row
    var LEAF_MAX = 3;
    var WEEK_BONUS = 50;
    var PERFECT_BONUS = 20;
    /* ---------- dates: everything is a whole-day index ---------- */
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function di(k) { var p = k.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY); }
    function key(i) { var d = new Date(i * DAY); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    function fromDate(dt) { return Math.round(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / DAY); }
    function dow(i) { return (((i + 4) % 7) + 7) % 7; } // 0 = Sunday (1 Jan 1970 was a Thursday)
    function rel(i, ws) { return (dow(i) - ws + 7) % 7; } // 0 = first day of the week
    function weekStart(i, ws) { return i - rel(i, ws); }
    function daysInMonth(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
    /* ---------- small helpers ---------- */
    function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    } return h >>> 0; }
    function rand01(s) {
        var t = hash(s) + 0x6D2B79F5 | 0;
        t = Math.imul(t ^ t >>> 15, 1 | t);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    /* ---------- levels ---------- */
    function xpForLevel(n) { return 50 * n * (n - 1); }
    function levelFromXp(xp) { return Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2)); }
    function levelInfo(xp) {
        var lv = levelFromXp(xp), a = xpForLevel(lv), b = xpForLevel(lv + 1);
        return { level: lv, xp: xp, into: xp - a, need: b - a, toNext: b - xp, pct: (xp - a) / (b - a) };
    }
    function streakMultiplier(s) { return 1 + 0.5 * (1 - Math.exp(-s / 21)); }
    function stage(level) { return Math.min(10, level); } // plant growth stage 1..10
    /* ---------- one habit on one day ---------- */
    function isWeekly(h) { return !!(h.sched && h.sched.type === 'weekly'); }
    function weeklyN(h) { return Math.max(1, (h.sched && h.sched.n) || 3); }
    function isSched(h, d) {
        var s = h.sched || { type: 'daily' };
        if (s.type === 'days')
            return s.days.indexOf(dow(d)) >= 0;
        return true; // daily, and weekly (any day can count towards the quota)
    }
    function perWeek(h) {
        var s = h.sched || { type: 'daily' };
        if (s.type === 'weekly')
            return weeklyN(h);
        if (s.type === 'days')
            return s.days.length;
        return 7;
    }
    function isDone(h, v) { return h.kind === 'amount' ? (h.target > 0 && v >= h.target) : v >= 1; }
    function credit(h, v) { return h.kind === 'amount' ? (h.target > 0 ? Math.min(1, v / h.target) : 0) : (v >= 1 ? 1 : 0); }
    function baseXp(h) { return h.kind === 'amount' ? 12 : 10; }
    /* ---------- badge catalogue (texts live in i18n) ---------- */
    var BADGES = [
        { id: 'first', test: function (a) { return a.checkins >= 1; } },
        { id: 'chain3', test: function (a) { return a.chainBest >= 3; } },
        { id: 'chain7', test: function (a) { return a.chainBest >= 7; } },
        { id: 'chain14', test: function (a) { return a.chainBest >= 14; } },
        { id: 'chain30', test: function (a) { return a.chainBest >= 30; } },
        { id: 'chain66', test: function (a) { return a.chainBest >= 66; } },
        { id: 'chain100', test: function (a) { return a.chainBest >= 100; } },
        { id: 'perfect', test: function (a) { return a.perfectDays >= 1; } },
        { id: 'perfect7', test: function (a) { return a.perfectRun >= 7; } },
        { id: 'hundred', test: function (a) { return a.checkins >= 100; } },
        { id: 'fivehundred', test: function (a) { return a.checkins >= 500; } },
        { id: 'rooted', test: function (a) { return a.bestStrength >= 0.8; } },
        { id: 'comeback', test: function (a) { return a.comeback; } },
        { id: 'early', test: function (a) { return a.early; } },
        { id: 'owl', test: function (a) { return a.owl; } },
        { id: 'lucky', test: function (a) { return a.lucky >= 1; } },
        { id: 'weekwin', test: function (a) { return a.weeksWon >= 1; } },
        { id: 'focus5', test: function (a) { return a.focusMin >= 300; } },
        { id: 'focus25', test: function (a) { return a.focusMin >= 1500; } },
        { id: 'writer', test: function (a) { return a.pages >= 10; } },
        { id: 'lvl5', test: function (a) { return a.level >= 5; } },
        { id: 'lvl10', test: function (a) { return a.level >= 10; } }
    ];
    /* ==========================================================
       compute(): the whole picture, from the log
       ========================================================== */
    function compute(S, today, cfg) {
        cfg = cfg || {};
        var ws = cfg.weekStart == null ? 1 : cfg.weekStart;
        var rule = cfg.rule || 'one';
        var habits = (S.habits || []).filter(function (h) { return !h.archived; });
        var logs = S.logs || {};
        var out = {
            today: today, weekStart: ws, habits: {}, days: {}, first: today,
            chain: { cur: 0, best: 0, leaves: 0, leavesEarned: 0, litTotal: 0, todayLit: false, atRisk: false, breaks: [], toNextLeaf: LEAF_EVERY },
            frozen: {}, quests: [], chest: null, xp: null, week: null, weeks: [], growth: [], badges: [], totals: {}, hours: [], weekdays: []
        };
        /* index the log by day */
        var L = {}, firstLog = Infinity, k, d;
        for (k in logs) {
            d = di(k);
            if (d <= today) {
                L[d] = logs[k];
                if (d < firstLog)
                    firstLog = d;
            }
        }
        function val(h, dd) { var e = L[dd] && L[dd][h.id]; return e ? (typeof e === 'number' ? e : e.v) : 0; }
        function when(h, dd) { var e = L[dd] && L[dd][h.id]; return e && typeof e === 'object' && e.t != null ? e.t : -1; }
        /* when does each habit start counting? */
        var start = {};
        habits.forEach(function (h) {
            var s = h.created ? di(h.created) : Infinity, dd;
            for (dd in L) {
                if (L[dd][h.id] != null && +dd < s)
                    s = +dd;
            }
            if (s > today)
                s = h.created ? Math.min(di(h.created), today) : today;
            start[h.id] = s;
        });
        if (!habits.length) {
            out.xp = levelInfo(sessionXpOnly(S, today));
            out.xp.total = out.xp.xp;
            out.xp.stage = stage(out.xp.level);
            out.xp.byDay = {};
            out.xp.today = 0;
            out.xp.gainsToday = [];
            out.badges = badgeList({ level: out.xp.level, pages: (S.notes || []).length, focusMin: focusMinutes(S) });
            out.quests = [];
            return out;
        }
        var first = today;
        habits.forEach(function (h) { if (start[h.id] < first)
            first = start[h.id]; });
        out.first = first;
        /* manual rest days */
        var manual = {};
        for (k in (S.rest || {})) {
            if (S.rest[k])
                manual[di(k)] = true;
        }
        /* --- step 1: per-day counts from the raw log --- */
        var active = 0;
        for (d = first; d <= today; d++) {
            var done = 0, due = 0, dueDone = 0, started = 0;
            for (var i = 0; i < habits.length; i++) {
                var h = habits[i];
                if (d < start[h.id])
                    continue;
                started++;
                var dn = isDone(h, val(h, d));
                if (dn)
                    done++;
                if (!isWeekly(h) && isSched(h, d)) {
                    due++;
                    if (dn)
                        dueDone++;
                }
            }
            var ratio = started ? done / started : 0;
            out.days[d] = {
                d: d, done: done, due: due, dueDone: dueDone, started: started,
                level: done === 0 ? 0 : ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4,
                lit: false, free: false, frozen: false, rest: !!manual[d], perfect: due > 0 && dueDone === due,
                ratio: Math.min(1, ratio)
            };
        }
        function lit(day) {
            if (day.done < 1)
                return false;
            if (rule === 'one')
                return true;
            if (rule === 'half')
                return day.due === 0 ? day.done > 0 : day.done >= Math.ceil(day.due / 2);
            return day.due === 0 ? day.done > 0 : day.done >= day.due;
        }
        /* --- step 2: the chain, with rest leaves --- */
        var C = out.chain, cur = 0, leaves = 0, brokeAt = [];
        for (d = first; d <= today; d++) {
            var dd2 = out.days[d], isToday = d === today, isLit = lit(dd2);
            dd2.lit = isLit;
            if (manual[d])
                continue;
            if (!isToday && !isLit && dd2.due === 0 && dd2.done === 0) {
                dd2.free = true;
                continue;
            }
            if (isLit) {
                cur++;
                C.litTotal++;
                if (cur % LEAF_EVERY === 0 && leaves < LEAF_MAX) {
                    leaves++;
                    C.leavesEarned++;
                }
                if (cur > C.best)
                    C.best = cur;
            }
            else if (!isToday) {
                if (leaves > 0) {
                    leaves--;
                    dd2.frozen = true;
                    out.frozen[d] = true;
                }
                else {
                    if (cur > 0)
                        brokeAt.push({ d: d, len: cur });
                    cur = 0;
                }
            }
        }
        C.cur = cur;
        C.leaves = leaves;
        C.breaks = brokeAt;
        C.todayLit = out.days[today].lit;
        C.atRisk = !C.todayLit && cur > 0;
        C.toNextLeaf = LEAF_EVERY - (cur % LEAF_EVERY);
        /* rest = manual rest days + days a leaf protected */
        var rest = {};
        for (d in manual)
            rest[d] = true;
        for (d in out.frozen)
            rest[d] = true;
        /* --- step 3: every habit, replayed --- */
        var allDaily = {}; // habit id -> list of check-ins {d, c, sBefore, t}
        habits.forEach(function (h) {
            var st = isWeekly(h) ? statWeekly(h) : statDaily(h);
            out.habits[h.id] = st;
            allDaily[h.id] = st.checkins;
        });
        function rateOver(list, from, to) {
            var n = 0, sum = 0;
            for (var j = 0; j < list.length; j++) {
                if (list[j].d >= from && list[j].d <= to) {
                    n++;
                    sum += list[j].c;
                }
            }
            return n ? sum / n : null;
        }
        function trendOf(r28, p28) { return (r28 == null || p28 == null) ? null : r28 - p28; }
        function nextMs(s) { for (var j = 0; j < MILESTONES.length; j++)
            if (MILESTONES[j] > s)
                return MILESTONES[j]; return null; }
        function statDaily(h) {
            var st0 = start[h.id], s = 0, cur2 = 0, best = 0, list = [], checkins = [], total = 0, sum = 0, pending = false;
            var f = perWeek(h) / 7, alpha = Math.pow(0.5, Math.sqrt(f) / 13);
            for (var dd = st0; dd <= today; dd++) {
                var v = val(h, dd);
                if (v > 0)
                    sum += v;
                if (rest[dd]) {
                    if (isDone(h, v)) {
                        total++;
                        checkins.push({ d: dd, c: 1, sBefore: cur2, t: when(h, dd), bonus: true });
                    }
                    continue;
                }
                if (!isSched(h, dd)) {
                    if (isDone(h, v)) {
                        total++;
                        checkins.push({ d: dd, c: 1, sBefore: cur2, t: when(h, dd), bonus: true });
                    }
                    continue;
                }
                var c = credit(h, v), dn = isDone(h, v);
                if (dd === today && !dn) {
                    pending = true;
                    continue;
                }
                list.push({ d: dd, c: c });
                s = s * alpha + c * (1 - alpha);
                if (dn) {
                    checkins.push({ d: dd, c: 1, sBefore: cur2, t: when(h, dd) });
                    total++;
                    cur2++;
                    if (cur2 > best)
                        best = cur2;
                }
                else
                    cur2 = 0;
            }
            var r7 = rateOver(list, today - 6, today), r30 = rateOver(list, today - 29, today), r90 = rateOver(list, today - 89, today);
            var trend = trendOf(rateOver(list, today - 27, today), rateOver(list, today - 55, today - 28));
            var wd = [0, 0, 0, 0, 0, 0, 0], wn = [0, 0, 0, 0, 0, 0, 0];
            list.forEach(function (e) { if (e.d > today - 90) {
                wd[dow(e.d)] += e.c;
                wn[dow(e.d)]++;
            } });
            var wrates = wd.map(function (x, j) { return wn[j] ? x / wn[j] : null; });
            var tv = val(h, today), ns = nextMs(cur2);
            return {
                id: h.id, weekly: false, unit: 'day', streak: cur2, best: best, strength: s, r7: r7, r30: r30, r90: r90, trend: trend,
                weekdayRates: wrates, bestWeekday: argmax(wrates), total: total, sum: sum, start: st0,
                todayValue: tv, doneToday: isDone(h, tv), dueToday: isSched(h, today) && !rest[today], pending: pending,
                nextMs: ns, toMs: ns ? ns - cur2 : null, checkins: checkins, list: list, weekCount: null, weekTarget: null
            };
        }
        function statWeekly(h) {
            var st0 = start[h.id], n = weeklyN(h), s = 0, alpha = Math.pow(0.5, Math.sqrt(n / 7) / 13);
            var flags = {}, checkins = [], total = 0, sum = 0, dd;
            for (dd = st0; dd <= today; dd++) {
                var v = val(h, dd);
                if (v > 0)
                    sum += v;
                flags[dd] = isDone(h, v) ? 1 : 0;
            }
            var list = [];
            for (dd = st0; dd <= today; dd++) {
                if (rest[dd])
                    continue;
                var c7 = 0;
                for (var b = dd - 6; b <= dd; b++)
                    c7 += flags[b] || 0;
                s = s * alpha + Math.min(1, c7 / n) * (1 - alpha);
                list.push({ d: dd, c: Math.min(1, c7 / n) });
            }
            var cur2 = 0, best = 0, cw = weekStart(today, ws), wk = [], w;
            for (w = weekStart(st0, ws); w <= cw; w += 7) {
                var cnt = 0, rd = 0;
                for (dd = w; dd < w + 7; dd++) {
                    if (dd > today)
                        break;
                    if (dd < st0)
                        continue;
                    cnt += flags[dd] || 0;
                    if (rest[dd])
                        rd++;
                }
                var expected = Math.min(n, 7 - rd);
                var isCur = w === cw;
                if (expected <= 0)
                    continue;
                var met = cnt >= expected;
                wk.push({ w: w, count: cnt, expected: expected, met: met });
                if (met) {
                    cur2++;
                    if (cur2 > best)
                        best = cur2;
                }
                else if (!isCur)
                    cur2 = 0;
            }
            // check-ins with the week-streak that stood before their week
            var before = 0, bw = {};
            wk.forEach(function (x) { bw[x.w] = before; if (x.met)
                before++;
            else if (x.w !== cw)
                before = 0; });
            for (dd = st0; dd <= today; dd++) {
                if (flags[dd]) {
                    total++;
                    checkins.push({ d: dd, c: 1, sBefore: bw[weekStart(dd, ws)] || 0, t: when(h, dd) });
                }
            }
            function cnt2(from, to) { var x = 0; for (var j = from; j <= to; j++)
                x += flags[j] || 0; return x; }
            var r7 = Math.min(1, cnt2(today - 6, today) / n), r30 = Math.min(1, cnt2(today - 27, today) / (n * 4)), r90 = Math.min(1, cnt2(today - 90, today) / (n * 13));
            var trend = trendOf(Math.min(1, cnt2(today - 27, today) / (n * 4)), Math.min(1, cnt2(today - 55, today - 28) / (n * 4)));
            var wd = [0, 0, 0, 0, 0, 0, 0];
            for (dd = Math.max(st0, today - 89); dd <= today; dd++)
                if (flags[dd])
                    wd[dow(dd)]++;
            var totalRecent = wd.reduce(function (a, x) { return a + x; }, 0);
            var wrates = wd.map(function (x) { return totalRecent ? x / Math.max.apply(null, wd) : null; });
            var thisWeek = wk.length && wk[wk.length - 1].w === cw ? wk[wk.length - 1] : { count: 0, expected: n };
            var tv = val(h, today), ns = nextMs(cur2);
            return {
                id: h.id, weekly: true, unit: 'week', streak: cur2, best: best, strength: s, r7: r7, r30: r30, r90: r90, trend: trend,
                weekdayRates: wrates, bestWeekday: totalRecent ? argmax(wrates) : -1, total: total, sum: sum, start: st0,
                todayValue: tv, doneToday: isDone(h, tv), dueToday: true, pending: false,
                nextMs: ns, toMs: ns ? ns - cur2 : null, checkins: checkins, list: list, weekCount: thisWeek.count, weekTarget: n, weeks: wk
            };
        }
        /* --- step 4: per-week totals, weekly challenge --- */
        var weekDone = {}, w0 = weekStart(first, ws), cwk = weekStart(today, ws), w;
        for (d = first; d <= today; d++) {
            var wkk = weekStart(d, ws);
            weekDone[wkk] = (weekDone[wkk] || 0) + out.days[d].done;
        }
        var cap = habits.reduce(function (a, h) { return a + perWeek(h); }, 0);
        function targetFor(wk) {
            var prev = weekDone[wk - 7] || 0, base = Math.max(3, Math.ceil(cap * 0.5));
            return Math.max(1, Math.min(cap, Math.max(base, Math.ceil(prev * 1.1))));
        }
        var weeksWon = 0, targets = {};
        for (w = w0; w <= cwk; w += 7) {
            var tg = targetFor(w), got = weekDone[w] || 0;
            targets[w] = tg;
            out.weeks.push({ w: w, done: got, target: tg, met: got >= tg });
            if (got >= tg && w < cwk)
                weeksWon++;
        }
        var cwObj = out.weeks[out.weeks.length - 1];
        out.week = { w: cwk, done: cwObj.done, target: cwObj.target, pct: Math.min(1, cwObj.done / cwObj.target), met: cwObj.met, daysLeft: 6 - rel(today, ws), bonus: WEEK_BONUS, cap: cap, prev: weekDone[cwk - 7] || 0 };
        if (out.week.met)
            weeksWon++;
        /* --- step 5: XP, replayed day by day --- */
        var focusByDay = {}, focusMin = 0;
        (S.sessions || []).forEach(function (s) { var dd = di(s.date); if (dd <= today && (s.mode || 'focus') === 'focus') {
            focusByDay[dd] = (focusByDay[dd] || 0) + (s.min || 0);
            focusMin += s.min || 0;
        } });
        var pagesByDay = {};
        (S.notes || []).forEach(function (p) { if (p.created) {
            var dd = di(p.created);
            if (dd <= today)
                pagesByDay[dd] = (pagesByDay[dd] || 0) + 1;
        } });
        var moodDays = {}, writeDays = {};
        var md;
        for (k in (S.mood || {})) {
            md = di(k);
            if (md <= today && S.mood[k] && S.mood[k].v)
                moodDays[md] = true;
        }
        for (k in (S.writeDays || {})) {
            md = di(k);
            if (md <= today && S.writeDays[k])
                writeDays[md] = true;
        }
        function questsFor(dd, day) {
            var t1 = Math.min(3, Math.max(1, day.due || 1)), even = dow(dd) % 2 === 0;
            var qs = [
                { id: 'habits', prog: Math.min(t1, day.done), target: t1, xp: 15 },
                { id: 'mood', prog: moodDays[dd] ? 1 : 0, target: 1, xp: 10 },
                even ? { id: 'focus', prog: Math.min(25, focusByDay[dd] || 0), target: 25, xp: 15 } : { id: 'write', prog: writeDays[dd] ? 1 : 0, target: 1, xp: 15 }
            ];
            qs.forEach(function (q) { q.done = q.prog >= q.target; });
            return qs;
        }
        var CHEST_XP = 30, MOOD_XP = 5;
        var boost = {};
        brokeAt.forEach(function (b) { for (var j = 1; j <= 3; j++)
            boost[b.d + j] = true; });
        var xp = 0, byDay = {}, luckyTotal = 0, luckyToday = {}, weekXpGot = {}, gainToday = 0, gainsToday = [];
        var perfectDays = 0, perfectRun = 0, perfectBest = 0, early = false, owl = false, wCount = 0, wMetBonusDone = {};
        for (d = first; d <= today; d++) {
            var ent = [];
            habits.forEach(function (h, hi) {
                var arr = allDaily[h.id];
                for (var j = arr.length - 1; j >= 0; j--) {
                    if (arr[j].d === d) {
                        ent.push({ h: h, e: arr[j], hi: hi });
                        break;
                    }
                    if (arr[j].d < d)
                        break;
                }
            });
            ent.sort(function (a, b) { return (a.e.t - b.e.t) || (a.hi - b.hi); });
            var dayXp = 0, nth = 0;
            ent.forEach(function (x) {
                nth++;
                var m = streakMultiplier(x.e.sBefore), combo = 1 + Math.min(0.4, 0.08 * (nth - 1));
                var lucky = rand01(x.h.id + '|' + key(d)) < 0.12;
                var cb = boost[d] ? 1.5 : 1;
                var g = Math.round(baseXp(x.h) * m * combo * (lucky ? 2 : 1) * cb);
                dayXp += g;
                if (lucky) {
                    luckyTotal++;
                    if (d === today)
                        luckyToday[x.h.id] = true;
                }
                if (d === today)
                    gainsToday.push({ id: x.h.id, xp: g, lucky: lucky, combo: nth, m: m, comeback: !!boost[d] });
                if (x.e.t >= 0 && x.e.t < 8 * 60 && !x.e.bonus)
                    early = true;
                if (x.e.t >= 22 * 60)
                    owl = true;
            });
            var dd3 = out.days[d];
            if (dd3.perfect && dd3.due >= 2) {
                dayXp += PERFECT_BONUS;
            }
            if (dd3.perfect) {
                perfectDays++;
                perfectRun++;
                if (perfectRun > perfectBest)
                    perfectBest = perfectRun;
            }
            else if (!dd3.free && !dd3.rest && !dd3.frozen)
                perfectRun = 0;
            dayXp += Math.min(focusByDay[d] || 0, 90);
            dayXp += Math.min(pagesByDay[d] || 0, 3) * 3;
            if (moodDays[d])
                dayXp += MOOD_XP;
            var qs = questsFor(d, dd3), allQ = qs.every(function (q) { return q.done; });
            qs.forEach(function (q) { if (q.done)
                dayXp += q.xp; });
            if (allQ)
                dayXp += CHEST_XP;
            if (d === today) {
                out.quests = qs;
                out.chest = { done: allQ, xp: CHEST_XP };
            }
            // weekly challenge bonus lands on the day the target is first reached
            var wkS = weekStart(d, ws);
            if (rel(d, ws) === 0)
                wCount = 0;
            wCount += dd3.done;
            if (!wMetBonusDone[wkS] && wCount >= targets[wkS]) {
                wMetBonusDone[wkS] = true;
                dayXp += WEEK_BONUS;
                weekXpGot[wkS] = d;
            }
            byDay[d] = dayXp;
            xp += dayXp;
        }
        var li = levelInfo(xp);
        out.xp = { total: xp, level: li.level, into: li.into, need: li.need, toNext: li.toNext, pct: li.pct, byDay: byDay, today: byDay[today] || 0, luckyTotal: luckyTotal, luckyToday: luckyToday, gainsToday: gainsToday, stage: stage(li.level) };
        /* --- step 6: compound growth (only ever goes up) --- */
        var g = 100;
        for (d = first; d <= today; d++) {
            var x2 = out.days[d];
            g *= (1 + 0.005 * (x2.free || x2.rest ? 0 : x2.ratio));
            out.growth.push({ d: d, g: g });
        }
        /* --- totals, insights, badges --- */
        var checks = 0, bestStrength = 0, bestId = null, kinds = {};
        habits.forEach(function (h) {
            var s = out.habits[h.id];
            checks += s.total;
            kinds[h.kind] = 1;
            if (s.strength > bestStrength) {
                bestStrength = s.strength;
                bestId = h.id;
            }
        });
        var comeback = false;
        brokeAt.forEach(function (b) { var run = 0; for (var j = b.d + 1; j <= today; j++) {
            if (out.days[j] && out.days[j].lit) {
                run++;
                if (run >= 3)
                    comeback = true;
            }
            else if (!(out.days[j] && (out.days[j].free || out.days[j].frozen)))
                run = 0;
        } });
        out.totals = { checkins: checks, perfectDays: perfectDays, perfectRun: perfectBest, focusMin: focusMin, bestStrength: bestStrength, bestId: bestId, weeksWon: weeksWon, lucky: luckyTotal, comeback: comeback, active: habits.length };
        out.badges = badgeList({
            checkins: checks, chainBest: C.best, perfectDays: perfectDays, perfectRun: perfectBest, bestStrength: bestStrength, comeback: comeback,
            early: early, owl: owl, lucky: luckyTotal, weeksWon: weeksWon, focusMin: focusMin, pages: (S.notes || []).length, level: li.level
        });
        /* time-of-day and weekday shape of the last 90 days */
        var hrs = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], wds = [0, 0, 0, 0, 0, 0, 0];
        habits.forEach(function (h) {
            allDaily[h.id].forEach(function (e) {
                if (e.d <= today - 90)
                    return;
                wds[dow(e.d)]++;
                if (e.t >= 0)
                    hrs[Math.min(11, Math.floor(e.t / 120))]++;
            });
        });
        out.hours = hrs;
        out.weekdays = wds;
        return out;
    }
    var RECOMMENDED = [
        { id: 'water', emoji: '💧', kind: 'amount', target: 2, unit: 'L', step: 0.25, score: 1, replace: .25 },
        { id: 'read', emoji: '📖', kind: 'normal', score: 1, replace: .82 },
        { id: 'walk', emoji: '🚶', kind: 'normal', score: 1, replace: .68 },
        { id: 'meditate', emoji: '🧘', kind: 'normal', score: 1, replace: .62 },
        { id: 'journal', emoji: '✍️', kind: 'normal', score: 1, replace: .52 },
        { id: 'stretch', emoji: '🤸', kind: 'normal', score: 1, replace: .38 },
        { id: 'sleep', emoji: '🌙', kind: 'normal', score: 1, replace: .90 },
        { id: 'sunlight', emoji: '☀️', kind: 'normal', score: 1, replace: .30 },
        { id: 'tidy', emoji: '🧹', kind: 'normal', score: 1, replace: .58 },
        { id: 'deepwork', emoji: '🧠', kind: 'normal', score: 1, replace: 1.00 }
    ];
    /* 30-day Adventure skills. These are deliberately separate from the 10
       starter habits: Adventure is about choosing one learnable skill to practice
       for a month. dailyMinutes is the recommended daily practice time. */
    var ADVENTURE_SKILLS = [
        { id: 'morse', emoji: '📡', dailyMinutes: 30, replace: .34 },
        { id: 'typing', emoji: '⌨️', dailyMinutes: 20, replace: .24 },
        { id: 'drawing_nature', emoji: '🌿', dailyMinutes: 30, replace: .30 },
        { id: 'public_speaking', emoji: '🎤', dailyMinutes: 25, replace: .26 },
        { id: 'chess', emoji: '♟️', dailyMinutes: 45, replace: .43 },
        { id: 'cooking', emoji: '🍳', dailyMinutes: 45, replace: .48 },
        { id: 'french', emoji: '🇫🇷', dailyMinutes: 60, replace: .72 },
        { id: 'spanish', emoji: '🇪🇸', dailyMinutes: 60, replace: .70 },
        { id: 'wrestling', emoji: '🤼', dailyMinutes: 60, replace: .62 },
        { id: 'programming', emoji: '💻', dailyMinutes: 90, replace: 1.00 }
    ];
    var ACHIEVEMENTS = [
        { id: 'first_habit', active: true, test: function (c) { return c.totals && c.totals.checkins >= 1; } },
        { id: 'chain_3', active: true, test: function (c) { return c.chain && c.chain.best >= 3; } },
        { id: 'chain_7', active: true, test: function (c) { return c.chain && c.chain.best >= 7; } },
        { id: 'perfect_7', active: true, test: function (c) { return c.totals && c.totals.perfectRun >= 7; } },
        { id: 'xp_100', active: true, test: function (c) { return c.xp && c.xp.total >= 100; } },
        { id: 'chain_14', active: false, test: function (c) { return c.chain && c.chain.best >= 14; } },
        { id: 'chain_30', active: false, test: function (c) { return c.chain && c.chain.best >= 30; } },
        { id: 'chain_66', active: false, test: function (c) { return c.chain && c.chain.best >= 66; } },
        { id: 'perfect_14', active: false, test: function (c) { return c.totals && c.totals.perfectRun >= 14; } },
        { id: 'checkins_25', active: false, test: function (c) { return c.totals && c.totals.checkins >= 25; } },
        { id: 'checkins_100', active: false, test: function (c) { return c.totals && c.totals.checkins >= 100; } },
        { id: 'focus_300', active: false, test: function (c) { return c.totals && c.totals.focusMin >= 300; } },
        { id: 'focus_1500', active: false, test: function (c) { return c.totals && c.totals.focusMin >= 1500; } },
        { id: 'writer_10', active: false, test: function (c) { return c.totals && c.totals.pages >= 10; } },
        { id: 'lvl_5', active: false, test: function (c) { return c.xp && c.xp.level >= 5; } },
        { id: 'lvl_10', active: false, test: function (c) { return c.xp && c.xp.level >= 10; } },
        { id: 'mood_7', active: false, test: function (c) { return c.moodCount >= 7; } },
        { id: 'rest_wise', active: false, test: function (c) { return c.chain && c.chain.leavesEarned >= 1; } },
        { id: 'all_rounder', active: false, test: function (c) { return c.totals && c.totals.active >= 5; } },
        { id: 'balanced_week', active: false, test: function (c) { return c.week && c.week.done >= 5; } },
        { id: 'early', active: false, test: function (c) { return c.totals && c.totals.early; } },
        { id: 'night_owl', active: false, test: function (c) { return c.totals && c.totals.owl; } },
        { id: 'comeback', active: false, test: function (c) { return c.totals && c.totals.comeback; } },
        { id: 'habit_1st_month', active: false, test: function (c) { return c.totals && c.totals.checkins >= 30; } },
        { id: 'xp_1000', active: false, test: function (c) { return c.xp && c.xp.total >= 1000; } }
    ];
    function grade(score) {
        return score >= 93 ? 'A+' : score >= 90 ? 'A' : score >= 87 ? 'A-' : score >= 83 ? 'B+' : score >= 80 ? 'B' : score >= 77 ? 'B-' : score >= 73 ? 'C+' : score >= 70 ? 'C' : score >= 67 ? 'C-' : score >= 63 ? 'D+' : score >= 60 ? 'D' : 'F';
    }
    function schoolReport(S, comp, today) {
        var rows = [], habits = (S.habits || []).filter(function (h) { return !h.archived; }), totalWeighted = 0, totalWeight = 0;
        habits.forEach(function (h) {
            var st = comp.habits[h.id];
            if (!st)
                return;
            var completion = clamp(st.r30 == null ? 0 : st.r30, 0, 1);
            var strength = clamp(st.strength || 0, 0, 1);
            var consistency = clamp((st.streak || 0) / 14, 0, 1);
            var trend = clamp((st.trend == null ? 0 : st.trend) + .5, 0, 1);
            var score = Math.round((completion * .5 + strength * .25 + consistency * .15 + trend * .1) * 100);
            var weight = h.kind === 'avoid' ? .85 : 1;
            totalWeighted += score * weight;
            totalWeight += weight;
            rows.push({ id: h.id, name: h.name, emoji: h.emoji || '🌱', score: score, grade: grade(score), completion: Math.round(completion * 100), strength: Math.round(strength * 100), streak: st.streak || 0, trend: st.trend30 == null ? 0 : Math.round(st.trend30 * 100), type: h.kind });
        });
        rows.sort(function (a, b) { return b.score - a.score; });
        var focus = focusMinutes(S);
        var focusScore = clamp(focus / Math.max(120, habits.length * 30), 0, 1);
        var moodCount = Object.keys(S.mood || {}).filter(function (k) { return di(k) <= today; }).length;
        var overall = rows.length ? Math.round(totalWeighted / totalWeight) : 0;
        if (rows.length) {
            var extra = 0, extraWeight = 0;
            if (focus > 0) {
                extra += focusScore * 7;
                extraWeight += 7;
            }
            if (moodCount > 0) {
                extra += clamp(moodCount / 7, 0, 1) * 5;
                extraWeight += 5;
            }
            overall = extraWeight ? Math.round((overall * 88 + extra) / (88 + extraWeight)) : overall;
        }
        var delta = 0, prevSum = 0, prevN = 0;
        habits.forEach(function (h) { var st = comp.habits[h.id]; if (st && st.r7 != null && st.r30 != null) {
            prevSum += st.r30;
            prevN++;
        } });
        if (prevN)
            delta = Math.round((prevSum / prevN) * 100);
        return { overall: clamp(overall, 0, 100), grade: grade(overall), rows: rows, focusMin: focus, moodCount: moodCount, note: overall >= 90 ? 'excellent' : overall >= 80 ? 'steady' : overall >= 70 ? 'building' : rows.length ? 'restart' : 'empty', delta: delta };
    }
    function achievementList(comp, saved) {
        saved = saved || {};
        return ACHIEVEMENTS.map(function (a, i) { var earned = !!a.test(comp); return { id: a.id, active: !!a.active, earned: earned, claimed: !!saved[a.id], index: i + 1 }; });
    }
    function badHabitLoad(S, today) {
        var habits = (S.habits || []).filter(function (h) { return !h.archived && h.kind === 'avoid'; });
        var actual = 0;
        for (var dd = today - 6; dd <= today; dd++)
            habits.forEach(function (h) {
                var e = (S.logs || {})[key(dd)] && (S.logs || {})[key(dd)][h.id];
                var v = e ? (typeof e === 'number' ? e : e.v || 0) : 0;
                if (h.kind === 'avoid' && h.type === 'amount') {
                    actual += Math.max(0, v) * 60;
                }
                else if (h.kind === 'avoid' && !isDone(h, v)) {
                    actual += (h.badCost || 15);
                }
                if (v > 0 && h.badCost)
                    actual += Math.max(0, v - 1) * h.badCost;
            });
        var configured = Number(S.adventure && S.adventure.badHoursPerDay);
        var hasConfigured = isFinite(configured) && configured >= 0;
        var estimated = hasConfigured ? configured * 60 * 7 : 0;
        var minutes = Math.round(Math.max(actual, estimated));
        var score = clamp(minutes / 420, 0, 1);
        var detail = habits.map(function (h) { return { id: h.id, name: h.name, minutes: minutes }; });
        return { minutes: minutes, score: score, habits: detail, configuredHours: hasConfigured ? configured : null, actualMinutes: Math.round(actual), estimatedMinutes: Math.round(estimated) };
    }
    function recommendationById(id) { for (var i = 0; i < RECOMMENDED.length; i++)
        if (RECOMMENDED[i].id === id)
            return RECOMMENDED[i]; return null; }
    function adventureSkillById(id) { for (var i = 0; i < ADVENTURE_SKILLS.length; i++)
        if (ADVENTURE_SKILLS[i].id === id)
            return ADVENTURE_SKILLS[i]; return null; }
    function adventureSkillName(skill) { return skill ? skill.id : ''; }
    function adventurePool(S, comp, today) {
        var bad = badHabitLoad(S, today), hours = bad.configuredHours == null ? Math.max(0, bad.score * 7) : bad.configuredHours;
        var availableMinutes = Math.max(20, Math.round(hours * 60));
        var pressure = clamp(hours / 6, 0, 1), list = [];
        ADVENTURE_SKILLS.forEach(function (skill) {
            /* A skill only enters the roll when its recommended daily practice fits
               the time the user says they spend on bad habits. This turns the input
               into an actual personalized candidate list rather than merely changing
               the number of cards. */
            if (skill.dailyMinutes > availableMinutes)
                return;
            var existing = (S.habits || []).some(function (h) { return !h.archived && h.adventureSkillId === skill.id; });
            var existingStats = null;
            (S.habits || []).some(function (h) { if (!h.archived && h.adventureSkillId === skill.id) {
                existingStats = comp.habits[h.id];
                return true;
            } return false; });
            var missed = existingStats && existingStats.r7 != null ? clamp(1 - existingStats.r7, 0, 1) : 1;
            var fit = clamp(availableMinutes / Math.max(skill.dailyMinutes, 1), 0, 2);
            var priority = (.55 + missed * .85 + skill.replace * pressure * 1.7 + fit * .20 + (existing ? -.18 : .28));
            list.push({
                h: { id: skill.id, name: skill.id, emoji: skill.emoji, kind: 'normal', sched: { type: 'daily' }, _adventureSkill: true, dailyMinutes: skill.dailyMinutes, monthlyMinutes: skill.dailyMinutes * 30, adventureReplacement: skill.replace },
                skill: skill, wBase: priority, replace: skill.replace, virtual: !existing
            });
        });
        /* Keep the pool useful even if the estimate is tiny: the lightest four
           skills remain available, but an honest estimate still changes weighting. */
        if (!list.length) {
            ADVENTURE_SKILLS.slice().sort(function (a, b) { return a.dailyMinutes - b.dailyMinutes; }).slice(0, 4).forEach(function (skill) {
                list.push({ h: { id: skill.id, name: skill.id, emoji: skill.emoji, kind: 'normal', sched: { type: 'daily' }, _adventureSkill: true, dailyMinutes: skill.dailyMinutes, monthlyMinutes: skill.dailyMinutes * 30, adventureReplacement: skill.replace }, skill: skill, wBase: .8 + skill.replace * .25, replace: skill.replace, virtual: true });
            });
        }
        list.sort(function (a, b) { return b.wBase - a.wBase; });
        var n = hours < .5 ? 3 : hours < 1 ? 4 : hours < 2 ? 5 : hours < 4 ? 7 : hours < 6 ? 8 : 10;
        if (list.length < n)
            n = list.length;
        return { list: list.slice(0, n), bad: bad, pressure: pressure, availableMinutes: availableMinutes };
    }
    function adventurePick(S, comp, today, seed) {
        var pool = adventurePool(S, comp, today);
        if (!pool.list.length)
            return null;
        var total = 0, weights = pool.list.map(function (x) { var w = 1 + x.wBase * (.8 + pool.bad.score * 1.35); total += w; return { x: x, w: w }; });
        var r = rand01((seed || 'adventure') + '|' + today + '|' + pool.bad.minutes + '|' + pool.list.length) * total, pick = weights[weights.length - 1];
        for (var i = 0; i < weights.length; i++) {
            r -= weights[i].w;
            if (r <= 0) {
                pick = weights[i];
                break;
            }
        }
        var skill = pick.x.skill || adventureSkillById(pick.x.h.id);
        return { habit: pick.x.h, skill: skill, load: pool.bad, weight: pick.w, pool: pool.list.length, virtual: pick.x.virtual, poolNames: pool.list.map(function (x) { return x.skill ? x.skill.id : x.h.name || x.h.id; }), availableMinutes: pool.availableMinutes };
    }
    function adventureMonthProgress(S, plan, today) {
        if (!plan || !plan.habitId)
            return { days: 0, total: 30, pct: 0, doneDays: 0, active: false };
        var start = Number(plan.startDay), end = Number(plan.endDay);
        if (!isFinite(start) || !isFinite(end))
            return { days: 0, total: 30, pct: 0, doneDays: 0, active: false };
        var until = Math.min(today, end), days = Math.max(0, until - start + 1), doneDays = 0, h = null;
        (S.habits || []).some(function (x) { if (x.id === plan.habitId) {
            h = x;
            return true;
        } return false; });
        if (h) {
            for (var d = start; d <= until; d++) {
                var e = (S.logs || {})[key(d)] && (S.logs || {})[key(d)][h.id], v = e ? (typeof e === 'number' ? e : e.v || 0) : 0;
                if (isDone(h, v))
                    doneDays++;
            }
        }
        var total = 30;
        return { days: days, total: total, pct: days ? clamp(doneDays / days, 0, 1) : 0, doneDays: doneDays, active: today <= end, remaining: Math.max(0, end - today), completed: today >= end };
    }
    function sessionXpOnly(S, today) { var t = 0, byDay = {}; (S.sessions || []).forEach(function (s) { var d = di(s.date); if (d > today)
        return; var k = s.date; byDay[k] = (byDay[k] || 0) + (s.min || 0); }); for (var k in byDay)
        t += Math.min(90, byDay[k]); (S.notes || []).forEach(function (n) { if (!n.created || di(n.created) <= today)
        t += 3; }); return t; }
    function focusMinutes(S) { var t = 0; (S.sessions || []).forEach(function (s) { if ((s.mode || 'focus') === 'focus')
        t += s.min || 0; }); return t; }
    function badgeList(a) { return BADGES.map(function (b) { return { id: b.id, earned: !!b.test(a) }; }); }
    function argmax(arr) { var bi = -1, bv = -1; arr.forEach(function (x, i) { if (x != null && x > bv) {
        bv = x;
        bi = i;
    } }); return bi; }
    /* ==========================================================
       Mood: numbers behind "how am I actually doing?"
         avg7 / avg30   plain means
         trend          least-squares slope of the last 30 days, in points per week
         corr           Pearson r between mood and how much of the day you completed
         lifts          per habit: mean mood on days it was done - mean mood on days it was not
       A lift is only reported once there are at least 4 days on each side, so it never
       claims more than the data can support.
       ========================================================== */
    function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
    function moodStats(S, comp, today) {
        var M = S.mood || {}, all = [], k;
        for (k in M) {
            var d = di(k);
            if (d <= today && M[k] && M[k].v)
                all.push({ d: d, v: M[k].v });
        }
        all.sort(function (a, b) { return a.d - b.d; });
        var byDay = {};
        all.forEach(function (e) { byDay[e.d] = e.v; });
        var series = [];
        for (var i = 29; i >= 0; i--)
            series.push({ d: today - i, v: byDay[today - i] == null ? null : byDay[today - i] });
        var last7 = all.filter(function (e) { return e.d > today - 7; }).map(function (e) { return e.v; });
        var last30 = all.filter(function (e) { return e.d > today - 30; });
        var prev30 = all.filter(function (e) { return e.d <= today - 30 && e.d > today - 60; }).map(function (e) { return e.v; });
        var out = { count: all.length, today: byDay[today] || 0, series: series, avg7: mean(last7), avg30: mean(last30.map(function (e) { return e.v; })), avgPrev30: mean(prev30), avg: mean(all.map(function (e) { return e.v; })), trend: null, corr: null, lifts: [], bestWeekday: -1, weekday: [null, null, null, null, null, null, null], logStreak: 0 };
        // least-squares slope (points per week)
        if (last30.length >= 5) {
            var mx = mean(last30.map(function (e) { return e.d; })), my = mean(last30.map(function (e) { return e.v; })), sxy = 0, sxx = 0;
            last30.forEach(function (e) { sxy += (e.d - mx) * (e.v - my); sxx += (e.d - mx) * (e.d - mx); });
            out.trend = sxx ? (sxy / sxx) * 7 : 0;
        }
        // correlation with completion
        var xs = [], ys = [];
        all.forEach(function (e) { var day = comp.days[e.d]; if (day) {
            xs.push(day.ratio);
            ys.push(e.v);
        } });
        if (xs.length >= 7) {
            var ax = mean(xs), ay = mean(ys), num = 0, dx = 0, dy = 0;
            for (var j = 0; j < xs.length; j++) {
                num += (xs[j] - ax) * (ys[j] - ay);
                dx += (xs[j] - ax) * (xs[j] - ax);
                dy += (ys[j] - ay) * (ys[j] - ay);
            }
            out.corr = dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
        }
        // per-habit lift over the last 90 days
        var recent = all.filter(function (e) { return e.d > today - 90; });
        (S.habits || []).filter(function (h) { return !h.archived; }).forEach(function (h) {
            var st = comp.habits[h.id];
            if (!st)
                return;
            var done = {};
            st.checkins.forEach(function (c) { done[c.d] = true; });
            var a = [], b = [];
            recent.forEach(function (e) { if (e.d < st.start)
                return; (done[e.d] ? a : b).push(e.v); });
            if (a.length >= 4 && b.length >= 4)
                out.lifts.push({ id: h.id, lift: mean(a) - mean(b), m1: mean(a), m0: mean(b), n1: a.length, n0: b.length });
        });
        out.lifts.sort(function (x, y) { return y.lift - x.lift; });
        // weekday shape
        var wsum = [0, 0, 0, 0, 0, 0, 0], wn = [0, 0, 0, 0, 0, 0, 0];
        recent.forEach(function (e) { wsum[dow(e.d)] += e.v; wn[dow(e.d)]++; });
        var wv = wsum.map(function (x, j) { return wn[j] >= 3 ? x / wn[j] : null; });
        out.weekday = wv;
        out.bestWeekday = argmax(wv);
        // days in a row with a mood logged (today may still be empty)
        var dd2 = byDay[today] ? today : today - 1;
        while (byDay[dd2]) {
            out.logStreak++;
            dd2--;
        }
        return out;
    }
    /* ==========================================================
       Month sheet: the same maths as the spreadsheet
         per habit   = days done / days it is scheduled in the month
         overall     = all check-ins / all scheduled slots
         daily row   = how many habits were done that day
       ========================================================== */
    function monthSheet(S, comp, year, month, today, cfg) {
        var ws = (cfg && cfg.weekStart != null) ? cfg.weekStart : 1;
        var n = daysInMonth(year, month), first = Math.round(Date.UTC(year, month, 1) / DAY);
        var habits = (S.habits || []).filter(function (h) { return !h.archived; });
        var rows = [], totalDone = 0, totalSlots = 0, dayTotals = [];
        for (var i = 0; i < n; i++)
            dayTotals.push(0);
        var logs = S.logs || {}, manual = S.rest || {};
        habits.forEach(function (h) {
            var st = comp.habits[h.id], cells = [], done = 0, slots = 0;
            for (var i2 = 0; i2 < n; i2++) {
                var d = first + i2, e = logs[key(d)] && logs[key(d)][h.id], v = e ? (typeof e === 'number' ? e : e.v) : 0;
                var isRest = !!manual[key(d)] || !!comp.frozen[d];
                var state;
                if (d > today)
                    state = 'future';
                else if (st && d < st.start)
                    state = 'pre';
                else if (isDone(h, v))
                    state = 'done';
                else if (isRest)
                    state = 'rest';
                else if (!isWeekly(h) && !isSched(h, d))
                    state = 'off';
                else
                    state = 'miss';
                if (state === 'done') {
                    done++;
                    dayTotals[i2]++;
                }
                cells.push({ d: d, day: i2 + 1, state: state, v: v, partial: h.kind === 'amount' && v > 0 && h.target > 0 && state !== 'done' ? Math.min(1, v / h.target) : 0 });
            }
            // slots = scheduled days in the month (weekly habits: n per week, pro rata)
            if (isWeekly(h))
                slots = Math.round(weeklyN(h) * n / 7);
            else
                for (var i3 = 0; i3 < n; i3++) {
                    if (isSched(h, first + i3) && !cells[i3].state.match(/^(pre|rest)$/))
                        slots++;
                }
            slots = Math.max(slots, done);
            totalDone += done;
            totalSlots += slots;
            rows.push({ id: h.id, cells: cells, done: done, slots: slots, pct: slots ? done / slots : 0 });
        });
        return { year: year, month: month, days: n, first: first, rows: rows, done: totalDone, slots: totalSlots, pct: totalSlots ? totalDone / totalSlots : 0, dayTotals: dayTotals, active: habits.length, weekStartOffset: rel(first, ws) };
    }
    return {
        DAY: DAY, MILESTONES: MILESTONES, BADGES: BADGES, WEEK_BONUS: WEEK_BONUS, PERFECT_BONUS: PERFECT_BONUS, LEAF_MAX: LEAF_MAX, LEAF_EVERY: LEAF_EVERY,
        di: di, key: key, fromDate: fromDate, dow: dow, rel: rel, weekStart: weekStart, daysInMonth: daysInMonth,
        xpForLevel: xpForLevel, levelFromXp: levelFromXp, levelInfo: levelInfo, streakMultiplier: streakMultiplier, stage: stage,
        isWeekly: isWeekly, weeklyN: weeklyN, isSched: isSched, perWeek: perWeek, isDone: isDone, credit: credit, baseXp: baseXp,
        rand01: rand01, hash: hash, clamp: clamp, compute: compute, monthSheet: monthSheet, moodStats: moodStats, schoolReport: schoolReport, achievementList: achievementList, RECOMMENDED: RECOMMENDED, ADVENTURE_SKILLS: ADVENTURE_SKILLS, ACHIEVEMENTS: ACHIEVEMENTS, recommendationById: recommendationById, adventureSkillById: adventureSkillById, badHabitLoad: badHabitLoad, adventurePool: adventurePool, adventurePick: adventurePick, adventureMonthProgress: adventureMonthProgress
    };
});
