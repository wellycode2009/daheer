"use strict";
/* Daheer insights: the numbers behind your habits, in plain view */
(function () {
    'use strict';
    var D = window.D, HM = window.HM, t = D.t, N = D.N, esc = D.esc, icon = D.icon;
    var shape = 'hours';
    function fmtHour(h) { return D.fmtTime(h * 60).replace(/:00/, ''); }
    // an area/line chart with no text inside (labels are HTML, so it can mirror in RTL)
    function lineChart(vals, o) {
        var W = 600, H = o.h || 170, P = 10, n = vals.length, min = o.min, max = o.max, pts = [];
        vals.forEach(function (v, i) { if (v == null) {
            pts.push(null);
            return;
        } pts.push([P + (W - 2 * P) * (n === 1 ? .5 : i / (n - 1)), P + (H - 2 * P) * (1 - (v - min) / (max - min || 1))]); });
        var d = '', seg = [], segs = [];
        pts.forEach(function (p) { if (p)
            seg.push(p);
        else {
            if (seg.length)
                segs.push(seg);
            seg = [];
        } });
        if (seg.length)
            segs.push(seg);
        segs.forEach(function (s) { d += 'M' + s.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L'); });
        var area = '';
        if (o.area && segs.length) {
            var s0 = segs[segs.length - 1];
            area = '<path class="ch-area" d="M' + s0[0][0].toFixed(1) + ' ' + (H - P) + 'L' + s0.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L') + 'L' + s0[s0.length - 1][0].toFixed(1) + ' ' + (H - P) + 'Z"/>';
        }
        var guides = (o.guides || []).map(function (g) { var y = P + (H - 2 * P) * (1 - (g - min) / (max - min || 1)); return '<line class="ch-guide" x1="' + P + '" x2="' + (W - P) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>'; }).join('');
        var dots = o.dots ? pts.map(function (p) { return p ? '<circle class="ch-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4.2"/>' : ''; }).join('') : '';
        return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + guides + area + '<path class="ch-line" d="' + d + '"/>' + dots + '</svg>';
    }
    function bars(vals, labels, peakIdx) {
        var mx = Math.max.apply(null, vals.concat([1]));
        return '<div class="bars">' + vals.map(function (v, i) { return '<div class="' + (i === peakIdx && v > 0 ? 'peak' : '') + '" title="' + N(v) + '"><i style="height:' + Math.max(3, Math.round(v / mx * 100)) + '%"></i><span>' + esc(labels[i]) + '</span></div>'; }).join('') + '</div>';
    }
    function trendArrow(x) { return x == null ? '' : '<b class="' + (x >= .03 ? 'up' : x <= -.03 ? 'dn' : '') + '">' + (x >= .03 ? '▲' : x <= -.03 ? '▼' : '●') + '</b>'; }
    function render(root) {
        var S = D.store.S, c = D.store.comp(), m = D.store.mood(), today = D.store.today(), ws = S.settings.weekStart, hs = D.store.activeHabits();
        if (!hs.length && !m.count) {
            root.innerHTML = '<header class="head"><div><h1>' + esc(t('in.title')) + '</h1><p class="sub">' + esc(t('in.sub')) + '</p></div></header><section class="card c-paper empty-card"><div class="empty-art">' + icon('chart') + '</div><h3>' + esc(t('in.empty.t')) + '</h3><p class="meta">' + esc(t('in.empty.p')) + '</p><button class="btn" data-go="habits">' + icon('sprout') + esc(t('in.empty.cta')) + '</button></section>';
            return;
        }
        var stats = hs.map(function (h) { return { h: h, st: c.habits[h.id] }; }).filter(function (x) { return x.st; });
        var r30 = stats.length ? stats.reduce(function (a, x) { return a + (x.st.r30 || 0); }, 0) / stats.length : null;
        var lit84 = 0;
        for (var d = today - 83; d <= today; d++)
            if (c.days[d] && c.days[d].done > 0)
                lit84++;
        var tiles = '<div class="itiles">' +
            tile(N(c.totals.checkins), t('in.checkins')) + tile(D.pct(r30), t('in.rate30')) + tile(N(c.chain.best), t('in.bestchain')) + tile(N(lit84) + '/84', t('in.active')) + tile(N(c.totals.perfectDays), t('in.perfect')) + tile(N(Math.round(c.growth.length ? c.growth[c.growth.length - 1].g : 100)), t('in.growthidx')) + '</div>';
        function tile(v, l) { return '<div class="itile"><b>' + v + '</b><small>' + esc(l) + '</small></div>'; }
        // growth
        var g = c.growth.slice(-90), gv = g.map(function (x) { return x.g; }), gmin = Math.min.apply(null, gv) * .995, gmax = Math.max.apply(null, gv) * 1.005;
        var gain = g.length > 1 ? g[g.length - 1].g / g[0].g - 1 : 0;
        var growth = '<section class="card c-paper wide-c"><div class="card-head"><h3>' + esc(t('in.growth')) + '</h3><span class="meta">' + esc(t('in.growth.gain', { n: N(Math.round(gain * 1000) / 10, 1) })) + '</span></div>' + (g.length > 2 ? lineChart(gv, { min: gmin, max: gmax, area: true, h: 150 }) : '<p class="meta">' + esc(t('in.needmore')) + '</p>') + '<div class="chart-x"><span>' + esc(g.length ? D.fmtDate(HM.key(g[0].d), { month: 'short', day: 'numeric' }) : '') + '</span><span>' + esc(D.fmtDate(HM.key(today), { month: 'short', day: 'numeric' })) + '</span></div><p class="meta">' + esc(t('in.growth.p')) + '</p></section>';
        // mood
        var mv = m.series.map(function (x) { return x.v; }), faces = '';
        var moodTop = '';
        if (m.count) {
            var lifts = m.lifts.slice(0, 4).map(function (l) { var h = D.store.habit(l.id); return '<li><span>' + esc((h.emoji || '') + ' ' + h.name) + '</span><b class="' + (l.lift >= .15 ? 'up' : l.lift <= -.15 ? 'dn' : '') + '">' + (l.lift >= 0 ? '+' : '') + N(Math.round(l.lift * 10) / 10, 1) + '</b></li>'; }).join('');
            var corrTxt = m.corr == null ? '' : m.corr >= .3 ? t('in.corr.pos') : m.corr <= -.3 ? t('in.corr.neg') : t('in.corr.flat');
            moodTop = '<div class="mood-sum"><div><b>' + N(m.avg30 != null ? m.avg30 : m.avg, 1) + '</b><small>' + esc(t('in.mood.avg')) + '</small></div><div><b>' + (m.trend == null ? '–' : (m.trend >= 0 ? '+' : '') + N(Math.round(m.trend * 100) / 100, 2)) + '</b><small>' + esc(t('in.mood.trend')) + '</small></div><div><b>' + N(m.logStreak) + '</b><small>' + esc(t('in.mood.streak')) + '</small></div>' +
                (m.bestWeekday >= 0 ? '<div><b class="sm">' + esc(D.weekdayName(m.bestWeekday, 'long')) + '</b><small>' + esc(t('in.mood.bestday')) + '</small></div>' : '') + '</div>' + lineChart(mv, { min: 1, max: 5, guides: [1, 2, 3, 4, 5], dots: true, h: 150 }) +
                '<div class="chart-x"><span>' + esc(D.fmtDate(HM.key(m.series[0].d), { month: 'short', day: 'numeric' })) + '</span><span>' + esc(D.fmtDate(HM.key(today), { month: 'short', day: 'numeric' })) + '</span></div>' +
                (lifts ? '<h4 class="sub-h">' + esc(t('in.lifts')) + '</h4><ul class="lifts">' + lifts + '</ul><p class="meta">' + esc(t('in.lifts.p')) + '</p>' : '<p class="meta">' + esc(t('in.lifts.need')) + '</p>') + (corrTxt ? '<p class="corr">' + icon('sprout') + esc(corrTxt) + ' <small>r = ' + N(Math.round(m.corr * 100) / 100, 2) + '</small></p>' : '');
        }
        else
            moodTop = '<p class="meta">' + esc(t('in.mood.empty')) + '</p><button class="btn btn-ghost sm" data-go="habits">' + icon('smile') + esc(t('in.mood.cta')) + '</button>';
        var mood = '<section class="card c-mist"><div class="card-head"><h3>' + esc(t('mood.title')) + '</h3><span class="meta">' + esc(t('in.last30')) + '</span></div>' + moodTop + '</section>';
        // strength ranking
        var rank = stats.slice().sort(function (a, b) { return b.st.strength - a.st.strength; }).map(function (x) {
            return '<div class="rk" data-open-habit="' + esc(x.h.id) + '" role="button" tabindex="0"><span class="rk-n">' + esc((x.h.emoji || '🌱') + ' ' + x.h.name) + '</span><div class="bar"><i style="width:' + Math.round(x.st.strength * 100) + '%"></i></div><b>' + D.pct(x.st.strength) + '</b><small>' + esc(D.strengthName(x.st.strength)) + ' · ' + esc(t('in.r30', { v: D.pct(x.st.r30) })) + ' ' + trendArrow(x.st.trend) + '</small></div>';
        }).join('');
        var ranking = '<section class="card c-paper"><div class="card-head"><h3>' + esc(t('in.strength')) + '</h3></div>' + (rank || '<p class="meta">' + esc(t('in.needmore')) + '</p>') + '<p class="meta">' + esc(t('in.strength.p')) + '</p></section>';
        // when do you show up
        var vals, labels, peak;
        if (shape === 'hours') {
            vals = c.hours;
            labels = c.hours.map(function (_, i) { return i % 2 === 0 ? fmtHour(i * 2) : ''; });
        }
        else {
            vals = [];
            labels = [];
            for (var i = 0; i < 7; i++) {
                var dw = (ws + i) % 7;
                vals.push(c.weekdays[dw]);
                labels.push(D.weekdayName(dw, 'narrow'));
            }
        }
        peak = vals.indexOf(Math.max.apply(null, vals));
        var when = '<section class="card c-paper"><div class="card-head"><h3>' + esc(t('in.when')) + '</h3><div class="seg sm"><button data-shape="hours" aria-pressed="' + (shape === 'hours') + '">' + esc(t('in.hours')) + '</button><button data-shape="days" aria-pressed="' + (shape === 'days') + '">' + esc(t('in.days')) + '</button></div></div>' + bars(vals, labels, peak) + '<p class="meta">' + esc(t('in.last90')) + '</p></section>';
        // weekly history
        var wk = c.weeks.slice(-12), wmx = Math.max.apply(null, wk.map(function (x) { return Math.max(x.done, x.target); }).concat([1]));
        var weeks = '<section class="card c-paper"><div class="card-head"><h3>' + esc(t('in.weeks')) + '</h3><span class="meta">' + esc(t('in.weeks.won', { n: c.totals.weeksWon })) + '</span></div><div class="wbars">' + wk.map(function (x) { return '<div class="' + (x.met ? 'met' : '') + '" title="' + N(x.done) + ' / ' + N(x.target) + '"><i style="height:' + Math.max(4, Math.round(x.done / wmx * 100)) + '%"></i><em style="bottom:' + Math.round(x.target / wmx * 100) + '%"></em></div>'; }).join('') + '</div><div class="chart-x"><span>' + esc(D.fmtDate(HM.key(wk[0].w), { month: 'short', day: 'numeric' })) + '</span><span>' + esc(t('in.thisweek')) + '</span></div><p class="meta">' + esc(t('in.weeks.p')) + '</p></section>';
        // 26-week heat
        var w0 = HM.weekStart(today, ws), cells = '';
        for (var w = 0; w < 26; w++)
            for (var r = 0; r < 7; r++) {
                var dd = w0 - (25 - w) * 7 + r, day = c.days[dd];
                cells += dd > today ? '<i style="visibility:hidden"></i>' : '<i class="l' + (day ? day.level : 0) + '" title="' + esc(D.fmtDate(HM.key(dd), { month: 'short', day: 'numeric' })) + '"></i>';
            }
        var heat = '<section class="card c-paper wide-c"><div class="card-head"><h3>' + esc(t('in.heat')) + '</h3></div><div class="scroll-x"><div class="heat" style="--w:26">' + cells + '</div></div><div class="legend"><span>' + esc(t('in.less')) + '</span><i style="background:var(--h0)"></i><i style="background:var(--h1)"></i><i style="background:var(--h2)"></i><i style="background:var(--h3)"></i><i style="background:var(--h4)"></i><span>' + esc(t('in.more')) + '</span></div></section>';
        // the math
        var top = stats.slice().sort(function (a, b) { return b.st.strength - a.st.strength; })[0];
        var alpha = Math.pow(.5, 1 / 13), lv = c.xp;
        var math = '<section class="card c-paper wide-c mathcard"><div class="card-head"><h3>' + esc(t('in.math')) + '</h3></div><div class="mgrid">' +
            mrow(t('m.strength'), 's = s·a + c·(1−a)', 'a = 0.5^(√f / 13) → ' + N(Math.round(alpha * 1000) / 1000, 3), t('m.strength.p')) +
            mrow(t('m.rate'), 'Σ credit / scheduled days', t('m.rate.now', { v: D.pct(r30) }), t('m.rate.p')) +
            mrow(t('m.trend'), 'rate(28d) − rate(prev 28d)', '', t('m.trend.p')) +
            mrow(t('m.xp'), 'm = 1 + 0.5·(1 − e^(−s/21))', t('m.xp.now', { a: N(Math.round(HM.streakMultiplier(c.chain.cur) * 100) / 100, 2), n: c.chain.cur }), t('m.xp.p')) +
            mrow(t('m.level'), 'level = ⌊(1 + √(1 + xp/12.5)) / 2⌋', t('m.level.now', { xp: lv.total, l: lv.level, n: lv.toNext }), t('m.level.p')) +
            mrow(t('m.growth'), 'G ← G · (1 + 0.5% · completion)', N(Math.round(c.growth.length ? c.growth[c.growth.length - 1].g : 100) * 1) + '', t('m.growth.p')) +
            mrow(t('m.mood'), 'lift = mean(mood | done) − mean(mood | not)', 'r = Σ(x−x̄)(y−ȳ) / √(Σ(x−x̄)² Σ(y−ȳ)²)', t('m.mood.p')) + '</div></section>';
        function mrow(a, f, live, p) { return '<div class="mrow"><b>' + esc(a) + '</b><code dir="ltr">' + esc(f) + '</code>' + (live ? '<span class="live">' + esc(live) + '</span>' : '') + '<small>' + esc(p) + '</small></div>'; }
        root.innerHTML = '<header class="head"><div><h1>' + esc(t('in.title')) + '</h1><p class="sub">' + esc(t('in.sub')) + '</p></div></header>' + tiles + '<div class="igrid">' + growth + mood + ranking + when + weeks + heat + math + '</div>';
    }
    function bind(root) {
        root.addEventListener('click', function (e) {
            var s = e.target.closest('[data-shape]');
            if (s) {
                shape = s.dataset.shape;
                D.refresh();
                return;
            }
            var h = e.target.closest('[data-open-habit]');
            if (h)
                D.habits.openDetail(h.dataset.openHabit);
        });
    }
    D.insights = { render: render, bind: bind };
})();
