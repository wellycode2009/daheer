"use strict";
/*
  Daheer game layer
  ---------------------------------------------------------------
  Every action (check a habit, log a mood, finish a focus session) calls
  D.game.after(before, after, meta) with the computed maths from just before
  and just after. Anything that is newly true gets celebrated, once:

    the day's first check-in  -> "day complete" screen: animated flame counter + week strip
    level up                  -> the plant grows a stage
    streak milestones         -> 7, 14, 30, 66, 100 ... (per habit and for the whole chain)
    rest leaf earned, perfect day, lucky bloom, quests, weekly challenge, badges

  The tone is deliberately warm: rewards for showing up, never scolding for missing.
  What has already been celebrated is remembered in meta.celebrated so nothing repeats.
*/
(function () {
    'use strict';
    var D = window.D, HM = window.HM, t = D.t, N = D.N, esc = D.esc, icon = D.icon;
    var queue = Promise.resolve();
    var CH_MS = [3, 7, 14, 21, 30, 50, 66, 100, 150, 200, 365, 500, 1000];
    function cel(k) { return !!D.store.S.meta.celebrated[k]; }
    function mark(k) { D.store.mutate(function (S) { S.meta.celebrated[k] = 1; }, { silent: true }); }
    function enqueue(fn) { queue = queue.then(fn).catch(function (e) { console.error(e); }); return queue; }
    function crossed(list, a, b) { for (var i = 0; i < list.length; i++)
        if (a < list[i] && b >= list[i])
            return list[i]; return 0; }
    var MSGS = 5;
    function pickMsg(seed) { return 1 + (HM.hash(String(seed)) % MSGS); }
    function dayModal(o) {
        var n = o.chain, first = n === 1;
        var lines = o.lines.map(function (l) { return '<li>' + (l.icon ? '<span>' + l.icon + '</span>' : '') + esc(l.text) + '</li>'; }).join('');
        var html = '<div class="cel">' +
            '<div class="cel-flame"><span class="cel-glow"></span>' + icon('flame', 'i-fill') + '<b data-count>' + N(Math.max(0, n - 1)) + '</b></div>' +
            '<h2>' + esc(o.title) + '</h2><p class="cel-msg">' + esc(o.msg) + '</p>' + D.habits.weekStripHTML() +
            (lines ? '<ul class="cel-lines">' + lines + '</ul>' : '') +
            '<div class="cel-xp"><span class="xpchip big">+' + N(o.xp) + ' XP</span><span class="meta">' + esc(t('cel.today')) + '</span></div></div>';
        return D.ui.dialog({
            html: html, cls: 'celebrate', close: true, enter: false,
            actions: [{ label: t('common.continue'), kind: 'warm', value: true }],
            onOpen: function (box) {
                var c = box.querySelector('[data-count]');
                setTimeout(function () { D.fx.countUp(c, Math.max(0, n - 1), n, 700); box.querySelector('.cel-flame').classList.add('lit'); D.sfx(o.big ? 'level' : 'chime'); var r = box.querySelector('.cel-flame').getBoundingClientRect(); D.fx.burst(r.left + r.width / 2, r.top + r.height / 2, o.big ? 46 : 30); if (o.big)
                    D.fx.shower(); }, 280);
            }
        });
    }
    function levelModal(lv, stage) {
        return D.ui.dialog({
            html: '<div class="cel lvl"><div class="lvl-art">' + D.plantSVG(stage) + '</div><span class="lvbig">' + esc(t('hb.lvl', { n: lv })) + '</span><h2>' + esc(t('lv.' + stage)) + '</h2><p class="cel-msg">' + esc(t('cel.level')) + '</p></div>',
            cls: 'celebrate', close: true, enter: false, actions: [{ label: t('common.continue'), kind: 'warm', value: true }],
            onOpen: function (box) { setTimeout(function () { D.sfx('level'); var r = box.querySelector('.lvl-art').getBoundingClientRect(); D.fx.burst(r.left + r.width / 2, r.top + r.height / 3, 40); D.fx.shower(); }, 250); }
        });
    }
    D.game = {
        after: function (before, after, meta) {
            meta = meta || {};
            var S = D.store.S, today = D.store.today(), tk = HM.key(today);
            var gain = after.xp.total - before.xp.total;
            // instant feedback: the XP number floats up from the thing you touched
            if (meta.el && gain > 0) {
                var g = (after.xp.gainsToday || []).filter(function (x) { return x.id === meta.habitId; })[0];
                D.fx.floatText(meta.el, '+' + N(gain) + ' XP', g && g.lucky ? 'lucky' : '');
                if (g && g.lucky && !meta.wasDone)
                    D.ui.toast({ emoji: '🍀', title: t('g.lucky'), text: t('g.lucky.p'), tone: 'lamp', ms: 3200 });
                else if (g && g.combo >= 3 && !meta.wasDone)
                    D.ui.toast({ icon: 'sprout', title: t('g.combo', { n: g.combo }), ms: 2200 });
            }
            if (meta.el && meta.habitId && D.fx && after.habits[meta.habitId] && after.habits[meta.habitId].doneToday && !meta.wasDone)
                D.fx.burstAt(meta.el, 10);
            if (!S.settings.celebrate)
                return;
            var lines = [], big = false, hasDay = false, small = [];
            var dnew = after.days[today], dold = before.days[today];
            // 1. streak milestones for the habit you just did
            if (meta.habitId && after.habits[meta.habitId] && before.habits[meta.habitId]) {
                var a = before.habits[meta.habitId].streak, b = after.habits[meta.habitId].streak, m = crossed(HM.MILESTONES, a, b), h = D.store.habit(meta.habitId);
                if (m && h && !cel('ms:' + h.id + ':' + m)) {
                    mark('ms:' + h.id + ':' + m);
                    lines.push({ icon: '🏅', text: t(after.habits[meta.habitId].weekly ? 'g.ms.w' : 'g.ms', { name: h.name, n: m }) });
                    if (m >= 30)
                        big = true;
                }
            }
            // 2. the whole chain
            var cm = crossed(CH_MS, before.chain.cur, after.chain.cur);
            if (cm && !cel('chain:' + cm)) {
                mark('chain:' + cm);
                lines.push({ icon: '🔥', text: t('g.chain', { n: cm }) });
                if (cm >= 14)
                    big = true;
            }
            // 3. a rest leaf earned
            if (after.chain.leavesEarned > before.chain.leavesEarned && !cel('leaf:' + after.chain.litTotal)) {
                mark('leaf:' + after.chain.litTotal);
                lines.push({ icon: '🍃', text: t('g.leaf') });
            }
            // 4. perfect day
            if (dnew && dnew.perfect && !(dold && dold.perfect) && dnew.due >= 1 && !cel('perfect:' + tk)) {
                mark('perfect:' + tk);
                lines.push({ icon: '✨', text: t('g.perfect') });
            }
            // 5. weekly challenge
            if (after.week.met && !before.week.met && !cel('week:' + after.week.w)) {
                mark('week:' + after.week.w);
                lines.push({ icon: '🎯', text: t('g.week', { n: after.week.bonus }) });
            }
            // 6. quests
            (after.quests || []).forEach(function (q, i) { var o = before.quests && before.quests[i]; if (q.done && o && !o.done)
                small.push({ icon: 'check', title: t('g.quest'), text: '+' + N(q.xp) + ' XP' }); });
            if (after.chest && after.chest.done && before.chest && !before.chest.done && !cel('chest:' + tk)) {
                mark('chest:' + tk);
                lines.push({ icon: '🎁', text: t('g.chest', { n: after.chest.xp }) });
                big = big || false;
            }
            // 7. day complete (the streak screen)
            if (after.chain.todayLit && !before.chain.todayLit && !cel('day:' + tk)) {
                mark('day:' + tk);
                hasDay = true;
                var n = after.chain.cur, title = n === 1 ? t('cel.first') : t('cel.streak', { n: n });
                enqueue(function () { return dayModal({ chain: n, title: title, msg: t('cel.msg.' + pickMsg(tk)), lines: lines, xp: after.xp.today, big: big }); });
            }
            else if (lines.length) {
                lines.forEach(function (l) { small.push({ emoji: l.icon, title: l.text }); });
                if (big)
                    D.fx.shower();
                else if (meta.el)
                    D.fx.burstAt(meta.el, 22);
                D.sfx('chime');
            }
            small.forEach(function (s) { D.ui.toast({ icon: s.icon, emoji: s.emoji, title: s.title, text: s.text, tone: 'lamp', ms: 3600 }); });
            // 8. level up (after the day screen)
            if (after.xp.level > before.xp.level && !cel('level:' + after.xp.level)) {
                mark('level:' + after.xp.level);
                var lv = after.xp.level, st = after.xp.stage;
                enqueue(function () { return levelModal(lv, st); });
            }
            // 9. badges
            var newB = after.badges.filter(function (b) { return b.earned && !cel('badge:' + b.id); });
            newB.forEach(function (b, i) { mark('badge:' + b.id); if (i < 2)
                enqueue(function () { return D.sleep(hasDay ? 600 : 900).then(function () { D.ui.toast({ emoji: D.badgeIcon(b.id), title: t('g.badge', { name: t('bd.' + b.id) }), text: t('bd.' + b.id + '.d'), tone: 'lamp', ms: 4600 }); D.sfx('coin'); }); }); });
        }
    };
})();
