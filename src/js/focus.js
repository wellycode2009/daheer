"use strict";
/* Daheer focus: timer (timestamp based), ambience sounds, rain overlay, Focus view */
(function () {
    'use strict';
    var D = window.D, HM = window.HM, t = D.t, N = D.N, esc = D.esc, icon = D.icon, $ = D.$;
    /* ---------- timer state (lives outside the view, so it keeps running) ---------- */
    var T = { mode: 'focus', total: 25 * 60, left: 25 * 60, endAt: 0, running: false, timer: 0 };
    var baseTitle = '';
    function lens() { return D.store.S.settings.focus; }
    function lenOf(mode) { return (lens()[mode] || 25) * 60; }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function clockText(s) { return D.digits(pad2(Math.floor(s / 60)) + ':' + pad2(s % 60)); }
    function setMode(mode, keepRunning) {
        if (!keepRunning)
            stop(true);
        T.mode = mode;
        T.total = lenOf(mode);
        T.left = T.total;
        paint();
        syncTitle();
    }
    function tick() {
        var left = Math.max(0, Math.ceil((T.endAt - Date.now()) / 1000));
        if (left !== T.left) {
            T.left = left;
            paint();
            syncTitle();
        }
        if (left <= 0)
            complete();
    }
    function start() {
        if (T.running)
            return;
        D.audio.ctx();
        T.running = true;
        T.endAt = Date.now() + T.left * 1000;
        T.timer = setInterval(tick, 250);
        paint(true);
        syncTitle();
    }
    function pause() { if (!T.running)
        return; tick(); T.running = false; clearInterval(T.timer); paint(true); syncTitle(); }
    function stop(silent) { T.running = false; clearInterval(T.timer); T.left = T.total = lenOf(T.mode); if (!silent)
        paint(true); syncTitle(); }
    function complete() {
        clearInterval(T.timer);
        T.running = false;
        var mode = T.mode, mins = Math.round(T.total / 60), S = D.store.S;
        if (mode === 'focus') {
            var before = D.store.comp(), pg = D.notes.focusPage();
            D.store.mutate(function (S2) { S2.sessions.push({ date: D.store.todayKey(), t: D.now().getHours() * 60 + D.now().getMinutes(), min: mins, mode: 'focus', pageId: pg ? pg.id : null }); });
            D.store.record('focus.complete', { minutes: mins, pageId: pg ? pg.id : null });
            var after = D.store.comp(), gain = after.xp.total - before.xp.total;
            D.sfx('done');
            D.ui.toast({ icon: 'timer', title: t('f.done', { n: mins }), text: gain > 0 ? '+' + N(gain) + ' XP' : '', tone: 'lamp', ms: 5000 });
            D.game.after(before, after, { focus: true });
        }
        else {
            D.sfx('chime');
            D.ui.toast({ icon: 'leaf', title: t('f.breakover') });
        }
        try {
            new Notification(t('app.title'), { body: mode === 'focus' ? t('f.done', { n: mins }) : t('f.breakover'), silent: true });
        }
        catch (e) { }
        T.mode = mode === 'focus' ? 'short' : 'focus';
        T.total = T.left = lenOf(T.mode);
        paint(true);
        syncTitle();
    }
    function syncTitle() {
        if (!baseTitle)
            baseTitle = document.title;
        document.title = T.running ? clockText(T.left) + ' · ' + t(T.mode === 'focus' ? 'f.focus.l' : 'f.break.l') : t('app.title');
    }
    /* ---------- view ---------- */
    var root = null;
    function clockHTML() {
        var st = D.store.S.meta.clock || 'ring', txt = clockText(T.left), p = T.total ? 1 - T.left / T.total : 0;
        if (st === 'flip') {
            var m = pad2(Math.floor(T.left / 60)), s = pad2(T.left % 60);
            return '<div class="flip" dir="ltr">' + [m[0], m[1]].map(function (x) { return '<span class="tile">' + D.digits(x) + '</span>'; }).join('') + '<b>:</b>' + [s[0], s[1]].map(function (x) { return '<span class="tile">' + D.digits(x) + '</span>'; }).join('') + '</div>';
        }
        if (st === 'dots') {
            var n = Math.min(60, Math.max(1, Math.round(T.total / 60))), done = Math.floor(p * n), dots = '';
            for (var i = 0; i < n; i++)
                dots += '<i class="' + (i < done ? 'on' : i === done && T.running ? 'now' : '') + '"></i>';
            return '<div class="dotclock"><div class="grid">' + dots + '</div><div class="dg" dir="ltr">' + txt + '</div></div>';
        }
        var C = 2 * Math.PI * 108;
        return '<div class="ringbox"><svg viewBox="0 0 240 240" aria-hidden="true"><circle class="trk" cx="120" cy="120" r="108"/><circle class="prg" cx="120" cy="120" r="108" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - p)).toFixed(1) + '" transform="rotate(-90 120 120)"/></svg><div class="dg" dir="ltr">' + txt + '</div></div>';
    }
    function paint(full) {
        if (!root || !root.isConnected || !root.querySelector('#clock'))
            return;
        var st = D.store.S.meta.clock || 'ring';
        if (full || st !== 'ring')
            $('#clock', root).innerHTML = clockHTML();
        else {
            var dg = $('.dg', root), pr = $('.prg', root);
            if (dg)
                dg.textContent = clockText(T.left);
            if (pr) {
                var C = 2 * Math.PI * 108;
                pr.style.strokeDashoffset = (C * (T.total ? T.left / T.total : 1)).toFixed(1);
            }
        }
        var pb = $('[data-f="toggle"]', root);
        if (pb) {
            pb.innerHTML = icon(T.running ? 'pause' : 'play', 'i-fill') + esc(T.running ? t('f.pause') : (T.left < T.total ? t('f.resume') : t('f.start')));
        }
        $$('[data-fmode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fmode === T.mode)); });
        var lab = $('.clocklabel', root);
        if (lab)
            lab.textContent = t(T.mode === 'focus' ? 'f.focus.l' : 'f.break.l');
        var ln = $('[data-len]', root);
        if (ln)
            ln.textContent = t('u.min', { n: Math.round(T.total / 60) });
    }
    var $$ = D.$$;
    function todaySessions() { var k = D.store.todayKey(); return D.store.S.sessions.filter(function (s) { return s.date === k && (s.mode || 'focus') === 'focus'; }).sort(function (a, b) { return (b.t || 0) - (a.t || 0); }); }
    function render(r) {
        root = r;
        var S = D.store.S, ss = todaySessions(), mins = ss.reduce(function (a, s) { return a + s.min; }, 0), goal = S.settings.goalMin, xp = D.store.comp().xp;
        var pages = S.notes.map(function (p) { return '<option value="' + esc(p.id) + '"' + (S.meta.focusPage === p.id ? ' selected' : '') + '>' + esc(p.title || t('n.untitled')) + '</option>'; }).join('');
        var hist = ss.length ? '<div class="hist">' + ss.map(function (s) { var pg = s.pageId && D.store.page(s.pageId); return '<div><span>' + esc(D.fmtTime(s.t || 0)) + ' · ' + esc(pg ? (pg.title || t('n.untitled')) : t('f.nopage')) + '</span><span>' + esc(t('u.min', { n: s.min })) + '</span></div>'; }).join('') + '</div>' : '<p class="meta">' + esc(t('f.hist.empty')) + '</p>';
        var styles = ['ring', 'flip', 'dots'].map(function (k) { return '<button data-fstyle="' + k + '" aria-pressed="' + ((S.meta.clock || 'ring') === k) + '">' + esc(t('f.style.' + k)) + '</button>'; }).join('');
        r.innerHTML = '<header class="head"><div><h1>' + esc(t('f.title')) + '</h1><p class="sub">' + esc(t('f.sub')) + '</p></div></header>' +
            '<div class="focus"><article class="card c-pine scene-card"><div class="art" data-scene>' + D.scene('f', xp.stage) + '</div></article>' +
            '<div class="fpanel"><article class="card c-paper clockwrap"><div class="row" style="width:100%"><div class="seg">' + ['focus', 'short', 'long'].map(function (k) { return '<button data-fmode="' + k + '" aria-pressed="' + (T.mode === k) + '">' + esc(t('f.m.' + k)) + '</button>'; }).join('') + '</div><div class="seg">' + styles + '</div></div>' +
            '<div class="card-in"><div id="clock"></div><div class="clocklabel"></div></div>' +
            '<div class="row center"><button class="btn" data-f="toggle"></button><button class="btn btn-ghost" data-f="reset">' + icon('reset') + esc(t('f.reset')) + '</button></div>' +
            '<div class="lenrow"><button class="ib" data-f="dec" aria-label="−">−</button><b data-len></b><button class="ib" data-f="inc" aria-label="+">+</button></div>' +
            '<label class="fld linkpg"><span>' + esc(t('f.link')) + '</span><select class="inp" data-f="page"><option value="">' + esc(t('f.nopage')) + '</option>' + pages + '</select></label></article>' +
            '<div class="fgrid"><article class="card c-matcha"><div class="card-head"><h3>' + esc(t('f.today')) + '</h3><span class="meta">' + esc(D.dur(mins)) + ' / ' + esc(D.dur(goal)) + '</span></div><div class="bar thick"><i style="width:' + Math.round(D.clamp(mins / goal, 0, 1) * 100) + '%"></i></div><p class="meta" style="margin-top:8px">' + esc(t('f.xp')) + '</p></article>' +
            '<article class="card c-paper"><div class="card-head"><h3>' + esc(t('d.amb')) + '</h3></div>' + D.focus.ambienceHTML() + '<input type="range" min="0" max="100" value="' + S.settings.vol + '" data-vol aria-label="' + esc(t('snd.vol')) + '"></article>' +
            '<article class="card c-paper wide"><div class="card-head"><h3>' + esc(t('f.sessions')) + '</h3></div>' + hist + '</article></div></div></div>';
        paint(true);
        paintSound();
    }
    function bind(r) {
        r.addEventListener('click', function (e) {
            var b = e.target.closest('button');
            if (!b)
                return;
            if (b.dataset.fmode)
                return setMode(b.dataset.fmode);
            if (b.dataset.fstyle) {
                D.store.mutate(function (S) { S.meta.clock = b.dataset.fstyle; }, { silent: true });
                $$('[data-fstyle]', r).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
                return paint(true);
            }
            var a = b.dataset.f;
            if (a === 'toggle')
                T.running ? pause() : start();
            else if (a === 'reset')
                stop();
            else if (a === 'inc' || a === 'dec') {
                if (T.running)
                    return;
                var v = D.clamp(Math.round(T.total / 60) + (a === 'inc' ? 5 : -5), 5, 180);
                D.store.mutate(function (S) { S.settings.focus[T.mode] = v; }, { silent: true });
                setMode(T.mode);
            }
        });
        r.addEventListener('change', function (e) { if (e.target.matches('[data-f=page]'))
            D.store.mutate(function (S) { S.meta.focusPage = e.target.value || null; }, { silent: true }); });
    }
    /* ---------- ambience sounds ---------- */
    var nodes = [], sound = 'off', master = null, soundAudio = null;
    function mctx() { var c = D.audio.ctx(); if (!c)
        return null; if (!master) {
        master = c.createGain();
        master.gain.value = D.store.S.settings.vol / 100;
        master.connect(c.destination);
    } return c; }
    function noiseBuf(c, type) {
        var len = c.sampleRate * 3, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0), last = 0, i;
        for (i = 0; i < len; i++) {
            var w = Math.random() * 2 - 1;
            if (type === 'brown') {
                last = (last + 0.02 * w) / 1.02;
                d[i] = last * 3.5;
            }
            else
                d[i] = w;
        }
        return b;
    }
    var timers = [];
    /* ---- helpers for the synthesized ambience (all generated in the browser; no audio files) ---- */
    function src(c, type) { var s = c.createBufferSource(); s.buffer = noiseBuf(c, type); s.loop = true; nodes.push(s); return s; }
    function filt(c, type, freq, q, gainV, dest) {
        var f = c.createBiquadFilter(), g = c.createGain();
        f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gainV;
        f.connect(g); g.connect(dest); nodes.push(f, g);
        return { input: f, gain: g };
    }
    function wobble(c, rate, depth, param) { // slow swell on a gain, so the noise breathes
        var o = c.createOscillator(), g = c.createGain();
        o.frequency.value = rate; g.gain.value = depth;
        o.connect(g); g.connect(param); o.start(); nodes.push(o, g);
    }
    function cafe(c) {
        var room = src(c, 'brown'), r = filt(c, 'lowpass', 700, .5, .45, master);
        room.connect(r.input); room.start();
        var murmur = src(c, 'white'), m = filt(c, 'bandpass', 900, .7, .1, master);
        murmur.connect(m.input); wobble(c, .25, .05, m.gain.gain); murmur.start();
        var tick = function () { // a cup or a spoon now and then
            if (sound !== 'cafe')
                return;
            var now = c.currentTime, o = c.createOscillator(), g = c.createGain();
            o.type = 'sine'; o.frequency.value = 2200 + Math.random() * 1800;
            g.gain.setValueAtTime(.0001, now);
            g.gain.exponentialRampToValueAtTime(.05, now + .004);
            g.gain.exponentialRampToValueAtTime(.0001, now + .12);
            o.connect(g); g.connect(master); o.start(now); o.stop(now + .13);
            timers.push(setTimeout(tick, 900 + Math.random() * 2600));
        };
        timers.push(setTimeout(tick, 400));
    }
    function stream(c) {
        var rumble = src(c, 'brown'), r = filt(c, 'lowpass', 260, .6, .5, master);
        rumble.connect(r.input); rumble.start();
        var water = src(c, 'white'), w = filt(c, 'bandpass', 1400, .5, .12, master);
        water.connect(w.input); wobble(c, .4, .05, w.gain.gain); water.start();
        var fizz = src(c, 'white'), h = filt(c, 'highpass', 3200, .7, .025, master);
        fizz.connect(h.input); wobble(c, .7, .012, h.gain.gain); fizz.start();
    }
    /* short sounds at random moments: a drop, a crackle, a chirp */
    function scatter(kind, every, fire1) {
        var tick = function () {
            if (sound !== kind)
                return;
            fire1(audioCtx());
            timers.push(setTimeout(tick, every()));
        };
        timers.push(setTimeout(tick, 200));
    }
    function audioCtx() { return master ? master.context : null; }
    function rain(c) {
        var hiss = src(c, 'white'), h = filt(c, 'bandpass', 3000, .4, .08, master);
        hiss.connect(h.input); wobble(c, .2, .02, h.gain.gain); hiss.start();
        scatter('rain', function () { return 60 + Math.random() * 300; }, function (ctx) {
            var now = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = 1400 + Math.random() * 1200;
            g.gain.setValueAtTime(.0001, now);
            g.gain.exponentialRampToValueAtTime(.045, now + .003);
            g.gain.exponentialRampToValueAtTime(.0001, now + .09);
            o.connect(g); g.connect(master); o.start(now); o.stop(now + .1);
        });
    }
    function fire(c) {
        var low = src(c, 'brown'), lp = filt(c, 'lowpass', 350, .6, .35, master);
        low.connect(lp.input); low.start();
        scatter('fire', function () { return 80 + Math.random() * (Math.random() < .15 ? 900 : 380); }, function (ctx) {
            var now = ctx.currentTime, len = Math.floor(ctx.sampleRate * .03), buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0), i;
            for (i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
            var s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
            s.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 1200; g.gain.value = .25 + Math.random() * .2;
            s.connect(hp); hp.connect(g); g.connect(master); s.start(now);
        });
    }
    function birds(c) {
        var n = 0;
        scatter('birds', function () { return 1200 + Math.random() * 3800; }, function (ctx) {
            var burst = 2 + Math.floor(Math.random() * 3), base = 2400 + Math.random() * 1000, k;
            for (k = 0; k < burst; k++) {
                (function (at, f0) {
                    var o = ctx.createOscillator(), g = ctx.createGain();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(f0, at);
                    o.frequency.exponentialRampToValueAtTime(f0 * 1.35, at + .05);
                    o.frequency.exponentialRampToValueAtTime(f0 * .95, at + .11);
                    g.gain.setValueAtTime(.0001, at);
                    g.gain.exponentialRampToValueAtTime(.035, at + .01);
                    g.gain.exponentialRampToValueAtTime(.0001, at + .12);
                    o.connect(g); g.connect(master); o.start(at); o.stop(at + .13);
                })(ctx.currentTime + k * .16, base + k * 60);
            }
        });
    }
    /* ---- your own sounds: stored in your state (kept small so they save everywhere) ---- */
    function playCustom(id) {
        var list = D.store.S.settings.customSounds || [], s = list.filter(function (x) { return x.id === id; })[0];
        if (!s)
            return;
        soundAudio = new Audio(s.dataUrl);
        soundAudio.loop = true;
        soundAudio.volume = D.store.S.settings.vol / 100;
        soundAudio.play().catch(function () { D.ui.toast({ icon: 'volume', title: t('snd.playError') }); });
    }
    function pickCustom() {
        var list = D.store.S.settings.customSounds || [];
        if (list.length >= 6) {
            D.ui.toast({ icon: 'x', title: t('snd.full') });
            return;
        }
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.onchange = function () {
            var f = input.files && input.files[0];
            if (!f)
                return;
            if (f.size > 2.5 * 1024 * 1024) {
                D.ui.toast({ icon: 'x', title: t('snd.big') });
                return;
            }
            var reader = new FileReader();
            reader.onload = function () {
                D.store.mutate(function (S) {
                    S.settings.customSounds = (S.settings.customSounds || []).concat([{ id: Date.now().toString(36), name: f.name.replace(/\.[^.]+$/, ''), dataUrl: reader.result }]);
                });
                D.refresh();
            };
            reader.readAsDataURL(f);
        };
        input.click();
    }
    function removeCustom(id) {
        if (sound === 'custom:' + id) {
            sound = 'off';
            stopSound();
        }
        D.store.mutate(function (S) { S.settings.customSounds = (S.settings.customSounds || []).filter(function (x) { return x.id !== id; }); });
        D.refresh();
    }
    /* the ambience row: icons only (the names live in aria-labels for screen readers) */
    function ambienceHTML() {
        var custom = D.store.S.settings.customSounds || [];
        var base = [['cafe', 'coffee'], ['stream', 'droplet'], ['brown', 'wind'], ['pad', 'wave'], ['rain', 'cloudrain'], ['fire', 'flame'], ['birds', 'feather']];
        var html = base.map(function (b) {
            return '<button class="chip icon-chip" data-sound="' + b[0] + '" aria-pressed="false" aria-label="' + esc(t('snd.' + b[0])) + '">' + D.icon(b[1]) + '</button>';
        }).join('');
        html += custom.map(function (c) {
            return '<span class="chip-own"><button class="chip icon-chip" data-sound="custom:' + esc(c.id) + '" aria-pressed="false" aria-label="' + esc(c.name) + '">' + D.icon('music') + '</button>' +
                '<button class="ib sm" data-del-sound="' + esc(c.id) + '" aria-label="' + esc(t('common.delete')) + '">' + D.icon('x') + '</button></span>';
        }).join('');
        html += '<button class="chip icon-chip add" data-add-sound aria-label="' + esc(t('snd.add')) + '">' + D.icon('plus') + '</button>';
        return '<div class="chips icons">' + html + '</div>';
    }
    function stopSound() {
        timers.forEach(function (id) { clearTimeout(id); });
        timers = [];
        nodes.forEach(function (n) { try {
            if (n.stop)
                n.stop();
        }
        catch (e) { } try {
            n.disconnect();
        }
        catch (e) { } });
        nodes = [];
        if (soundAudio) {
            soundAudio.pause();
            soundAudio.currentTime = 0;
            soundAudio = null;
        }
    }
    function startSound(kind) {
        if (kind.indexOf('custom:') === 0) {
            playCustom(kind.slice(7));
            return;
        }
        var c = mctx();
        if (!c)
            return;
        try {
            if (kind === 'brown') {
                var src = c.createBufferSource();
                src.buffer = noiseBuf(c, 'brown');
                src.loop = true;
                var f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain();
                f1.type = 'lowpass';
                f1.frequency.value = 500;
                f2.type = 'lowpass';
                f2.frequency.value = 400;
                g.gain.value = .9;
                src.connect(f1);
                f1.connect(f2);
                f2.connect(g);
                g.connect(master);
                src.start();
                nodes.push(src, f1, f2, g);
            }
            else if (kind === 'cafe') {
                cafe(c);
            }
            else if (kind === 'stream') {
                stream(c);
            }
            else if (kind === 'rain') {
                rain(c);
            }
            else if (kind === 'fire') {
                fire(c);
            }
            else if (kind === 'birds') {
                birds(c);
            }
            else if (kind === 'pad') {
                var lp = c.createBiquadFilter(), pg = c.createGain();
                lp.type = 'lowpass';
                lp.frequency.value = 900;
                pg.gain.value = .16;
                lp.connect(pg);
                pg.connect(master);
                nodes.push(lp, pg);
                [130.81, 196, 261.63, 329.63].forEach(function (fr, i) { var o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = fr; og.gain.value = i === 0 ? .5 : .28; o.connect(og); og.connect(lp); o.start(); nodes.push(o, og); });
            }
        }
        catch (e) { }
    }
    function paintSound() {
        $$('[data-sound]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.sound === sound)); });
        document.body.classList.remove('rain-on');
    }
    function setSound(k) {
        sound = sound === k ? 'off' : k;
        stopSound();
        if (sound !== 'off')
            startSound(sound);
        paintSound();
        stopRain();
    }
    document.addEventListener('click', function (e) {
        var sd = e.target.closest('[data-sound]');
        if (sd)
            return setSound(sd.dataset.sound);
        if (e.target.closest('[data-add-sound]'))
            return pickCustom();
        var del = e.target.closest('[data-del-sound]');
        if (del)
            removeCustom(del.dataset.delSound);
    });
    document.addEventListener('input', function (e) {
        if (!e.target.matches('[data-vol]'))
            return;
        var v = +e.target.value;
        if (master)
            master.gain.value = v / 100;
        if (soundAudio)
            soundAudio.volume = v / 100;
        $$('[data-vol]').forEach(function (o) { o.value = v; });
        D.store.mutate(function (S) { S.settings.vol = v; }, { silent: true });
    });
    /* ---------- rain overlay on screen ---------- */
    var rc, rx, drops = [], raf = 0, rcol = 'rgba(44,70,54,.3)';
    function mk(init) { return { x: Math.random() * (innerWidth + 120), y: init ? Math.random() * innerHeight : -30, l: 10 + Math.random() * 18, v: 9 + Math.random() * 8 }; }
    function sizeRain() { var dpr = devicePixelRatio || 1; rc.width = innerWidth * dpr; rc.height = innerHeight * dpr; rx.setTransform(dpr, 0, 0, dpr, 0, 0); drops = []; for (var i = 0; i < Math.round(innerWidth / 9); i++)
        drops.push(mk(true)); }
    function rainLoop() {
        rx.clearRect(0, 0, innerWidth, innerHeight);
        rx.strokeStyle = rcol;
        rx.lineWidth = 1.2;
        rx.lineCap = 'round';
        rx.beginPath();
        for (var i = 0; i < drops.length; i++) {
            var d = drops[i];
            rx.moveTo(d.x, d.y);
            rx.lineTo(d.x - d.l * .18, d.y + d.l);
            d.y += d.v;
            d.x -= d.v * .18;
            if (d.y > innerHeight)
                drops[i] = mk(false);
        }
        rx.stroke();
        raf = requestAnimationFrame(rainLoop);
    }
    function startRain() { rc = rc || $('#rainCanvas'); rx = rx || rc.getContext('2d'); if (D.reduced || raf)
        return; rcol = getComputedStyle(document.documentElement).getPropertyValue('--rain-c').trim() || rcol; sizeRain(); raf = requestAnimationFrame(rainLoop); }
    function stopRain() { if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
    } setTimeout(function () { if (!raf && rc)
        rx.clearRect(0, 0, rc.width, rc.height); }, 850); }
    window.addEventListener('resize', function () { if (raf)
        sizeRain(); });
    D.focus = {
        render: render, bind: bind, paintSound: paintSound, ambienceHTML: ambienceHTML, refreshRainColor: function () { if (raf)
            rcol = getComputedStyle(document.documentElement).getPropertyValue('--rain-c').trim() || rcol; },
        startIfIdle: function () { if (!T.running) {
            if (T.mode !== 'focus')
                setMode('focus');
            start();
        } },
        isRunning: function () { return T.running; }, resetLengths: function () { if (!T.running) {
            T.total = T.left = lenOf(T.mode);
            paint(true);
        } },
        titleSync: syncTitle, startFor: function (pageId) { if (pageId)
            D.store.mutate(function (S) { S.meta.focusPage = pageId; }, { silent: true }); D.go('focus'); D.focus.startIfIdle(); }
    };
})();
