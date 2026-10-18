"use strict";
/*
  Daheer store: one state object, saved to disk (Electron) or localStorage (browser).
  Everything the maths shows is derived from this by HM.compute(), memoised per change.
*/
(function () {
    'use strict';
    var D = window.D, HM = window.HM, KEY = 'daheer-state-v3';
    var MAX_EVENTS = 5000;
    var native = window.daheerNative || null;
    function fresh() {
        var preferred = (navigator.language || 'en').slice(0, 2), lang = /^(en|ar|fr|es|zh|ja|ko)$/.test(preferred) ? preferred : 'en';
        return {
            v: 3,
            settings: { lang: lang, digits: lang === 'ar' ? 'arab' : 'latn', theme: 'auto', weekStart: 1, rule: 'one', sfx: true, celebrate: true, xpGoal: 40, focus: { focus: 25, short: 5, long: 15 }, goalMin: 120, sound: 'off', vol: 60, name: '', tz: '', clockFormat: 'auto' },
            meta: { workspace: '', sticky: '', onboarded: false, celebrated: {}, focusPage: null, lastPage: null, clock: 'ring', created: '' },
            habits: [], logs: {}, rest: {}, mood: {}, writeDays: {}, sessions: [], notes: [], board: { items: [] }, events: [],
            adventure: { rolls: 0, last: null, history: [], badHoursPerDay: null, plan: null }, achievements: {},
            tools: { stickies: [], mp4Url: '', mp4History: [], mp3Volume: 0.8, timerMinutes: 5 }
        };
    }
    function merge(base, x) {
        for (var k in x) {
            if (x[k] && typeof x[k] === 'object' && !Array.isArray(x[k]) && base[k] && typeof base[k] === 'object')
                merge(base[k], x[k]);
            else
                base[k] = x[k];
        }
        return base;
    }
    var S = fresh(), rev = 0, memo = null;
    function load(rawOverride) {
        var raw = null;
        if (arguments.length) {
            raw = rawOverride;
            S = fresh();
        }
        else
            try {
                raw = native ? native.load() : localStorage.getItem(KEY);
            }
            catch (e) { }
        if (raw) {
            try {
                S = merge(fresh(), JSON.parse(raw));
            }
            catch (e) {
                console.error('could not read saved data', e);
            }
        }
        if (!S.meta.created)
            S.meta.created = HM.key(today());
        if (!Array.isArray(S.events))
            S.events = [];
        if (!S.adventure || typeof S.adventure !== 'object' || Array.isArray(S.adventure))
            S.adventure = { rolls: 0, last: null, history: [], badHoursPerDay: null, plan: null };
        if (!Array.isArray(S.adventure.history))
            S.adventure.history = [];
        if (S.adventure.badHoursPerDay != null) {
            var advHours = Number(S.adventure.badHoursPerDay);
            S.adventure.badHoursPerDay = isFinite(advHours) ? Math.max(0, Math.min(24, advHours)) : null;
        }
        if (S.adventure.plan != null && (typeof S.adventure.plan !== 'object' || Array.isArray(S.adventure.plan)))
            S.adventure.plan = null;
        if (!S.achievements || typeof S.achievements !== 'object' || Array.isArray(S.achievements))
            S.achievements = {};
        if (!Array.isArray(S.habits))
            S.habits = [];
        if (!Array.isArray(S.notes))
            S.notes = [];
        if (!S.logs || typeof S.logs !== 'object' || Array.isArray(S.logs))
            S.logs = {};
        if (!S.tools || typeof S.tools !== 'object' || Array.isArray(S.tools))
            S.tools = { stickies: [], mp4Url: '', mp4History: [], mp3Volume: 0.8, timerMinutes: 5 };
        if (!Array.isArray(S.tools.stickies))
            S.tools.stickies = [];
        if (!Array.isArray(S.tools.mp4History))
            S.tools.mp4History = [];
        if (typeof S.tools.mp4Url !== 'string')
            S.tools.mp4Url = '';
        if (typeof S.tools.mp3Volume !== 'number' || !isFinite(S.tools.mp3Volume))
            S.tools.mp3Volume = 0.8;
        if (typeof S.tools.timerMinutes !== 'number' || !isFinite(S.tools.timerMinutes))
            S.tools.timerMinutes = 5;
        return S;
    }
    var saveSoon = D.debounce(function () { flush(); }, 350);
    function flush() {
        var raw = JSON.stringify(S);
        try {
            if (native)
                native.save(raw);
            else
                localStorage.setItem(KEY, raw);
        }
        catch (e) {
            console.error('save failed', e);
        }
    }
    window.addEventListener('beforeunload', function () { try {
        var raw = JSON.stringify(S);
        if (native && native.saveSync)
            native.saveSync(raw);
        else
            localStorage.setItem(KEY, raw);
    }
    catch (e) { } });
    function today() { return HM.fromDate(D.now()); }
    function cfg() { return { weekStart: S.settings.weekStart, rule: S.settings.rule }; }
    function comp() {
        var t = today();
        if (!memo || memo.rev !== rev || memo.t !== t)
            memo = { rev: rev, t: t, c: HM.compute(S, t, cfg()), mood: null };
        return memo.c;
    }
    function mood() { comp(); if (!memo.mood)
        memo.mood = HM.moodStats(S, memo.c, today()); return memo.mood; }
    // change something. meta.silent = do not re-render (used while typing)
    function mutate(fn, meta) { fn(S); rev++; memo = null; saveSoon(); D.emit('change', meta || {}); }
    function record(type, payload, meta) {
        var event = { id: D.uid('ev'), type: type, at: Date.now(), date: today() };
        if (payload != null)
            event.payload = payload;
        S.events = Array.isArray(S.events) ? S.events : [];
        S.events.push(event);
        if (S.events.length > MAX_EVENTS)
            S.events.splice(0, S.events.length - MAX_EVENTS);
        rev++;
        memo = null;
        saveSoon();
        return event;
    }
    function dayTick() {
        var t = today(), last = dayTick.last;
        dayTick.last = t;
        if (last != null && last !== t) {
            rev++;
            memo = null;
            D.emit('change', { day: true });
        }
    }
    setInterval(dayTick, 30000);
    dayTick();
    D.store = {
        get S() { return S; }, load: load, flush: flush, mutate: mutate, record: record, comp: comp, mood: mood, cfg: cfg, fresh: fresh,
        today: today, todayKey: function () { return HM.key(today()); },
        replace: function (obj) { S = merge(fresh(), obj); rev++; memo = null; flush(); D.emit('change', { replaced: true }); },
        reset: function () { S = fresh(); S.meta.created = HM.key(today()); rev++; memo = null; flush(); D.emit('change', { replaced: true }); },
        monthSheet: function (y, m) { return HM.monthSheet(S, comp(), y, m, today(), cfg()); },
        habit: function (id) { for (var i = 0; i < S.habits.length; i++)
            if (S.habits[i].id === id)
                return S.habits[i]; return null; },
        page: function (id) { for (var i = 0; i < S.notes.length; i++)
            if (S.notes[i].id === id)
                return S.notes[i]; return null; },
        activeHabits: function () { return S.habits.filter(function (h) { return !h.archived; }); },
        rev: function () { return rev; }
    };
})();
