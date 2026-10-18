"use strict";
/* Daheer achievement system: 25 total milestones, 5 live in v1. */
(function () {
    'use strict';
    var D = window.D, HM = window.HM, t = D.t, esc = D.esc, N = D.N;
    var meta = {
        first_habit: ['ac.first', 'sprout'], chain_3: ['ac.chain3', 'flame'], chain_7: ['ac.chain7', 'flame'], perfect_7: ['ac.perfect7', 'gift'], xp_100: ['ac.xp100', 'chart'],
        chain_14: ['ac.chain14', 'flame'], chain_30: ['ac.chain30', 'flame'], chain_66: ['ac.chain66', 'flame'], perfect_14: ['ac.perfect14', 'gift'], checkins_25: ['ac.check25', 'check'], checkins_100: ['ac.check100', 'check'],
        focus_300: ['ac.focus300', 'timer'], focus_1500: ['ac.focus1500', 'timer'], writer_10: ['ac.writer10', 'notes'], lvl_5: ['ac.lvl5', 'sprout'], lvl_10: ['ac.lvl10', 'sprout'], mood_7: ['ac.mood7', 'smile'], rest_wise: ['ac.rest', 'leaf'], all_rounder: ['ac.round', 'sprout'], balanced_week: ['ac.week', 'chart'], early: ['ac.early', 'sun'], night_owl: ['ac.owl', 'moon'], comeback: ['ac.comeback', 'reset'], habit_1st_month: ['ac.month', 'calendar'], xp_1000: ['ac.xp1000', 'gift']
    };
    function render(root) {
        var S = D.store.S, c = D.store.comp(), items = HM.achievementList(c, S.achievements), active = items.filter(function (x) { return x.active; }), earned = items.filter(function (x) { return x.earned; });
        var cards = items.map(function (a) { var m = meta[a.id] || ['ac.locked', 'lock']; return '<article class="achievement-card ' + (a.earned ? 'earned ' : '') + (a.active ? '' : 'inactive') + '"><div class="ac-icon">' + D.icon(m[1]) + '</div><div class="ac-copy"><b>' + esc(t(m[0])) + '</b><p>' + esc(t(m[0] + '.d')) + '</p></div><span class="ac-state">' + esc(a.earned ? t('ac.earned') : a.active ? t('ac.live') : t('ac.soon')) + '</span></article>'; }).join('');
        root.innerHTML = '<header class="head"><div><h1>' + esc(t('ac.title')) + '</h1><p class="sub">' + esc(t('ac.sub')) + '</p></div><div class="ac-summary"><b>' + N(earned.length) + '</b><span>/ ' + N(items.length) + ' ' + esc(t('ac.total')) + '</span></div></header><section class="card c-lamp ac-hero"><div><span class="meta">' + esc(t('ac.liveTitle')) + '</span><h2>' + N(earned.filter(function (x) { return x.active; }).length) + ' / ' + N(active.length) + '</h2><p class="meta">' + esc(t('ac.liveSub')) + '</p></div><div class="bar thick"><i style="width:' + Math.round((earned.filter(function (x) { return x.active; }).length / Math.max(1, active.length)) * 100) + '%"></i></div></section><div class="achievement-grid">' + cards + '</div>';
    }
    D.achievements = { render: render, refresh: function () { if (window.D.go)
            D.refresh(); } };
})();
