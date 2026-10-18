"use strict";
/*
  Daheer effects
  ---------------------------------------------------------------
  toast / dialog / menu    small UI pieces every view uses
  sfx                      soft WebAudio sounds (no files to ship)
  burst / floatText        leaf confetti and "+14 XP" pops
  pixel.run(fn)            the pixel transition (after Codrops' Pixel Transition, MIT):
                           a grid of cells scales in over the screen, fn() runs while it
                           is covered (language / theme swap), then the cells scale away.
*/
(function () {
    'use strict';
    var D = window.D, $ = D.$, t = D.t;
    /* ---------------- audio ---------------- */
    var ac = null;
    D.audio = {
        ctx: function () {
            if (!ac) {
                var A = window.AudioContext || window.webkitAudioContext;
                if (!A)
                    return null;
                ac = new A();
            }
            if (ac.state === 'suspended')
                ac.resume();
            return ac;
        }
    };
    function tone(freq, start, dur, type, gain) {
        var c = D.audio.ctx();
        if (!c)
            return;
        var o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + start;
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g);
        g.connect(c.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
    }
    var SFX = {
        tick: function () { tone(660, 0, 0.16, 'sine', 0.10); tone(990, 0.05, 0.2, 'sine', 0.06); },
        untick: function () { tone(420, 0, 0.12, 'sine', 0.06); },
        coin: function () { tone(784, 0, 0.12, 'triangle', 0.08); tone(1175, 0.07, 0.2, 'triangle', 0.08); },
        chime: function () { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, i * 0.09, 0.5, 'sine', 0.09); }); },
        level: function () { [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { tone(f, i * 0.09, 0.6, 'triangle', 0.09); }); },
        done: function () { tone(523.25, 0, 0.35, 'sine', 0.1); tone(659.25, 0.16, 0.35, 'sine', 0.1); tone(783.99, 0.32, 0.7, 'sine', 0.1); }
    };
    D.sfx = function (name) { var S = D.store && D.store.S; if (S && S.settings.sfx === false)
        return; try {
        SFX[name] && SFX[name]();
    }
    catch (e) { } };
    /* ---------------- toasts ---------------- */
    function layer() { return $('#layer'); }
    D.ui = D.ui || {};
    D.ui.toast = function (o) {
        var box = $('#toasts');
        if (!box)
            return;
        var el = document.createElement('div');
        el.className = 'toast tone-' + (o.tone || 'matcha');
        el.setAttribute('role', 'status');
        el.innerHTML = '<span class="toast-ic">' + (o.emoji ? D.esc(o.emoji) : D.icon(o.icon || 'leaf', o.fill ? 'i-fill' : '')) + '</span>' +
            '<span class="toast-tx"><b>' + D.esc(o.title || '') + '</b>' + (o.text ? '<small>' + D.esc(o.text) + '</small>' : '') + '</span>' +
            (o.action ? '<button class="toast-act">' + D.esc(o.action.label) + '</button>' : '');
        box.appendChild(el);
        while (box.children.length > 4)
            box.removeChild(box.firstChild);
        requestAnimationFrame(function () { el.classList.add('in'); });
        var gone = false;
        function close() { if (gone)
            return; gone = true; el.classList.remove('in'); setTimeout(function () { el.remove(); }, 260); }
        if (o.action)
            el.querySelector('.toast-act').addEventListener('click', function () { o.action.fn(); close(); });
        setTimeout(close, o.ms || (o.action ? 6000 : 3800));
        return close;
    };
    /* ---------------- dialogs ---------------- */
    var openDialogs = 0;
    D.ui.dialog = function (o) {
        return new Promise(function (resolve) {
            var back = document.createElement('div');
            back.className = 'dlg-back';
            var box = document.createElement('div');
            box.className = 'dlg' + (o.wide ? ' wide' : '') + (o.cls ? ' ' + o.cls : '');
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            var actions = (o.actions || []).map(function (a, i) { return '<button class="btn ' + (a.kind === 'ghost' ? 'btn-ghost' : a.kind === 'danger' ? 'btn-danger' : a.kind === 'warm' ? 'btn-warm' : '') + '" data-i="' + i + '">' + D.esc(a.label) + '</button>'; }).join('');
            box.innerHTML = (o.title ? '<header class="dlg-h"><h2>' + D.esc(o.title) + '</h2>' + (o.close === false ? '' : '<button class="ib" data-x aria-label="' + D.esc(t('common.close')) + '">' + D.icon('x') + '</button>') + '</header>' : '') +
                '<div class="dlg-b"></div>' + (actions ? '<footer class="dlg-f">' + actions + '</footer>' : '');
            var body = box.querySelector('.dlg-b');
            if (typeof o.html === 'string')
                body.innerHTML = o.html;
            else if (o.html)
                body.appendChild(o.html);
            back.appendChild(box);
            layer().appendChild(back);
            openDialogs++;
            requestAnimationFrame(function () { back.classList.add('in'); var f = box.querySelector('[autofocus],input,textarea,select'); if (f)
                f.focus();
            else {
                var b = box.querySelector('.dlg-f .btn:last-child');
                if (b)
                    b.focus();
            } });
            var done = false;
            function close(v) {
                if (done)
                    return;
                done = true;
                openDialogs--;
                document.removeEventListener('keydown', key, true);
                back.classList.remove('in');
                setTimeout(function () { back.remove(); }, 220);
                resolve(v);
            }
            function key(e) { if (e.key === 'Escape' && back.parentNode && layer().lastElementChild === back) {
                e.stopPropagation();
                close(null);
            } if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])') && o.enter !== false) {
                var p = box.querySelector('.dlg-f .btn:last-child');
                if (p) {
                    e.preventDefault();
                    p.click();
                }
            } }
            document.addEventListener('keydown', key, true);
            back.addEventListener('mousedown', function (e) { if (e.target === back && o.close !== false)
                close(null); });
            box.addEventListener('click', function (e) {
                if (e.target.closest('[data-x]'))
                    return close(null);
                var b = e.target.closest('.dlg-f .btn');
                if (!b)
                    return;
                var a = o.actions[+b.dataset.i];
                if (a.validate && !a.validate(box))
                    return;
                close(a.value !== undefined ? (typeof a.value === 'function' ? a.value(box) : a.value) : true);
            });
            if (o.onOpen)
                o.onOpen(box, close);
        });
    };
    D.ui.confirm = function (o) {
        return D.ui.dialog({ title: o.title, html: '<p class="dlg-p">' + D.esc(o.text || '') + '</p>', actions: [{ label: o.cancel || t('common.cancel'), kind: 'ghost', value: false }, { label: o.ok || t('common.ok'), kind: o.danger ? 'danger' : '', value: true }] }).then(function (v) { return !!v; });
    };
    D.ui.prompt = function (o) {
        return D.ui.dialog({
            title: o.title, html: '<label class="fld"><span>' + D.esc(o.label || '') + '</span><input class="inp" autofocus value="' + D.esc(o.value || '') + '" placeholder="' + D.esc(o.placeholder || '') + '"></label>',
            actions: [{ label: t('common.cancel'), kind: 'ghost', value: null }, { label: o.ok || t('common.save'), value: function (b) { return b.querySelector('input').value.trim(); } }]
        });
    };
    /* ---------------- popup menu ---------------- */
    var openMenu = null;
    D.ui.closeMenu = function () { if (openMenu) {
        openMenu.remove();
        openMenu = null;
    } };
    D.ui.menu = function (anchor, items, o) {
        D.ui.closeMenu();
        o = o || {};
        var m = document.createElement('div');
        m.className = 'menu';
        m.setAttribute('role', 'menu');
        m.innerHTML = items.map(function (it, i) {
            if (it === '-')
                return '<hr>';
            return '<button role="menuitem" class="' + (it.danger ? 'danger ' : '') + (it.on ? 'on ' : '') + '" data-i="' + i + '"' + (it.disabled ? ' disabled' : '') + '>' + (it.icon ? D.icon(it.icon) : '<span class="i"></span>') + '<span>' + D.esc(it.label) + '</span>' + (it.hint ? '<kbd>' + D.esc(it.hint) + '</kbd>' : '') + '</button>';
        }).join('');
        layer().appendChild(m);
        openMenu = m;
        var r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
        var mw = m.offsetWidth, mh = m.offsetHeight, rtl = D.isRTL();
        var x = rtl ? r.right - mw : r.left;
        if (o.at === 'end')
            x = rtl ? r.left : r.right - mw;
        var y = r.bottom + 6;
        if (y + mh > innerHeight - 8)
            y = Math.max(8, r.top - mh - 6);
        x = Math.max(8, Math.min(innerWidth - mw - 8, x));
        m.style.left = x + 'px';
        m.style.top = y + 'px';
        requestAnimationFrame(function () { m.classList.add('in'); });
        m.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b)
            return; var it = items[+b.dataset.i]; D.ui.closeMenu(); if (it && it.fn)
            it.fn(); });
        setTimeout(function () {
            var off = function (e) { if (!m.contains(e.target)) {
                D.ui.closeMenu();
                document.removeEventListener('mousedown', off, true);
            } };
            document.addEventListener('mousedown', off, true);
        }, 0);
        m.querySelector('button:not([disabled])') && m.querySelector('button:not([disabled])').focus();
        m.addEventListener('keydown', function (e) {
            var bs = D.$$('button:not([disabled])', m), i = bs.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                bs[(i + 1) % bs.length].focus();
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                bs[(i - 1 + bs.length) % bs.length].focus();
            }
            if (e.key === 'Escape') {
                e.stopPropagation();
                D.ui.closeMenu();
            }
        });
        return m;
    };
    /* ---------------- confetti of leaves ---------------- */
    var fc, fx, parts = [], fraf = 0;
    function fxInit() { fc = fc || $('#fxCanvas'); if (!fc)
        return false; fx = fx || fc.getContext('2d'); var dpr = window.devicePixelRatio || 1; if (fc.width !== innerWidth * dpr) {
        fc.width = innerWidth * dpr;
        fc.height = innerHeight * dpr;
        fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } return true; }
    function colors() { var cs = getComputedStyle(document.documentElement); return ['--h3', '--h4', '--lamp', '--matcha-strong', '--leaf2'].map(function (v) { return cs.getPropertyValue(v).trim() || '#7FAA63'; }); }
    function loop() {
        fx.clearRect(0, 0, innerWidth, innerHeight);
        parts = parts.filter(function (p) { return p.life > 0 && p.y < innerHeight + 40; });
        parts.forEach(function (p) {
            p.vy += p.g;
            p.vx *= 0.992;
            p.x += p.vx;
            p.y += p.vy;
            p.r += p.vr;
            p.life -= 1;
            fx.save();
            fx.translate(p.x, p.y);
            fx.rotate(p.r);
            fx.globalAlpha = Math.min(1, p.life / 30);
            fx.fillStyle = p.c;
            fx.beginPath();
            if (p.leaf) {
                fx.ellipse(0, 0, p.s * 1.7, p.s * 0.8, 0, 0, 6.283);
            }
            else {
                fx.arc(0, 0, p.s * 0.6, 0, 6.283);
            }
            fx.fill();
            fx.restore();
        });
        if (parts.length)
            fraf = requestAnimationFrame(loop);
        else {
            fraf = 0;
            fx.clearRect(0, 0, innerWidth, innerHeight);
        }
    }
    function spawn(n, x, y, o) {
        if (D.reduced || !fxInit())
            return;
        o = o || {};
        var cs = colors();
        for (var i = 0; i < n; i++) {
            var a = (o.spread != null ? (-Math.PI / 2 + (Math.random() - .5) * o.spread) : Math.random() * 6.283), sp = (o.speed || 7) * (0.4 + Math.random());
            parts.push({ x: x + (o.w ? (Math.random() - .5) * o.w : 0), y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g || 0.22, r: Math.random() * 6, vr: (Math.random() - .5) * .3, s: 4 + Math.random() * 5, c: cs[i % cs.length], life: 70 + Math.random() * 60, leaf: Math.random() < .7 });
        }
        if (!fraf)
            fraf = requestAnimationFrame(loop);
    }
    D.fx = {
        burst: function (x, y, n) { spawn(n || 26, x, y, { speed: 6.5, spread: 4.4 }); },
        burstAt: function (el, n) { var r = el.getBoundingClientRect(); D.fx.burst(r.left + r.width / 2, r.top + r.height / 2, n); },
        shower: function () { for (var k = 0; k < 4; k++)
            (function (k) { setTimeout(function () { spawn(24, innerWidth * (0.15 + k * 0.23), -10, { speed: 2, spread: 0, g: 0.16, w: 180 }); parts.slice(-24).forEach(function (p) { p.vy = 1 + Math.random() * 3; p.vx = (Math.random() - .5) * 3; p.life = 160; }); }, k * 140); })(k); },
        floatText: function (el, text, cls) {
            var r = el.getBoundingClientRect(), n = document.createElement('div');
            n.className = 'floatx ' + (cls || '');
            n.textContent = text;
            n.style.left = (r.left + r.width / 2) + 'px';
            n.style.top = (r.top) + 'px';
            layer().appendChild(n);
            setTimeout(function () { n.remove(); }, 1300);
        },
        countUp: function (el, from, to, ms) {
            if (D.reduced || from === to) {
                el.textContent = D.N(to);
                return;
            }
            var t0 = performance.now();
            ms = ms || 900;
            (function step(now) { var p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = D.N(Math.round(from + (to - from) * e)); if (p < 1)
                requestAnimationFrame(step); })(t0);
        }
    };
    /* ---------------- pixel transition ---------------- */
    var PAL = {
        dark: ['#0C1611', '#15211B', '#1F3027', '#2B4132', '#0F1D16'],
        light: ['#D6E2C8', '#F3F6EC', '#E4ECD8', '#D3E2BB', '#FAFCF6']
    };
    D.pixel = {
        // theme: which palette the cells wear ('light' | 'dark'); mid: runs while covered
        run: function (mid, theme) {
            if (D.reduced || !document.body.animate)
                return Promise.resolve(mid && mid());
            var host = $('#pixel');
            if (!host)
                return Promise.resolve(mid && mid());
            if (host.dataset.busy)
                return Promise.resolve(mid && mid());
            host.dataset.busy = '1';
            var W = innerWidth, H = innerHeight, cols = W < 700 ? 8 : 14, size = Math.ceil(W / cols), rows = Math.ceil(H / size);
            var pal = PAL[theme || (D.isDark && D.isDark() ? 'dark' : 'light')];
            host.style.cssText = 'display:grid;grid-template-columns:repeat(' + cols + ',1fr);grid-template-rows:repeat(' + rows + ',' + size + 'px)';
            host.innerHTML = '';
            var cells = [];
            for (var r = 0; r < rows; r++)
                for (var c = 0; c < cols; c++) {
                    var el = document.createElement('i');
                    el.style.background = pal[(r * 7 + c * 3 + ((r + c) % 2)) % pal.length];
                    el.style.transform = 'scale(0)';
                    el.style.opacity = '0';
                    host.appendChild(el);
                    cells.push({ el: el, r: r, c: c });
                }
            host.hidden = false;
            var DUR = 380, STEP = 26, JIT = 150;
            var maxDelay = (rows - 1) * STEP + JIT, PHASE = maxDelay + DUR + 60;
            // Drives each phase two ways at once: WAAPI for smoothness where it ticks, and a guaranteed
            // inline-style commit at PHASE ms so the end state is correct even where animations never
            // tick (some offscreen/headless renderers) or a stylesheet rule outranks the transition.
            function anim(list, from, to, delayOf) {
                list.forEach(function (cell) {
                    try {
                        cell.el.getAnimations && cell.el.getAnimations().forEach(function (a) { a.cancel(); });
                    }
                    catch (e) { }
                    try {
                        cell.el.animate([from, to], { duration: DUR, delay: delayOf(cell), easing: 'cubic-bezier(.65,0,.35,1)', fill: 'both' });
                    }
                    catch (e) { }
                });
                return D.sleep(PHASE).then(function () { list.forEach(function (cell) { cell.el.style.transform = to.transform; cell.el.style.opacity = to.opacity; }); });
            }
            var delayOf = function (c) { return c.r * STEP + Math.random() * JIT; };
            return anim(cells, { transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.02)', opacity: 1 }, delayOf)
                .then(function () { return mid && mid(); })
                .then(function (v) { return D.sleep(90).then(function () { return v; }); })
                .then(function (v) { return anim(cells, { transform: 'scale(1.02)', opacity: 1 }, { transform: 'scale(0)', opacity: 0 }, delayOf).then(function () { return v; }); })
                .then(function (v) { host.hidden = true; host.style.display = 'none'; host.innerHTML = ''; delete host.dataset.busy; return v; }, function (e) { host.hidden = true; host.style.display = 'none'; host.innerHTML = ''; delete host.dataset.busy; throw e; });
        }
    };
})();
