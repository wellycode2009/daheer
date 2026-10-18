"use strict";
/* Daheer Adventure: first-run setup + 30-day habit commitment + weighted roulette. */
(function () {
    'use strict';
    var D = window.D, HM = window.HM, esc = D.esc, t = D.t, N = D.N, $ = D.$;
    var rolling = false, setupOpen = false;
    function A() {
        D.store.S.adventure = D.store.S.adventure || { rolls: 0, last: null, history: [], badHoursPerDay: null, plan: null };
        return D.store.S.adventure;
    }
    function today() { return D.store.today(); }
    function candidates() {
        return HM.adventurePool(D.store.S, D.store.comp(), today()).list;
    }
    function planForToday() {
        var a = A(), p = a.plan;
        if (!p || !p.habitId)
            return null;
        var prog = HM.adventureMonthProgress(D.store.S, p, today());
        if (!prog.active && !prog.completed)
            return null;
        var h = D.store.habit(p.habitId);
        return { plan: p, habit: h, progress: prog };
    }
    function recommendationForHabit(h) {
        return HM.recommendationById(h && h.id);
    }
    function skillFor(h) { return h && h._adventureSkill ? HM.adventureSkillById(h.id) : null; }
    function displayName(h) {
        var sk = skillFor(h);
        return sk ? t('ad.skill.' + sk.id) : (h && h._recommended ? t('sg.' + h.id) : (h ? h.name : ''));
    }
    function ensureHabitForAdventure(h) {
        var sk = skillFor(h);
        if (sk) {
            var existingSkill = null;
            (D.store.S.habits || []).some(function (x) { if (!x.archived && x.adventureSkillId === sk.id) {
                existingSkill = x;
                return true;
            } return false; });
            if (existingSkill)
                return existingSkill;
            var createdSkill = {
                id: D.uid('h'), name: t('ad.skill.' + sk.id), emoji: sk.emoji, kind: 'normal', sched: { type: 'daily' },
                created: D.store.todayKey(), archived: false, adventureAdded: true, adventureSkillId: sk.id,
                adventureDailyMinutes: sk.dailyMinutes, adventureMonthlyMinutes: sk.dailyMinutes * 30,
                adventureGoal: t('ad.skillGoal.' + sk.id), adventureReplacement: sk.replace
            };
            D.store.S.habits.push(createdSkill);
            return createdSkill;
        }
        var existing = D.store.habit(h.id);
        if (existing)
            return existing;
        var rec = recommendationForHabit(h), created = {
            id: D.uid('h'), name: rec ? t('sg.' + rec.id) : (h.name || h.id), emoji: (rec && rec.emoji) || h.emoji || '🌱',
            kind: (rec && rec.kind) || h.kind || 'normal', sched: { type: 'daily' }, created: D.store.todayKey(), archived: false, adventureAdded: true,
            adventureReplacement: (rec && rec.replace) || h.adventureReplacement || .5
        };
        if (rec && rec.kind === 'amount') {
            created.target = rec.target;
            created.unit = rec.unit;
            created.step = rec.step;
        }
        D.store.S.habits.push(created);
        return created;
    }
    function setupOverlay() {
        if (setupOpen)
            return;
        setupOpen = true;
        var overlay = document.createElement('div');
        overlay.className = 'ad-onboard';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = '<div class="ad-onboard-art"><div class="ad-onboard-orb"><span class="spark-four" aria-hidden="true"></span></div><div class="ad-onboard-stars"><i><span class="spark-four" aria-hidden="true"></span></i><i><span class="spark-four" aria-hidden="true"></span></i><i><span class="spark-four" aria-hidden="true"></span></i></div></div>' +
            '<div class="ad-onboard-copy"><p class="eyebrow">' + esc(t('ad.setup.kicker')) + '</p><h1>' + esc(t('ad.setup.title')) + '</h1><p class="ad-onboard-lead">' + esc(t('ad.setup.sub')) + '</p>' +
            '<div class="ad-onboard-rule"><span>1</span><p>' + esc(t('ad.setup.step1')) + '</p></div><div class="ad-onboard-rule"><span>2</span><p>' + esc(t('ad.setup.step2')) + '</p></div><div class="ad-onboard-rule"><span>3</span><p>' + esc(t('ad.setup.step3')) + '</p></div>' +
            '<form class="ad-onboard-form"><label class="fld"><span>' + esc(t('ad.setup.hours')) + '</span><div class="ad-hours-input"><input autofocus required type="number" min="0" max="24" step="0.5" inputmode="decimal" value="" placeholder="0"><span>' + esc(t('ad.setup.hoursUnit')) + '</span></div><small>' + esc(t('ad.setup.hoursHint')) + '</small></label><button class="btn btn-warm ad-setup-submit" type="submit">' + D.icon('compass') + esc(t('ad.setup.cta')) + '</button><p class="meta">' + esc(t('ad.setup.privacy')) + '</p></form></div>';
        document.body.appendChild(overlay);
        document.body.classList.add('ad-onboard-open');
        var input = overlay.querySelector('input');
        overlay.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            var n = Number(input.value);
            if (!isFinite(n) || n < 0 || n > 24) {
                input.setCustomValidity(t('ad.setup.invalid'));
                input.reportValidity();
                return;
            }
            n = Math.round(n * 2) / 2;
            D.store.mutate(function (S) { S.adventure = S.adventure || {}; S.adventure.badHoursPerDay = n; S.adventure.plan = null; }, { silent: true });
            D.store.record('adventure.setup', { badHoursPerDay: n }, { silent: true });
            overlay.classList.add('out');
            setTimeout(function () { overlay.remove(); setupOpen = false; document.body.classList.remove('ad-onboard-open'); D.refresh(); }, 220);
        });
        input.addEventListener('input', function () { input.setCustomValidity(''); });
        requestAnimationFrame(function () { overlay.classList.add('in'); input.focus(); });
    }
    function planHTML(info) {
        if (!info)
            return '';
        var h = info.habit, p = info.plan, g = info.progress, sk = p.skillId ? HM.adventureSkillById(p.skillId) : skillFor(h);
        var done = g.doneDays, days = g.days, remaining = g.remaining, daily = sk ? sk.dailyMinutes : (p.dailyMinutes || null), monthH = daily ? Math.round((daily * 30 / 60) * 10) / 10 : null, goal = sk ? t('ad.skillGoal.' + sk.id) : (p.goal || null);
        return '<section class="card c-matcha ad-month-card"><div class="ad-month-top"><div class="ad-month-badge">30</div><div><p class="eyebrow">' + esc(t('ad.month.kicker')) + '</p><h2>' + esc(h ? h.name : p.habitName) + '</h2><p class="meta">' + esc(t('ad.month.sub')) + '</p></div></div>' +
            '<div class="ad-month-meta">' + (daily ? '<span>' + esc(t('ad.skillMeta', { n: daily, h: monthH })) + '</span>' : '') + (goal ? '<span>' + esc(goal) + '</span>' : '') + '</div><div class="ad-month-progress"><div class="ad-month-progress-label"><span>' + esc(t('ad.month.progress')) + '</span><b>' + N(done) + ' / ' + N(days || 1) + '</b></div><div class="bar thick"><i style="width:' + Math.round(g.pct * 100) + '%"></i></div></div>' +
            '<div class="ad-month-foot"><span>' + esc(remaining > 0 ? t('ad.month.daysLeft', { n: remaining }) : t('ad.month.done')) + '</span><span>' + esc(t('ad.month.locked')) + '</span></div></section>';
    }
    function render(root) {
        var c = D.store.comp(), a = A(), bad = HM.badHabitLoad(D.store.S, today()), pool = HM.adventurePool(D.store.S, c, today()), current = planForToday();
        if (a.badHoursPerDay == null)
            setTimeout(setupOverlay, 0);
        var currentName = current && current.habit ? displayName(current.habit) : (a.plan ? a.plan.habitName : '');
        var chips = pool.list.map(function (x) { var h = x.h, name = displayName(h), sk = skillFor(h); return '<span class="ad-chip"><b>' + esc(h.emoji || '🌱') + ' ' + esc(name) + '</b>' + (sk ? '<small>' + esc(t('ad.skillMeta', { n: sk.dailyMinutes, h: Math.round(sk.dailyMinutes * 30 / 60 * 10) / 10 })) + '</small>' : '') + '</span>'; }).join('');
        var buttonDisabled = !pool.list.length || !!(current && current.progress.active) || rolling;
        var hours = a.badHoursPerDay == null ? '—' : N(a.badHoursPerDay);
        root.innerHTML = '<header class="head"><div><p class="eyebrow">' + esc(t('ad.kicker')) + '</p><h1>' + esc(t('ad.title')) + '</h1><p class="sub">' + esc(t('ad.sub')) + '</p></div><button class="btn btn-ghost sm" data-ad-settings>' + D.icon('box') + esc(t('ad.changeSetup')) + '</button></header>' +
            (current ? planHTML(current) : '') +
            '<div class="adventure-grid"><section class="card c-pine adventure-wheel"><div class="ad-orbit ' + (rolling ? 'rolling' : '') + '" data-wheel><div class="ad-wheel-ring"></div><div class="ad-core"><span class="spark-four" aria-hidden="true"></span><small>' + esc(rolling ? t('ad.rolling') : (current && current.progress.active) ? t('ad.month.locked') : t('ad.roll')) + '</small></div></div><div class="ad-slot" data-ad-current aria-live="polite">' + esc(currentName || t('ad.ready')) + '</div><button class="btn btn-warm ad-roll" data-ad-roll ' + (buttonDisabled ? 'disabled' : '') + '>' + D.icon('compass') + esc(current && current.progress.active ? t('ad.month.locked') : t('ad.rollButton')) + '</button><p class="meta ad-hint">' + esc(current && current.progress.active ? t('ad.month.hint') : t('ad.hint')) + '</p></section>' +
            '<section class="card c-paper bad-load"><div class="card-head"><div><h3>' + esc(t('ad.load')) + '</h3><p class="meta">' + esc(t('ad.loadSub')) + '</p></div><b class="ad-score">' + esc(hours) + ' ' + esc(t('ad.hoursPerDayShort')) + '</b></div><div class="ad-load-big"><b>' + N(Math.round(bad.minutes / 60 * 10) / 10) + '</b><span>' + esc(t('ad.weekHours')) + '</span></div><div class="bar thick"><i style="width:' + Math.round(bad.score * 100) + '%"></i></div><div class="ad-scale"><span>' + esc(t('ad.low')) + '</span><span>' + esc(t('ad.high')) + '</span></div><div class="ad-pool-label">' + esc(t('ad.pool')) + ' · ' + N(pool.list.length) + '</div><div class="ad-pool">' + chips + '</div><p class="meta">' + esc(t('ad.poolHint')) + '</p></section></div>';
    }
    function roll(root) {
        if (rolling)
            return;
        var a = A();
        if (a.badHoursPerDay == null) {
            setupOverlay();
            return;
        }
        var current = planForToday();
        if (current && current.progress.active) {
            D.ui.toast({ icon: 'calendar', title: t('ad.month.locked') });
            return;
        }
        var pool = HM.adventurePool(D.store.S, D.store.comp(), today());
        if (!pool.list.length) {
            D.ui.toast({ icon: 'sprout', title: t('ad.none') });
            return;
        }
        rolling = true;
        var result = HM.adventurePick(D.store.S, D.store.comp(), today(), String(Date.now()));
        if (!result) {
            rolling = false;
            return;
        }
        var slot = $('[data-ad-current]', root), btn = $('[data-ad-roll]', root), names = result.poolNames.map(function (id) { var sk = HM.adventureSkillById(id); return sk ? t('ad.skill.' + sk.id) : id; }), i = 0, ticks = 0, totalTicks = 34;
        if (btn)
            btn.disabled = true;
        if (slot) {
            var winnerName = result.skill ? t('ad.skill.' + result.skill.id) : (result.virtual ? t('sg.' + result.habit.id) : result.habit.name);
            var sequence = [];
            while (sequence.length < totalTicks)
                sequence = sequence.concat(names);
            sequence = sequence.slice(0, totalTicks);
            sequence.push(winnerName);
            slot.innerHTML = '<div class="ad-reel">' + sequence.map(function (name) { return '<div class="ad-reel-item">' + esc(name) + '</div>'; }).join('') + '</div>';
            slot.classList.add('rolling');
            var reel = slot.querySelector('.ad-reel');
            var step = slot.clientHeight || 54;
            if (reel) {
                reel.style.setProperty('--ad-step', step + 'px');
                reel.style.transform = 'translateY(0)';
                reel.style.transition = 'none';
            }
        }
        var timer = setInterval(function () {
            if (!slot) {
                clearInterval(timer);
                rolling = false;
                return;
            }
            i++;
            ticks++;
            var reel = slot.querySelector('.ad-reel');
            if (reel) {
                var step = slot.clientHeight || 54;
                reel.style.transition = 'transform ' + (ticks > totalTicks - 8 ? '0.18s cubic-bezier(.2,.7,.2,1)' : '0.075s linear');
                reel.style.transform = 'translateY(-' + (ticks * step) + 'px)';
            }
            if (ticks >= totalTicks) {
                clearInterval(timer);
                var finalReel = slot.querySelector('.ad-reel');
                if (finalReel) {
                    var finalStep = slot.clientHeight || 54;
                    finalReel.style.transition = 'transform .34s cubic-bezier(.16,1,.3,1)';
                    finalReel.style.transform = 'translateY(-' + (totalTicks * finalStep) + 'px)';
                }
                setTimeout(function () {
                    slot.textContent = winnerName;
                    slot.classList.remove('rolling');
                    var chosen = ensureHabitForAdventure(result.habit), start = today(), end = start + 29, rec = result.virtual ? recommendationForHabit(result.habit) : null, skill = result.skill || skillFor(result.habit);
                    var chosenName = skill ? t('ad.skill.' + skill.id) : chosen.name;
                    D.store.mutate(function (S) {
                        S.adventure = S.adventure || { rolls: 0, last: null, history: [], badHoursPerDay: null, plan: null };
                        S.adventure.rolls = (S.adventure.rolls || 0) + 1;
                        S.adventure.last = chosen.id;
                        S.adventure.plan = { habitId: chosen.id, habitName: chosenName, startDay: start, endDay: end, badHoursPerDay: S.adventure.badHoursPerDay, createdAt: Date.now(), skillId: skill ? skill.id : null, dailyMinutes: skill ? skill.dailyMinutes : null, goal: skill ? t('ad.skillGoal.' + skill.id) : null };
                        S.adventure.history = Array.isArray(S.adventure.history) ? S.adventure.history : [];
                        S.adventure.history.unshift({ at: Date.now(), habitId: chosen.id, badMinutes: result.load.minutes, pool: result.pool, virtual: result.virtual });
                        S.adventure.history = S.adventure.history.slice(0, 30);
                        if (rec && chosen.adventureAdded)
                            chosen.adventureFocusUntil = end;
                    }, { silent: true });
                    D.store.record('adventure.month_started', { habitId: chosen.id, startDay: start, endDay: end, badHoursPerDay: a.badHoursPerDay, pool: result.pool }, { silent: true });
                    rolling = false;
                    D.refresh();
                    D.ui.toast({ icon: 'compass', title: t('ad.month.started'), text: t('ad.month.toast', { name: chosenName }) });
                }, 260);
            }
        }, 72);
    }
    function bind(root) {
        if (root.dataset.adBound)
            return;
        root.dataset.adBound = '1';
        root.addEventListener('click', function (e) {
            var b = e.target.closest('[data-ad-roll]');
            if (b) {
                roll(root);
                return;
            }
            var s = e.target.closest('[data-ad-settings]');
            if (s) {
                setupOverlay();
            }
        });
    }
    D.adventure = { render: render, bind: bind, setup: setupOverlay };
})();
