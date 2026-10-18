"use strict";
/*
  Daheer Tools
  ---------------------------------------------------------------
  A small launcher grid (D.go('tools')) plus seven light tools that live
  entirely in this module: Calculator (opens the existing D.calc dialog),
  Sticky Notes (a loose corkboard, separate from the Notes/whiteboard),
  an MP3 player (playlist built from local files), a URL/file video player,
  a Calendar (month view that flags perfect-habit days and due notes),
  Time (clock + stopwatch + countdown timer) and a PDF reader (local file,
  shown through the browser's own PDF viewer).

  Playback state (current playlist, video element, live timers) is kept in
  plain module variables, never in the store, so re-rendering the view never
  interrupts something that is playing. Only small preferences (volume, the
  last video URL, sticky note text/colour, timer length) are persisted.
*/
(function () {
    'use strict';
    var D = window.D, HM = window.HM, t = D.t, N = D.N, esc = D.esc, icon = D.icon, $ = D.$, $$ = D.$$;
    var ST = function () { return D.store.S; };
    /* ---------------- shared little helpers ---------------- */
    function pad2(n) { n = Math.floor(n); return (n < 10 ? '0' : '') + n; }
    function fmtTrackTime(sec) { sec = Math.max(0, Math.floor(sec || 0)); return D.digits(Math.floor(sec / 60) + ':' + pad2(sec % 60)); }
    function fmtStopwatch(ms) { ms = Math.max(0, ms || 0); var cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000); return D.digits(pad2(m) + ':' + pad2(s) + '.' + pad2(cs)); }
    var STICKY_COLORS = ['lamp', 'matcha', 'mist', 'pine', 'paper'];
    var TOOL_LIST = ['calc', 'sticky', 'mp3', 'mp4', 'calendar', 'clock', 'pdf'];
    var TOOL_ICON = { calc: 'calc', sticky: 'sticky', mp3: 'music', mp4: 'video', calendar: 'calendar', clock: 'clock', pdf: 'pdf' };
    /* ---------------- module state ---------------- */
    var sub = 'grid', mountedRoot = null, initedFromStore = false;
    var calSel = null, calNoteMap = {};
    var clockTab = 'clock', clockTimerHandle = null;
    var stopwatch = { running: false, elapsedMs: 0, startTs: 0, laps: [] };
    var timer = { running: false, remainingMs: 0, totalMs: 0, endTs: 0 };
    var mp3State = { tracks: [], idx: -1 };
    var mp3Audio = new Audio();
    mp3Audio.preload = 'metadata';
    var mp4Video = document.createElement('video');
    mp4Video.controls = true;
    mp4Video.playsInline = true;
    mp4Video.className = 'mp4-el';
    var mp4HasSrc = false, pdfObjectUrl = null, pdfName = '';
    function ensureInit() {
        if (initedFromStore)
            return;
        initedFromStore = true;
        var s = ST().tools || {};
        if (s.mp4Url) {
            mp4Video.src = s.mp4Url;
            mp4HasSrc = true;
        }
        mp3Audio.volume = (s.mp3Volume != null ? s.mp3Volume : 0.8);
    }
    function leaveSub() { if (sub === 'mp3') {
        try {
            mp3Audio.pause();
        }
        catch (e) { }
    } if (sub === 'mp4') {
        try {
            mp4Video.pause();
        }
        catch (e) { }
    } }
    function paint() { if (mountedRoot)
        render(mountedRoot); }
    /* ================= grid (overview) ================= */
    function gridHTML() {
        return '<div class="tools-grid">' + TOOL_LIST.map(function (id) {
            return '<button class="tool-card" data-tool="' + id + '"><span class="tool-ic">' + icon(TOOL_ICON[id]) + '</span><b>' + esc(t('tools.' + id + '.title')) + '</b><small>' + esc(t('tools.' + id + '.desc')) + '</small></button>';
        }).join('') + '</div>';
    }
    /* ================= sticky notes ================= */
    function stickyHTML() {
        var list = ST().tools.stickies || [];
        var cards = list.map(function (s) {
            var color = s.color || 'lamp';
            return '<div class="sticky-card c-' + esc(color) + '" data-sticky-id="' + esc(s.id) + '">' +
                '<button class="ib sm sticky-del" data-sticky-del="' + esc(s.id) + '" aria-label="' + esc(t('sticky.remove')) + '">' + icon('x') + '</button>' +
                '<p class="hand" contenteditable="plaintext-only" spellcheck="false" data-sticky-text="' + esc(s.id) + '" data-ph="' + esc(t('sticky.placeholder')) + '" dir="auto">' + esc(s.text || '') + '</p>' +
                '<div class="sticky-colors">' + STICKY_COLORS.map(function (c) { return '<button class="swatch sw-' + c + (c === color ? ' on' : '') + '" data-sticky-color="' + esc(s.id) + ':' + c + '" aria-label="' + esc(t('sticky.color')) + '"></button>'; }).join('') + '</div></div>';
        }).join('');
        return (list.length ? '' : '<p class="meta">' + esc(t('sticky.empty')) + '</p>') +
            '<div class="sticky-board">' + cards + '<button class="sticky-add" data-sticky-add>' + icon('plus') + '<span>' + esc(t('sticky.add')) + '</span></button></div>';
    }
    function addSticky() {
        D.store.mutate(function (S) { S.tools.stickies.push({ id: D.uid('sk'), text: '', color: STICKY_COLORS[S.tools.stickies.length % STICKY_COLORS.length] }); });
    }
    function removeSticky(id) {
        var snap = (ST().tools.stickies || []).filter(function (s) { return s.id === id; })[0];
        D.store.mutate(function (S) { S.tools.stickies = S.tools.stickies.filter(function (s) { return s.id !== id; }); });
        if (snap)
            D.ui.toast({ icon: 'trash', title: t('sticky.remove'), action: { label: t('common.undo'), fn: function () { D.store.mutate(function (S) { S.tools.stickies.push(snap); }); } } });
    }
    function setStickyColor(id, color) { D.store.mutate(function (S) { var s = S.tools.stickies.filter(function (x) { return x.id === id; })[0]; if (s)
        s.color = color; }); }
    function setStickyText(id, text) { D.store.mutate(function (S) { var s = S.tools.stickies.filter(function (x) { return x.id === id; })[0]; if (s)
        s.text = text; }, { silent: true }); }
    /* ================= mp3 player ================= */
    function mp3HTML() {
        var tr = mp3State.tracks, cur = mp3State.idx;
        var list = tr.length ? '<ul class="mp3-list" data-mp3-list>' + tr.map(function (x, i) {
            return '<li class="' + (i === cur ? 'on' : '') + '" data-mp3-play="' + i + '"><span class="i">' + icon('music') + '</span><span class="mp3-name">' + esc(x.name) + '</span><button class="ib sm" data-mp3-remove="' + i + '" aria-label="' + esc(t('mp3.remove')) + '">' + icon('x') + '</button></li>';
        }).join('') + '</ul>' : '<p class="meta">' + esc(t('mp3.empty')) + '</p>';
        var nowName = (cur >= 0 && tr[cur]) ? tr[cur].name : t('mp3.none');
        return '<section class="card c-lamp mp3-tool">' +
            '<div class="mp3-now"><span class="i">' + icon('music') + '</span><div><small>' + esc(t('mp3.nowplaying')) + '</small><b data-mp3-title>' + esc(nowName) + '</b></div></div>' +
            '<div class="mp3-seek-row" dir="ltr"><span data-mp3-cur>0:00</span><input type="range" min="0" max="100" value="0" step="0.1" data-mp3-seek><span data-mp3-dur>0:00</span></div>' +
            '<div class="mp3-controls"><button class="ib" data-mp3="prev" aria-label="' + esc(t('mp3.prev')) + '">' + icon('chev-l', 'mir') + '</button>' +
            '<button class="ib lg" data-mp3="playpause" data-mp3-playbtn aria-label="' + esc(t('mp3.play')) + '">' + icon(mp3Audio.paused ? 'play' : 'pause', mp3Audio.paused ? 'i-fill' : '') + '</button>' +
            '<button class="ib" data-mp3="next" aria-label="' + esc(t('mp3.next')) + '">' + icon('chev-r', 'mir') + '</button>' +
            '<span class="mp3-vol">' + icon('volume') + '<input type="range" min="0" max="100" value="' + Math.round((ST().tools.mp3Volume != null ? ST().tools.mp3Volume : 0.8) * 100) + '" data-mp3-vol aria-label="' + esc(t('mp3.volume')) + '"></span></div>' +
            '<label class="btn btn-ghost sm mp3-choose"><input type="file" accept="audio/*" multiple data-mp3-file hidden>' + icon('plus') + esc(t('mp3.choose')) + '</label>' +
            '<h4 class="sub-h">' + esc(t('mp3.playlist')) + '</h4>' + list +
            '</section>';
    }
    function addMp3Files(files) {
        var wasEmpty = !mp3State.tracks.length;
        Array.prototype.slice.call(files || []).forEach(function (f) { mp3State.tracks.push({ name: f.name, url: URL.createObjectURL(f) }); });
        if (wasEmpty && mp3State.tracks.length)
            mp3Load(0, true);
        else
            paint();
    }
    function mp3Load(idx, autoplay) {
        if (!mp3State.tracks[idx])
            return;
        mp3State.idx = idx;
        mp3Audio.src = mp3State.tracks[idx].url;
        mp3Audio.load();
        if (autoplay !== false)
            mp3Audio.play().catch(function () { });
        paint();
    }
    function mp3Next() { if (!mp3State.tracks.length)
        return; mp3Load((mp3State.idx + 1) % mp3State.tracks.length, true); }
    function mp3Prev() { if (!mp3State.tracks.length)
        return; mp3Load((mp3State.idx - 1 + mp3State.tracks.length) % mp3State.tracks.length, true); }
    function mp3Remove(idx) {
        var wasCurrent = idx === mp3State.idx;
        mp3State.tracks.splice(idx, 1);
        if (!mp3State.tracks.length) {
            mp3State.idx = -1;
            mp3Audio.pause();
            mp3Audio.removeAttribute('src');
        }
        else if (wasCurrent)
            mp3Load(Math.min(idx, mp3State.tracks.length - 1), true);
        else {
            if (idx < mp3State.idx)
                mp3State.idx--;
            paint();
        }
    }
    function mp3Action(a) {
        if (a === 'playpause') {
            if (!mp3State.tracks.length)
                return;
            if (mp3State.idx < 0)
                return mp3Load(0, true);
            if (mp3Audio.paused)
                mp3Audio.play().catch(function () { });
            else
                mp3Audio.pause();
        }
        else if (a === 'prev')
            mp3Prev();
        else if (a === 'next')
            mp3Next();
    }
    function updateMp3Progress() {
        if (!mountedRoot || sub !== 'mp3')
            return;
        var dur = mp3Audio.duration || 0, cur = mp3Audio.currentTime || 0;
        var seek = $('[data-mp3-seek]', mountedRoot);
        if (seek && dur && document.activeElement !== seek)
            seek.value = (cur / dur * 100).toFixed(1);
        var curEl = $('[data-mp3-cur]', mountedRoot);
        if (curEl)
            curEl.textContent = fmtTrackTime(cur);
        var durEl = $('[data-mp3-dur]', mountedRoot);
        if (durEl)
            durEl.textContent = fmtTrackTime(dur);
    }
    function updateMp3PlayButton() {
        if (!mountedRoot || sub !== 'mp3')
            return;
        var b = $('[data-mp3-playbtn]', mountedRoot);
        if (!b)
            return;
        b.innerHTML = icon(mp3Audio.paused ? 'play' : 'pause', mp3Audio.paused ? 'i-fill' : '');
        b.setAttribute('aria-label', t(mp3Audio.paused ? 'mp3.play' : 'mp3.pause'));
    }
    mp3Audio.addEventListener('timeupdate', updateMp3Progress);
    mp3Audio.addEventListener('loadedmetadata', updateMp3Progress);
    mp3Audio.addEventListener('play', updateMp3PlayButton);
    mp3Audio.addEventListener('pause', updateMp3PlayButton);
    mp3Audio.addEventListener('ended', mp3Next);
    /* ================= video (url / file) player ================= */
    function mp4HTML() {
        var S = ST(), hist = S.tools.mp4History || [];
        var histHTML = hist.length ? '<div class="mp4-recent"><h4 class="sub-h">' + esc(t('mp4.recent')) + '</h4><div class="chips">' + hist.map(function (u) {
            return '<button class="chip sm" data-mp4-use="' + esc(u) + '" title="' + esc(u) + '">' + esc(u.length > 34 ? u.slice(0, 31) + '…' : u) + '</button>';
        }).join('') + '</div></div>' : '';
        return '<section class="card c-paper mp4-tool">' +
            '<label class="fld"><span>' + esc(t('mp4.label')) + '</span><div class="mp4-inputrow"><input class="inp" type="url" data-mp4-url placeholder="' + esc(t('mp4.placeholder')) + '" value="' + esc(S.tools.mp4Url || '') + '" dir="ltr"><button class="btn" data-mp4="load">' + esc(t('mp4.load')) + '</button></div></label>' +
            '<p class="meta">' + esc(t('mp4.hint')) + '</p>' +
            '<div class="row2"><span class="meta">' + esc(t('mp4.orfile')) + '</span><label class="btn btn-ghost sm"><input type="file" accept="video/*" data-mp4-file hidden>' + icon('plus') + esc(t('mp4.choose')) + '</label></div>' +
            histHTML +
            '<div class="mp4-slot" data-mp4-slot>' + (mp4HasSrc ? '' : '<p class="meta mp4-empty">' + esc(t('mp4.empty')) + '</p>') + '</div>' +
            '</section>';
    }
    function attachVideoToSlot(root) {
        var slot = $('[data-mp4-slot]', root);
        if (!slot)
            return;
        slot.innerHTML = '';
        slot.appendChild(mp4Video);
    }
    function loadMp4(url) {
        url = (url || '').trim();
        if (!url)
            return;
        mp4Video.src = url;
        mp4Video.load();
        mp4Video.play().catch(function () { });
        mp4HasSrc = true;
        D.store.mutate(function (S) { S.tools.mp4Url = url; S.tools.mp4History = [url].concat((S.tools.mp4History || []).filter(function (x) { return x !== url; })).slice(0, 6); }, { silent: true });
        paint();
    }
    /* ================= calendar ================= */
    function calendarHTML() {
        if (!calSel) {
            var td = D.now();
            calSel = { y: td.getFullYear(), m: td.getMonth() };
        }
        var ws = ST().settings.weekStart || 0;
        var first = HM.fromDate(new Date(calSel.y, calSel.m, 1));
        var daysInMonth = new Date(calSel.y, calSel.m + 1, 0).getDate();
        var lead = (HM.dow(first) - ws + 7) % 7;
        var todayIdx = D.store.today(), c = D.store.comp();
        calNoteMap = {};
        ST().notes.forEach(function (p) { if (!p.archived && p.due)
            calNoteMap[p.due] = p.id; });
        var wdHead = '';
        for (var w = 0; w < 7; w++)
            wdHead += '<span>' + esc(D.weekdayName((ws + w) % 7, 'narrow')) + '</span>';
        var cells = '';
        for (var i = 0; i < lead; i++)
            cells += '<i class="cal-cell empty"></i>';
        for (var day = 1; day <= daysInMonth; day++) {
            var d = first + (day - 1), key = HM.key(d), isToday = d === todayIdx;
            var dayC = c.days[d], allDone = dayC && dayC.perfect, due = calNoteMap[key];
            cells += '<button class="cal-cell' + (isToday ? ' today' : '') + (due ? ' has-due' : '') + '" data-cal-day="' + key + '"' + (isToday ? ' aria-current="date"' : '') + '><span class="cal-n">' + N(day) + '</span>' +
                (allDone ? '<i class="dot dot-habit" title="' + esc(t('cal.legend.habit')) + '"></i>' : '') + (due ? '<i class="dot dot-due" title="' + esc(t('cal.legend.due')) + '"></i>' : '') + '</button>';
        }
        return '<section class="card c-paper cal-tool"><div class="ms-h"><div class="ms-nav"><button class="ib" data-cal-nav="-1" aria-label="' + esc(t('common.prev')) + '">' + icon('chev-l', 'mir') + '</button><h3>' + esc(D.fmtDate(new Date(calSel.y, calSel.m, 1), { month: 'long', year: 'numeric' })) + '</h3><button class="ib" data-cal-nav="1" aria-label="' + esc(t('common.next')) + '">' + icon('chev-r', 'mir') + '</button></div><button class="btn btn-ghost sm" data-cal-today>' + esc(t('cal.today')) + '</button></div>' +
            '<div class="cal-wd">' + wdHead + '</div><div class="cal-grid">' + cells + '</div>' +
            '<div class="cal-legend"><span><i class="dot dot-habit"></i>' + esc(t('cal.legend.habit')) + '</span><span><i class="dot dot-due"></i>' + esc(t('cal.legend.due')) + '</span></div></section>';
    }
    function calNav(delta) { if (!calSel)
        return; calSel.m += delta; if (calSel.m < 0) {
        calSel.m = 11;
        calSel.y--;
    } if (calSel.m > 11) {
        calSel.m = 0;
        calSel.y++;
    } paint(); }
    function calDayClick(key) { var pid = calNoteMap[key]; if (pid)
        D.notes.open(pid); }
    /* ================= time: clock / stopwatch / timer ================= */
    function liveClockText() { var d = D.now(), tp = D.tz.timeParts(d); return D.digits(tp.hour + ':' + tp.min + ':' + pad2(d.getSeconds())) + (tp.ap ? ' ' + tp.ap : ''); }
    function clockPaneHTML() { return '<section class="card c-pine clock-face"><div class="clock-time" data-clock-live dir="ltr">' + liveClockText() + '</div><div class="clock-date" data-clock-date>' + esc(D.fmtDate(D.now(), { weekday: 'long', month: 'long', day: 'numeric' })) + '</div></section>'; }
    function swElapsedNow() { return stopwatch.running ? stopwatch.elapsedMs + (Date.now() - stopwatch.startTs) : stopwatch.elapsedMs; }
    function stopwatchHTML() {
        var laps = stopwatch.laps.map(function (l, i) { return '<li><span>' + esc(t('clock.lap')) + ' ' + N(stopwatch.laps.length - i) + '</span><b dir="ltr">' + fmtStopwatch(l) + '</b></li>'; }).join('');
        return '<section class="card c-lamp clock-face"><div class="clock-time" data-sw-live dir="ltr">' + fmtStopwatch(swElapsedNow()) + '</div>' +
            '<div class="clock-actions"><button class="btn ' + (stopwatch.running ? '' : 'btn-warm') + '" data-sw="' + (stopwatch.running ? 'pause' : 'start') + '">' + icon(stopwatch.running ? 'pause' : 'play', stopwatch.running ? '' : 'i-fill') + esc(t(stopwatch.running ? 'clock.pause' : 'clock.start')) + '</button>' +
            '<button class="btn btn-ghost" data-sw="lap"' + (stopwatch.running ? '' : ' disabled') + '>' + esc(t('clock.lap')) + '</button>' +
            '<button class="btn btn-ghost" data-sw="reset">' + esc(t('clock.reset')) + '</button></div>' +
            (laps ? '<ol class="laps" data-sw-laps>' + laps + '</ol>' : '') + '</section>';
    }
    function timerRemainingNow() { return timer.running ? Math.max(0, timer.endTs - Date.now()) : (timer.remainingMs || 0); }
    function timerHTML() {
        var mins = ST().tools.timerMinutes || 5, ms = timerRemainingNow(), pct = timer.totalMs ? D.clamp(ms / timer.totalMs, 0, 1) : 0;
        var setup = (!timer.running && !timer.totalMs) ? '<label class="fld"><span>' + esc(t('clock.timerlabel')) + '</span><input class="inp" type="number" min="1" max="180" step="1" data-tm-mins value="' + mins + '"></label>' : '';
        var mainBtn = timer.running ? '<button class="btn" data-tm="pause">' + icon('pause') + esc(t('clock.pause')) + '</button>' :
            (timer.totalMs ? '<button class="btn btn-warm" data-tm="start">' + icon('play', 'i-fill') + esc(t('clock.start')) + '</button>' : '<button class="btn btn-warm" data-tm="set">' + icon('check') + esc(t('clock.timerset')) + '</button>');
        return '<section class="card c-mist clock-face"><div class="clock-time" data-tm-live dir="ltr">' + fmtStopwatch(ms) + '</div>' + setup +
            '<div class="bar thick"><i style="width:' + Math.round(pct * 100) + '%"></i></div>' +
            '<div class="clock-actions">' + mainBtn + '<button class="btn btn-ghost" data-tm="reset">' + esc(t('clock.reset')) + '</button></div></section>';
    }
    function clockHTML() {
        var tabs = ['clock', 'stopwatch', 'timer'].map(function (k) { return '<button data-clocktab="' + k + '" aria-pressed="' + (clockTab === k) + '">' + esc(t('clock.tab.' + k)) + '</button>'; }).join('');
        var pane = clockTab === 'stopwatch' ? stopwatchHTML() : clockTab === 'timer' ? timerHTML() : clockPaneHTML();
        return '<div class="seg wide clock-tabs">' + tabs + '</div><div class="clock-pane">' + pane + '</div>';
    }
    function swAction(a) {
        if (a === 'start') {
            stopwatch.running = true;
            stopwatch.startTs = Date.now();
        }
        else if (a === 'pause') {
            stopwatch.elapsedMs = swElapsedNow();
            stopwatch.running = false;
        }
        else if (a === 'lap') {
            if (stopwatch.running)
                stopwatch.laps.unshift(swElapsedNow());
        }
        else if (a === 'reset') {
            stopwatch.running = false;
            stopwatch.elapsedMs = 0;
            stopwatch.laps = [];
        }
        paint();
    }
    function tmAction(a) {
        if (a === 'set') {
            var input = $('[data-tm-mins]', mountedRoot), mins = input ? Math.max(1, Math.min(180, Math.round(+input.value || 5))) : 5;
            timer.totalMs = mins * 60000;
            timer.remainingMs = timer.totalMs;
            timer.running = false;
            D.store.mutate(function (S) { S.tools.timerMinutes = mins; }, { silent: true });
        }
        else if (a === 'start') {
            if (!timer.totalMs)
                return;
            timer.running = true;
            timer.endTs = Date.now() + (timer.remainingMs || timer.totalMs);
        }
        else if (a === 'pause') {
            timer.remainingMs = timerRemainingNow();
            timer.running = false;
        }
        else if (a === 'reset') {
            timer.running = false;
            timer.totalMs = 0;
            timer.remainingMs = 0;
        }
        paint();
    }
    function ensureClockTimer() { if (!clockTimerHandle)
        clockTimerHandle = setInterval(tick, 200); }
    function stopClockTimer() { if (clockTimerHandle) {
        clearInterval(clockTimerHandle);
        clockTimerHandle = null;
    } }
    function tick() {
        if (!mountedRoot || !mountedRoot.isConnected || sub !== 'clock') {
            stopClockTimer();
            return;
        }
        if (timer.running && timerRemainingNow() <= 0) {
            timer.running = false;
            timer.totalMs = 0;
            timer.remainingMs = 0;
            D.sfx('chime');
            D.ui.toast({ icon: 'timer', title: t('clock.timerdone') });
            paint();
            return;
        }
        if (clockTab === 'clock') {
            var el = $('[data-clock-live]', mountedRoot);
            if (el)
                el.textContent = liveClockText();
        }
        else if (clockTab === 'stopwatch') {
            var sw = $('[data-sw-live]', mountedRoot);
            if (sw)
                sw.textContent = fmtStopwatch(swElapsedNow());
        }
        else if (clockTab === 'timer') {
            var tm = $('[data-tm-live]', mountedRoot);
            if (tm)
                tm.textContent = fmtStopwatch(timerRemainingNow());
            var bar = $('.tool-clock .bar i', mountedRoot);
            if (bar && timer.totalMs)
                bar.style.width = Math.round(D.clamp(timerRemainingNow() / timer.totalMs, 0, 1) * 100) + '%';
        }
    }
    /* ================= pdf reader ================= */
    function pdfHTML() {
        return '<section class="card c-paper pdf-tool">' +
            '<label class="btn btn-ghost sm"><input type="file" accept="application/pdf,.pdf" data-pdf-file hidden>' + icon('plus') + esc(t('pdf.choose')) + '</label>' +
            (pdfObjectUrl ? '<p class="meta pdf-name">' + esc(t('pdf.openTitle')) + ': <b>' + esc(pdfName) + '</b></p><iframe class="pdf-frame" src="' + esc(pdfObjectUrl) + '" title="PDF"></iframe>' : '<p class="meta">' + esc(t('pdf.empty')) + '</p>') +
            '<p class="meta small">' + esc(t('pdf.fallback')) + '</p></section>';
    }
    function openPdf(file) { if (pdfObjectUrl)
        URL.revokeObjectURL(pdfObjectUrl); pdfObjectUrl = URL.createObjectURL(file); pdfName = file.name; paint(); }
    /* ================= shell: render / bind ================= */
    function render(root) {
        ensureInit();
        mountedRoot = root;
        var back = sub !== 'grid' ? '<button class="btn btn-ghost sm" data-tool-back>' + icon('chev-l', 'mir') + esc(t('common.back')) + '</button>' : '';
        var head = '<header class="head"><div><h1>' + esc(t('tools.title')) + '</h1><p class="sub">' + esc(sub === 'grid' ? t('tools.sub') : t('tools.' + sub + '.desc')) + '</p></div>' + back + '</header>';
        var body = sub === 'sticky' ? stickyHTML() : sub === 'mp3' ? mp3HTML() : sub === 'mp4' ? mp4HTML() : sub === 'calendar' ? calendarHTML() : sub === 'clock' ? clockHTML() : sub === 'pdf' ? pdfHTML() : gridHTML();
        root.innerHTML = head + '<div class="tools-body tool-' + sub + '">' + body + '</div>';
        if (sub === 'mp4' && mp4HasSrc)
            attachVideoToSlot(root);
        if (sub === 'clock')
            ensureClockTimer();
        else
            stopClockTimer();
    }
    function bind(root) {
        if (root.dataset.toolsBound)
            return;
        root.dataset.toolsBound = '1';
        root.addEventListener('click', function (e) {
            var card = e.target.closest('[data-tool]');
            if (card) {
                var id = card.dataset.tool;
                if (id === 'calc')
                    return D.calc.open();
                leaveSub();
                sub = id;
                return paint();
            }
            if (e.target.closest('[data-tool-back]')) {
                leaveSub();
                sub = 'grid';
                return paint();
            }
            var sadd = e.target.closest('[data-sticky-add]');
            if (sadd)
                return addSticky();
            var sdel = e.target.closest('[data-sticky-del]');
            if (sdel)
                return removeSticky(sdel.dataset.stickyDel);
            var scol = e.target.closest('[data-sticky-color]');
            if (scol) {
                var parts = scol.dataset.stickyColor.split(':');
                return setStickyColor(parts[0], parts[1]);
            }
            var mp3b = e.target.closest('[data-mp3]');
            if (mp3b)
                return mp3Action(mp3b.dataset.mp3);
            var mp3li = e.target.closest('[data-mp3-play]');
            if (mp3li)
                return mp3Load(+mp3li.dataset.mp3Play, true);
            var mp3rm = e.target.closest('[data-mp3-remove]');
            if (mp3rm)
                return mp3Remove(+mp3rm.dataset.mp3Remove);
            var mload = e.target.closest('[data-mp4="load"]');
            if (mload) {
                var input = $('[data-mp4-url]', root);
                return loadMp4(input ? input.value : '');
            }
            var muse = e.target.closest('[data-mp4-use]');
            if (muse)
                return loadMp4(muse.dataset.mp4Use);
            var cnav = e.target.closest('[data-cal-nav]');
            if (cnav)
                return calNav(+cnav.dataset.calNav);
            if (e.target.closest('[data-cal-today]')) {
                calSel = null;
                return paint();
            }
            var cday = e.target.closest('[data-cal-day]');
            if (cday)
                return calDayClick(cday.dataset.calDay);
            var ctab = e.target.closest('[data-clocktab]');
            if (ctab) {
                clockTab = ctab.dataset.clocktab;
                return paint();
            }
            var sw = e.target.closest('[data-sw]:not([disabled])');
            if (sw)
                return swAction(sw.dataset.sw);
            var tm = e.target.closest('[data-tm]');
            if (tm)
                return tmAction(tm.dataset.tm);
        });
        root.addEventListener('input', function (e) {
            if (e.target.matches('[data-sticky-text]'))
                setStickyText(e.target.dataset.stickyText, e.target.textContent);
            else if (e.target.matches('[data-mp3-vol]')) {
                var v = +e.target.value / 100;
                mp3Audio.volume = v;
                D.store.mutate(function (S) { S.tools.mp3Volume = v; }, { silent: true });
            }
            else if (e.target.matches('[data-mp3-seek]')) {
                if (mp3Audio.duration)
                    mp3Audio.currentTime = (+e.target.value / 100) * mp3Audio.duration;
            }
        });
        root.addEventListener('change', function (e) {
            if (e.target.matches('[data-mp3-file]')) {
                addMp3Files(e.target.files);
                e.target.value = '';
            }
            else if (e.target.matches('[data-mp4-file]')) {
                var f = e.target.files[0];
                if (f) {
                    if (/^blob:/.test(mp4Video.src))
                        URL.revokeObjectURL(mp4Video.src);
                    mp4Video.src = URL.createObjectURL(f);
                    mp4Video.load();
                    mp4HasSrc = true;
                    mp4Video.play().catch(function () { });
                    attachVideoToSlot(root);
                }
                e.target.value = '';
            }
            else if (e.target.matches('[data-pdf-file]')) {
                var pf = e.target.files[0];
                if (pf)
                    openPdf(pf);
                e.target.value = '';
            }
        });
        root.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('[data-mp4-url]')) {
            e.preventDefault();
            loadMp4(e.target.value);
        } });
    }
    D.tools = {
        suspend: function () { try {
            mp3Audio.pause();
        }
        catch (e) { } try {
            mp4Video.pause();
        }
        catch (e) { } stopClockTimer(); }
    };
    D.tools.render = function (root) { bind(root); render(root); };
    D.tools.bind = bind;
})();
