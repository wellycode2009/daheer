"use strict";
/*
  Daheer board
  ---------------------------------------------------------------
  The whiteboard layer of Notes > Board: a floating toolbar (Select, Connector, Frame,
  Present, Note | Pen, Eraser, Shapes, Text, Image) and an SVG layer that sits on top of
  the page cards. Items are stored in the app state as S.board.items so they survive
  restarts, and every change can be undone with Ctrl/Cmd+Z.

  Item types
    stroke    { pts:[[x,y]...], color, width }
    shape     { kind:'rect'|'ellipse'|'triangle'|'diamond', x, y, w, h, fill }
    text      { x, y, text, size, color }
    image     { x, y, w, h, src }               (src is a downscaled data: URL)
    frame     { x, y, w, h, title }             (frames are the "slides" of Present)
    connector { from, to, style }               (ref = {page} | {id} | {x, y})
*/
(function () {
    'use strict';
    var D = window.D, t = D.t, esc = D.esc, $ = D.$, $$ = D.$$;
    // 'ink' follows the theme (dark on light, light on dark); everything else is a fixed colour
    var PALETTE = ['ink', '#6B7A72', '#FFFFFF', '#E5484D', '#F76B15', '#FFB224', '#F2D13B', '#9ACD32', '#30A46C', '#12A594', '#3E9FDB', '#3B5BDB', '#6E56CF', '#A855F7', '#E93D82', '#A07553'];
    var FILLS = ['none'].concat(PALETTE.slice(1));
    var SHAPES = ['rect', 'ellipse', 'triangle', 'diamond'];
    var PENS = ['pen', 'marker', 'highlighter', 'dashed'];
    var TSIZES = [16, 20, 28, 40, 56];
    var SHORTCUT = { select: 'V', connector: 'C', frame: 'F', pen: 'P', eraser: 'E', shape: 'S', text: 'T' };
    var POPUP_TOOLS = ['connector', 'pen', 'shape', 'text'];
    /* ---------- state that outlives re-renders ---------- */
    var tool = 'select';
    var pen = { kind: 'pen', color: '#E5484D', width: 4, opacity: 1 };
    var shapeCfg = { kind: 'rect', fill: '#F6D55C', border: 'ink', bw: 2 };
    var connCfg = { style: 'curve', color: 'ink', width: 2.2 };
    var textCfg = { color: 'ink', size: 20 };
    var shapeTarget = 'fill'; // which colour of a shape the palette edits: 'fill' | 'border'
    var recent = []; // custom colours picked with the wheel
    var wheel = { h: 20, s: 0.8, v: 1, open: false };
    var live = null; // undo snapshot for an edit that is still in progress (slider drag, wheel drag)
    var prefsLoaded = false;
    var prefsTimer = null;
    var sel = null;
    var undoStack = [];
    var popFor = null; // 'pen' | 'shape' | 'text' | 'connector' | 'sel'
    var fullMode = false;
    var cur = null; // the mounted board: { wrap, canvas, inner, baseW, baseH, root }
    var drag = null; // pointer gesture in progress
    var presenting = null;
    var view = { x: 60, y: 60, k: 1 }; // viewport: screen = world * k + (x, y)
    var MINK = 0.1, MAXK = 4;
    var spaceDown = false;
    var viewTimer = null;
    var keysBound = false;
    /* ---------- data helpers ---------- */
    function items() {
        var S = D.store.S;
        if (!S.board || !Array.isArray(S.board.items))
            S.board = { items: [] };
        return S.board.items;
    }
    function byId(id) { return items().filter(function (i) { return i.id === id; })[0]; }
    function col(c) { return !c || c === 'ink' ? 'var(--ink)' : c; }
    function snap() {
        var cards = {};
        D.store.S.notes.forEach(function (p) { if (p.canvas)
            cards[p.id] = { x: p.canvas.x, y: p.canvas.y }; });
        return JSON.stringify({ items: items(), cards: cards });
    }
    function pushUndo(s) { undoStack.push(s); if (undoStack.length > 40)
        undoStack.shift(); }
    function persist() { D.store.mutate(function () { }, { silent: true }); }
    function commit(fn) { pushUndo(snap()); fn(items()); persist(); redraw(); }
    function undo() {
        if (!undoStack.length)
            return;
        var o = JSON.parse(undoStack.pop());
        D.store.mutate(function (S) {
            S.board.items = o.items;
            S.notes.forEach(function (p) { if (o.cards[p.id])
                p.canvas = { x: o.cards[p.id].x, y: o.cards[p.id].y }; });
        }, { silent: true });
        sel = null;
        D.refresh();
    }
    function removeItems(ids) {
        var set = {};
        ids.forEach(function (i) { set[i] = true; });
        var list = items();
        for (var i = list.length - 1; i >= 0; i--) {
            var it = list[i];
            if (set[it.id] || (it.type === 'connector' && ((it.from && it.from.id && set[it.from.id]) || (it.to && it.to.id && set[it.to.id]))))
                list.splice(i, 1);
        }
    }
    function delSel() { if (!sel)
        return; var id = sel; sel = null; commit(function () { removeItems([id]); }); }
    /* ---------- geometry ---------- */
    function pt(e) {
        var r = cur.canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
    }
    function toWorld(sx, sy) { return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k }; }
    /* ---------- edgeless viewport: pan + zoom ---------- */
    function applyView() {
        if (!cur)
            return;
        cur.inner.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')';
        var g = cur.grid;
        if (g) {
            var sz = (22 * view.k).toFixed(2) + 'px';
            g.style.backgroundSize = sz + ' ' + sz;
            g.style.backgroundPosition = view.x + 'px ' + view.y + 'px';
        }
        var z = $('[data-bz="reset"]', cur.wrap);
        if (z)
            z.textContent = D.N(Math.round(view.k * 100)) + '%';
        drawSel();
    }
    function setView(v, save) {
        view.k = Math.max(MINK, Math.min(MAXK, v.k));
        view.x = v.x;
        view.y = v.y;
        D.store.S.board.view = { x: Math.round(view.x), y: Math.round(view.y), k: Math.round(view.k * 1000) / 1000 };
        applyView();
        if (save !== false) {
            clearTimeout(viewTimer);
            viewTimer = setTimeout(persist, 400);
        }
    }
    function zoomAt(cx, cy, k2) {
        k2 = Math.max(MINK, Math.min(MAXK, k2));
        var wx = (cx - view.x) / view.k, wy = (cy - view.y) / view.k;
        setView({ x: cx - wx * k2, y: cy - wy * k2, k: k2 });
    }
    function zoomBy(f) { zoomAt(cur.canvas.clientWidth / 2, cur.canvas.clientHeight / 2, view.k * f); }
    function contentBox() {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        function add(b) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
        items().forEach(function (it) { if (it.type !== 'connector')
            add(bbox(it)); });
        $$('[data-cv]', cur.inner).forEach(function (el) { add(cardBox(el)); });
        return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    function fitView() {
        var b = contentBox(), W = cur.canvas.clientWidth, H = cur.canvas.clientHeight;
        if (!b) {
            setView({ x: W / 2, y: H / 2, k: 1 });
            return;
        }
        var k = Math.max(MINK, Math.min(1, (W - 140) / Math.max(b.w, 1), (H - 220) / Math.max(b.h, 1)));
        setView({ x: (W - b.w * k) / 2 - b.x * k, y: (H - 90 - b.h * k) / 2 - b.y * k, k: k });
    }
    function effW(it) {
        var w = it.width || 4, k = it.kind || 'pen';
        return k === 'highlighter' ? w * 3 : k === 'marker' ? w * 1.6 : w;
    }
    function bbox(it) {
        if (it.type === 'stroke') {
            var xs = it.pts.map(function (p) { return p[0]; }), ys = it.pts.map(function (p) { return p[1]; }), pad = effW(it) / 2;
            var x0 = Math.min.apply(null, xs) - pad, y0 = Math.min.apply(null, ys) - pad;
            return { x: x0, y: y0, w: Math.max.apply(null, xs) + pad - x0, h: Math.max.apply(null, ys) + pad - y0 };
        }
        if (it.type === 'text') {
            var el = cur && $('[data-bid="' + it.id + '"]', cur.inner);
            if (el && el.getBBox) {
                try {
                    var b = el.getBBox();
                    if (b.width)
                        return { x: b.x, y: b.y, w: b.width, h: b.height };
                }
                catch (e) { /* not rendered yet */ }
            }
            var lines = (it.text || '').split('\n'), size = it.size || 20;
            return { x: it.x, y: it.y, w: Math.max.apply(null, lines.map(function (l) { return l.length; })) * size * 0.6, h: lines.length * size * 1.3 };
        }
        return { x: it.x, y: it.y, w: it.w, h: it.h };
    }
    function cardBox(el) { return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; }
    function cardAt(p) {
        var els = $$('[data-cv]', cur.inner);
        for (var i = els.length - 1; i >= 0; i--) {
            var b = cardBox(els[i]);
            if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
                return { id: els[i].dataset.cv, box: b };
        }
        return null;
    }
    function inBox(b, p, tol) { return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol; }
    function nearBorder(b, p, tol) { return inBox(b, p, tol) && !(p.x > b.x + tol && p.x < b.x + b.w - tol && p.y > b.y + tol && p.y < b.y + b.h - tol); }
    function distSeg(p, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        var k = l2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2)) : 0;
        return Math.hypot(p.x - (ax + k * dx), p.y - (ay + k * dy));
    }
    function center(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
    function clip(b, to) {
        var c = center(b), dx = to.x - c.x, dy = to.y - c.y;
        if (!dx && !dy)
            return c;
        var s = Math.min(dx ? (b.w / 2) / Math.abs(dx) : Infinity, dy ? (b.h / 2) / Math.abs(dy) : Infinity);
        return { x: c.x + dx * s, y: c.y + dy * s };
    }
    function refBox(r) {
        if (!r)
            return null;
        if (r.page) {
            var el = $('[data-cv="' + r.page + '"]', cur.inner);
            return el ? cardBox(el) : null;
        }
        if (r.id) {
            var it = byId(r.id);
            return it && it.type !== 'connector' ? bbox(it) : null;
        }
        return null;
    }
    function isDangling(r) { return !!r && (r.page || r.id) && !refBox(r); }
    function connEnds(c) {
        if (isDangling(c.from) || isDangling(c.to))
            return null;
        var ra = refBox(c.from), rb = refBox(c.to);
        var pa = ra ? center(ra) : { x: c.from.x, y: c.from.y }, pb = rb ? center(rb) : { x: c.to.x, y: c.to.y };
        return { a: ra ? clip(ra, pb) : pa, b: rb ? clip(rb, pa) : pb };
    }
    function curveCtrl(a, b) {
        var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, k = Math.min(60, len * 0.2);
        return { x: (a.x + b.x) / 2 - dy / len * k, y: (a.y + b.y) / 2 + dx / len * k };
    }
    function connGeom(c) {
        var e = connEnds(c);
        if (!e)
            return null;
        var a = e.a, b = e.b, pts, d, tx, ty;
        if (c.style === 'straight') {
            pts = [a, b];
            tx = b.x - a.x;
            ty = b.y - a.y;
        }
        else if (c.style === 'elbow') {
            if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
                var mx = (a.x + b.x) / 2;
                pts = [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
                tx = b.x - mx;
                ty = 0;
            }
            else {
                var my = (a.y + b.y) / 2;
                pts = [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
                tx = 0;
                ty = b.y - my;
            }
            if (!tx && !ty) {
                tx = b.x - a.x;
                ty = b.y - a.y;
            }
        }
        else {
            var q = curveCtrl(a, b);
            pts = [];
            for (var i = 0; i <= 16; i++) {
                var k = i / 16, u = 1 - k;
                pts.push({ x: u * u * a.x + 2 * u * k * q.x + k * k * b.x, y: u * u * a.y + 2 * u * k * q.y + k * k * b.y });
            }
            tx = b.x - q.x;
            ty = b.y - q.y;
        }
        d = c.style === 'curve' || !c.style
            ? 'M' + a.x + ' ' + a.y + 'Q' + curveCtrl(a, b).x + ' ' + curveCtrl(a, b).y + ' ' + b.x + ' ' + b.y
            : 'M' + pts.map(function (p) { return p.x + ' ' + p.y; }).join('L');
        return { d: d, pts: pts, tx: tx, ty: ty, b: b };
    }
    function connPoints(c) { var g = connGeom(c); return g ? g.pts : []; }
    function frameTitleBox(it) { return { x: it.x, y: it.y - 26, w: Math.max(90, (it.title || '').length * 9 + 16), h: 26 }; }
    function hit(it, p, tol) {
        tol = tol / view.k; // tolerances are in screen pixels so they feel the same at any zoom
        if (it.type === 'stroke') {
            var pts = it.pts, r = effW(it) / 2 + tol;
            if (pts.length === 1)
                return Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) <= r;
            for (var i = 1; i < pts.length; i++)
                if (distSeg(p, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= r)
                    return true;
            return false;
        }
        if (it.type === 'connector') {
            var cp = connPoints(it);
            for (var j = 1; j < cp.length; j++)
                if (distSeg(p, cp[j - 1].x, cp[j - 1].y, cp[j].x, cp[j].y) <= tol + 2)
                    return true;
            return false;
        }
        var b = bbox(it);
        if (it.type === 'frame')
            return nearBorder(b, p, tol + 2) || inBox(frameTitleBox(it), p, 0);
        if (it.type === 'shape' && it.fill === 'none')
            return nearBorder(b, p, tol + 2);
        return inBox(b, p, tol);
    }
    function topAt(p, tol, skip) {
        var list = items();
        for (var i = list.length - 1; i >= 0; i--) {
            if (skip && skip(list[i]))
                continue;
            if (hit(list[i], p, tol == null ? 6 : tol))
                return list[i];
        }
        return null;
    }
    /* ---------- SVG rendering ---------- */
    function pathD(pts) {
        if (pts.length === 1)
            return 'M' + pts[0][0] + ' ' + pts[0][1] + 'l0.01 0';
        var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
        for (var i = 1; i < pts.length - 1; i++) {
            var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
            d += 'Q' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1);
        }
        var l = pts[pts.length - 1];
        return d + 'L' + l[0].toFixed(1) + ' ' + l[1].toFixed(1);
    }
    function strokeSVG(it, id) {
        var k = it.kind || 'pen', w = effW(it), op = it.opacity == null ? 1 : it.opacity;
        var dash = k === 'dashed' ? ' stroke-dasharray="' + (w * 2.2).toFixed(1) + ' ' + (w * 2.6).toFixed(1) + '"' : '';
        return '<path' + id + ' d="' + pathD(it.pts) + '" fill="none" stroke="' + col(it.color) + '" stroke-width="' + w + '" stroke-opacity="' + op + '" stroke-linecap="' + (k === 'highlighter' ? 'butt' : 'round') + '" stroke-linejoin="round"' + dash + '/>';
    }
    function itemSVG(it) {
        var id = ' data-bid="' + it.id + '"';
        if (it.type === 'stroke')
            return strokeSVG(it, id);
        if (it.type === 'shape') {
            var bw = it.bw == null ? 2 : it.bw;
            var st = ' fill="' + (it.fill === 'none' ? 'none' : it.fill) + '" stroke="' + (bw ? col(it.border || 'ink') : 'none') + '" stroke-width="' + bw + '" stroke-linejoin="round"';
            var x = it.x, y = it.y, w = it.w, h = it.h;
            if (it.kind === 'ellipse')
                return '<ellipse' + id + ' cx="' + (x + w / 2) + '" cy="' + (y + h / 2) + '" rx="' + w / 2 + '" ry="' + h / 2 + '"' + st + '/>';
            if (it.kind === 'triangle')
                return '<polygon' + id + ' points="' + (x + w / 2) + ',' + y + ' ' + (x + w) + ',' + (y + h) + ' ' + x + ',' + (y + h) + '"' + st + '/>';
            if (it.kind === 'diamond')
                return '<polygon' + id + ' points="' + (x + w / 2) + ',' + y + ' ' + (x + w) + ',' + (y + h / 2) + ' ' + (x + w / 2) + ',' + (y + h) + ' ' + x + ',' + (y + h / 2) + '"' + st + '/>';
            return '<rect' + id + ' x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8"' + st + '/>';
        }
        if (it.type === 'text') {
            var size = it.size || 20, lines = (it.text || '').split('\n');
            return '<text' + id + ' x="' + it.x + '" y="' + it.y + '" font-size="' + size + '" fill="' + col(it.color) + '" dominant-baseline="hanging" style="font-family:var(--f-ui, system-ui, sans-serif)">' +
                lines.map(function (l, i) { return '<tspan x="' + it.x + '" dy="' + (i ? size * 1.3 : 0) + '">' + esc(l || ' ') + '</tspan>'; }).join('') + '</text>';
        }
        if (it.type === 'image')
            return '<image' + id + ' href="' + esc(it.src) + '" x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" preserveAspectRatio="none"/>';
        if (it.type === 'frame') {
            return '<g' + id + '><rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" rx="10" fill="var(--ink)" fill-opacity=".035" stroke="var(--line-strong)" stroke-width="1.5"/>' +
                '<text x="' + it.x + '" y="' + (it.y - 8) + '" font-size="14" fill="var(--ink-soft)" style="font-family:var(--f-ui, system-ui, sans-serif)">' + esc(it.title || '') + '</text></g>';
        }
        return '';
    }
    function connSVG(c) {
        var g = connGeom(c);
        if (!g)
            return '';
        var w = c.width || 2.2, color = col(c.color || 'ink'), b = g.b;
        var l = Math.hypot(g.tx, g.ty) || 1, tx = g.tx / l, ty = g.ty / l;
        var hd = 9 + w * 1.6, nx = -ty, ny = tx, bx = b.x - tx * hd, by = b.y - ty * hd;
        return '<g data-bid="' + c.id + '"><path d="' + g.d + '" fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<polygon points="' + b.x + ',' + b.y + ' ' + (bx + nx * hd * 0.5) + ',' + (by + ny * hd * 0.5) + ' ' + (bx - nx * hd * 0.5) + ',' + (by - ny * hd * 0.5) + '" fill="' + color + '"/></g>';
    }
    function layer(name) { return cur && $('[data-bd-' + name + ']', cur.inner); }
    function redraw() {
        if (!cur)
            return;
        var under = '', main = '', conn = '';
        items().forEach(function (it) {
            if (it.type === 'frame')
                under += itemSVG(it);
            else if (it.type === 'connector')
                conn += connSVG(it);
            else
                main += itemSVG(it);
        });
        layer('under').innerHTML = under;
        layer('main').innerHTML = main;
        layer('conn').innerHTML = conn;
        drawSel();
    }
    function redrawConnectors(root) { if (cur && (!root || cur.root === root)) {
        layer('conn').innerHTML = items().filter(function (i) { return i.type === 'connector'; }).map(connSVG).join('');
        drawSel();
    } }
    function resizable(it) { return !!it && (it.type === 'shape' || it.type === 'image' || it.type === 'frame'); }
    function drawSel() {
        var ui = layer('ui');
        if (!ui)
            return;
        var it = sel ? byId(sel) : null, out = '';
        var u = 1 / view.k; // keep the selection chrome the same size on screen
        if (it && it.type !== 'connector') {
            var b = bbox(it), pd = 4 * u;
            out += '<rect x="' + (b.x - pd) + '" y="' + (b.y - pd) + '" width="' + (b.w + 2 * pd) + '" height="' + (b.h + 2 * pd) + '" rx="' + 6 * u + '" fill="none" stroke="var(--pine)" stroke-width="' + 1.5 * u + '" stroke-dasharray="' + 5 * u + ' ' + 4 * u + '"/>';
            if (resizable(it))
                out += '<circle cx="' + (b.x + b.w) + '" cy="' + (b.y + b.h) + '" r="' + 6 * u + '" fill="var(--paper)" stroke="var(--pine)" stroke-width="' + 2 * u + '"/>';
        }
        else if (it) {
            var pts = connPoints(it);
            if (pts.length)
                out += '<path d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x + ' ' + p.y; }).join('') + '" fill="none" stroke="var(--pine)" stroke-opacity=".35" stroke-width="' + 8 * u + '" stroke-linecap="round"/>';
        }
        ui.innerHTML = out;
        updateSelBar();
    }
    /* ---------- colours: wheel, palette, recent ---------- */
    function hsv2hex(h, s, v) {
        var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
        if (h < 60) {
            r = c;
            g = x;
        }
        else if (h < 120) {
            r = x;
            g = c;
        }
        else if (h < 180) {
            g = c;
            b = x;
        }
        else if (h < 240) {
            g = x;
            b = c;
        }
        else if (h < 300) {
            r = x;
            b = c;
        }
        else {
            r = c;
            b = x;
        }
        return '#' + [r, g, b].map(function (n) { return ('0' + Math.round((n + m) * 255).toString(16)).slice(-2); }).join('').toUpperCase();
    }
    function hex2hsv(hex) {
        var n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
        if (d)
            h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return { h: h * 60, s: mx ? d / mx : 0, v: mx };
    }
    function isHex(c) { return /^#[0-9a-f]{6}$/i.test(c || ''); }
    function colorTarget() {
        if (popFor === 'sel')
            return 'sel';
        if (popFor === 'pen')
            return 'pen';
        if (popFor === 'text')
            return 'text';
        if (popFor === 'connector')
            return 'conn';
        return shapeTarget;
    }
    function selItem() { return sel ? byId(sel) || null : null; }
    function curColor() {
        var tg = colorTarget();
        if (tg === 'pen')
            return pen.color;
        if (tg === 'text')
            return textCfg.color;
        if (tg === 'conn')
            return connCfg.color;
        if (tg === 'fill')
            return shapeCfg.fill;
        if (tg === 'border')
            return shapeCfg.border;
        var it = selItem();
        if (!it)
            return '';
        if (it.type === 'shape')
            return shapeTarget === 'fill' ? it.fill : (it.border || 'ink');
        return it.color || 'ink';
    }
    function usesFills() {
        var tg = colorTarget();
        if (tg === 'fill')
            return true;
        if (tg === 'sel') {
            var it = selItem();
            return !!it && it.type === 'shape' && shapeTarget === 'fill';
        }
        return false;
    }
    function persistSoon() { clearTimeout(prefsTimer); prefsTimer = setTimeout(persist, 300); }
    function savePrefs() {
        D.store.S.board.prefs = JSON.parse(JSON.stringify({ pen: pen, shape: shapeCfg, conn: connCfg, text: textCfg, recent: recent }));
        persistSoon();
    }
    function loadPrefs() {
        if (prefsLoaded)
            return;
        prefsLoaded = true;
        var P = D.store.S.board && D.store.S.board.prefs;
        if (!P)
            return;
        if (P.pen)
            Object.assign(pen, P.pen);
        if (P.shape)
            Object.assign(shapeCfg, P.shape);
        if (P.conn)
            Object.assign(connCfg, P.conn);
        if (P.text)
            Object.assign(textCfg, P.text);
        if (Array.isArray(P.recent))
            recent = P.recent.filter(isHex).slice(0, 8);
    }
    function addRecent(c) {
        if (!isHex(c))
            return;
        c = c.toUpperCase();
        recent = [c].concat(recent.filter(function (x) { return x !== c; })).slice(0, 8);
        savePrefs();
    }
    /* edits to the selected item are grouped into one undo step (a slider drag or a wheel drag is a single edit) */
    function editSel(fn) {
        var it = selItem();
        if (!it)
            return;
        if (live === null)
            live = snap();
        fn(it);
        redraw();
        persistSoon();
    }
    function endLive() { if (live !== null) {
        pushUndo(live);
        live = null;
        persist();
    } }
    function setColor(c, remember) {
        var tg = colorTarget();
        if (tg === 'pen')
            pen.color = c;
        else if (tg === 'text')
            textCfg.color = c;
        else if (tg === 'conn')
            connCfg.color = c;
        else if (tg === 'fill')
            shapeCfg.fill = c;
        else if (tg === 'border')
            shapeCfg.border = c;
        else
            editSel(function (it) { if (it.type === 'shape') {
                if (shapeTarget === 'fill')
                    it.fill = c;
                else
                    it.border = c;
            }
            else
                it.color = c; });
        if (remember)
            addRecent(c);
        savePrefs();
    }
    function syncWheel() { var c = curColor(); if (isHex(c)) {
        var o = hex2hsv(c);
        wheel.h = o.h;
        wheel.s = o.s;
        wheel.v = o.v;
    } }
    function paintWheel() {
        if (!cur)
            return;
        var disc = $('[data-cw-disc]', cur.wrap);
        if (!disc)
            return;
        var R = disc.clientWidth / 2, a = wheel.h * Math.PI / 180, hex = hsv2hex(wheel.h, wheel.s, wheel.v);
        var knob = $('[data-cw-knob]', cur.wrap);
        knob.style.left = (R + Math.sin(a) * wheel.s * R) + 'px';
        knob.style.top = (R - Math.cos(a) * wheel.s * R) + 'px';
        knob.style.background = hex;
        var v = $('[data-cw-v]', cur.wrap);
        v.value = String(Math.round(wheel.v * 100));
        v.style.background = 'linear-gradient(90deg,#000,' + hsv2hex(wheel.h, wheel.s, 1) + ')';
        $('[data-cw-prev]', cur.wrap).style.background = hex;
        var hx = $('[data-cw-hex]', cur.wrap);
        if (document.activeElement !== hx)
            hx.value = hex;
    }
    function applyWheel() { var hex = hsv2hex(wheel.h, wheel.s, wheel.v); paintWheel(); setColor(hex, false); var sw = $$('[data-bp]', cur.wrap); sw.forEach(function (b) { if (b.dataset.bp.indexOf('c:') === 0)
        b.setAttribute('aria-pressed', 'false'); b.classList.remove('on'); }); }
    function wheelPick(e, disc) {
        var r = disc.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        wheel.s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
        wheel.h = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
        applyWheel();
    }
    /* ---------- toolbar ---------- */
    var ICON = {
        select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M5.2 3.6l13.1 6.9-5.5 1.7-1.9 5.5z" fill="currentColor" fill-opacity=".14"/><path d="M13.2 13.4l4.4 5.2"/></svg>',
        connector: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.6" cy="18" r="2.6" fill="currentColor" fill-opacity=".16"/><rect x="15" y="3.4" width="5.6" height="5.6" rx="1.6" fill="currentColor" fill-opacity=".16"/><path d="M8.2 17.2c5.6-.4 4.2-8 6.6-8.6"/><path d="M13 5.6l2.2 1-1.1 2.2" /></svg>',
        frame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 3.6L7.6 20.4M16.4 3.6L15 20.4M3.6 8.6h16.8M3.6 15.4h16.8"/></svg>',
        present: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3.8" width="18" height="12.4" rx="2.4" fill="currentColor" fill-opacity=".1"/><path d="M12 16.2V20M8.2 21l3.8-1.2 3.8 1.2"/><path d="M10.2 7.6l4.4 2.4-4.4 2.4z" fill="currentColor"/></svg>',
        note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.6 4h12.8A1.6 1.6 0 0 1 20 5.6V14.6L14.6 20H5.6A1.6 1.6 0 0 1 4 18.4V5.6A1.6 1.6 0 0 1 5.6 4z" fill="currentColor" fill-opacity=".1"/><path d="M14.6 20v-3.9a1.5 1.5 0 0 1 1.5-1.5H20"/><path d="M8 8.8h8M8 12.2h4.4"/></svg>',
        pen: '<svg viewBox="0 0 40 56"><path d="M14 4h12l2 34-8 14-8-14z" fill="#E0534B"/><path d="M14 4h12l.7 10H13.3z" fill="#B93A33"/><path d="M17 16l.7 20" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/><path d="M12 38l8 14 8-14z" fill="#F3D9B1"/><path d="M17.2 46l2.8 6 2.8-6z" fill="#34302B"/></svg>',
        eraser: '<svg viewBox="0 0 40 56"><rect x="6" y="8" width="28" height="40" rx="5" fill="#fff" stroke="#C9D2CC" stroke-width="1.5"/><path d="M6 24h28v19a5 5 0 01-5 5H11a5 5 0 01-5-5z" fill="#2477B2"/><path d="M20 24h14v19a5 5 0 01-5 5h-9z" fill="#1B5E8F"/><path d="M11 14h18" stroke="#C9D2CC" stroke-width="1.5" stroke-linecap="round"/></svg>',
        shape: '<svg viewBox="0 0 56 48"><rect x="3" y="18" width="30" height="26" rx="3" fill="#F6D55C"/><circle cx="38" cy="19" r="13" fill="#F2C94C"/><path d="M8 24h12" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/></svg>',
        text: '<svg viewBox="0 0 56 48"><rect x="3" y="5" width="50" height="38" rx="5" fill="none" stroke="#9AA79F" stroke-width="2" stroke-dasharray="4 3"/><text x="28" y="33" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="24" fill="#1F3025">Aa</text></svg>',
        media: '<svg viewBox="0 0 56 48"><rect x="9" y="3" width="42" height="32" rx="5" fill="#B7D6EE" transform="rotate(7 30 19)"/><rect x="4" y="8" width="44" height="34" rx="5" fill="#5DA9E0"/><circle cx="16" cy="19" r="4.5" fill="#FFE9A8"/><path d="M4 36l14-12 11 9 8-6 11 8v5a5 5 0 01-5 5H9a5 5 0 01-5-5z" fill="#4CAF7A"/></svg>'
    };
    var CARET = '<svg class="bt-caret" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5L5 3.5l3 3"/></svg>';
    function tip(name) { return t('board.' + name) + (SHORTCUT[name] ? ' (' + SHORTCUT[name] + ')' : ''); }
    function btn(name, art) {
        var pressed = tool === name;
        return '<button type="button" class="bt' + (art ? ' bt-artbtn bt-' + name : '') + '" data-bt="' + name + '" aria-pressed="' + pressed + '" title="' + esc(tip(name)) + '" aria-label="' + esc(t('board.' + name)) + '">' +
            ICON[name] + (POPUP_TOOLS.indexOf(name) >= 0 ? CARET : '') + '</button>';
    }
    function zbtn(key, label, inner, cls) {
        return '<button type="button" class="' + (cls || 'ib sm') + '" data-bz="' + key + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + inner + '</button>';
    }
    function toolbarHTML() {
        return '<div class="board-tools" role="toolbar" aria-label="' + esc(t('board.toolbar')) + '">' +
            '<div class="bt-group">' + ['select', 'connector', 'frame', 'present', 'note'].map(function (n) { return btn(n); }).join('') + '</div>' +
            '<span class="bt-sep" aria-hidden="true"></span>' +
            '<div class="bt-group bt-art">' + ['pen', 'eraser', 'shape', 'text', 'media'].map(function (n) { return btn(n, true); }).join('') + '</div></div>' +
            '<div class="bd-selbar" data-bsel hidden></div>' +
            '<div class="bt-pop" data-bpop hidden></div>' +
            '<div class="bd-present" data-bpresent hidden><button type="button" class="ib" data-bpres="prev" aria-label="' + esc(t('board.prev')) + '">' + D.icon('chev-l') + '</button><span data-bpres-n></span>' +
            '<button type="button" class="ib" data-bpres="next" aria-label="' + esc(t('board.next')) + '">' + D.icon('chev-r') + '</button><button type="button" class="btn btn-ghost sm" data-bpres="exit">' + esc(t('board.exit')) + '</button></div>' +
            '<div class="bd-zoom" data-bzoom role="group" aria-label="' + esc(t('board.zoom')) + '">' +
            zbtn('out', t('board.zoomOut'), '\u2212') +
            zbtn('reset', t('board.zoomReset'), '100%', 'bd-zpct') +
            zbtn('in', t('board.zoomIn'), '+') +
            zbtn('fit', t('board.zoomFit'), D.icon('canvas')) +
            zbtn('full', t('board.fullscreen'), D.icon('expand')) + '</div>' +
            '<input type="file" accept="image/*" hidden data-bfile>';
    }
    function gridHTML() { return '<div class="bd-grid" data-bd-grid aria-hidden="true"></div>'; }
    function layerHTML() {
        return '<svg class="bd" data-bd aria-hidden="true"><g data-bd-under></g><g data-bd-main></g><g data-bd-conn></g><g data-bd-ui></g></svg>';
    }
    /* ---------- option popovers ---------- */
    function swatch(kind, v, on) {
        var bg = v === 'none' ? 'repeating-linear-gradient(45deg,transparent 0 3px,var(--line-strong) 3px 4px)' : col(v);
        return '<button type="button" class="sw-dot' + (on ? ' on' : '') + '" data-bp="' + kind + ':' + v + '" style="background:' + bg + '" aria-label="' + esc(v === 'none' ? t('board.nofill') : v) + '" aria-pressed="' + on + '"></button>';
    }
    function wheelHTML() {
        return '<div class="cw" data-cw><div class="cw-disc" data-cw-disc><i class="cw-knob" data-cw-knob></i></div>' +
            '<div class="cw-side"><label class="cw-v"><span>' + esc(t('board.brightness')) + '</span><input type="range" min="0" max="100" data-cw-v aria-label="' + esc(t('board.brightness')) + '"></label>' +
            '<div class="cw-row"><i class="cw-prev" data-cw-prev></i><input class="cw-hex" data-cw-hex maxlength="7" spellcheck="false" autocomplete="off" aria-label="' + esc(t('board.hex')) + '"></div></div></div>';
    }
    function colorBlock() {
        var list = usesFills() ? FILLS : PALETTE, c = curColor();
        var h = '<div class="bp-row bp-pal">' + list.map(function (v) { return swatch('c', v, c === v); }).join('') +
            '<button type="button" class="sw-dot sw-wheel' + (wheel.open ? ' on' : '') + '" data-bp="wheel:toggle" title="' + esc(t('board.custom')) + '" aria-label="' + esc(t('board.custom')) + '" aria-pressed="' + wheel.open + '"></button></div>';
        if (wheel.open)
            h += wheelHTML();
        if (recent.length)
            h += '<div class="bp-row bp-rec"><span class="bp-cap">' + esc(t('board.recent')) + '</span>' + recent.map(function (v) { return swatch('c', v, c === v); }).join('') + '</div>';
        return h;
    }
    function penIcon(k) {
        var a = { pen: 'stroke-width="2.4"', marker: 'stroke-width="5.5"', highlighter: 'stroke-width="10" stroke-opacity=".4" stroke-linecap="butt"', dashed: 'stroke-width="2.6" stroke-dasharray="6 6"' };
        return '<svg viewBox="0 0 44 22" fill="none" stroke="currentColor" stroke-linecap="round" ' + a[k] + '><path d="M5 15C13 3 19 19 28 10S36 7 39 8"/></svg>';
    }
    function penChips(cur0) {
        return '<div class="bp-row">' + PENS.map(function (k) {
            return '<button type="button" class="bp-k bp-pen' + (cur0 === k ? ' on' : '') + '" data-bp="pentype:' + k + '" title="' + esc(t('board.kind.' + k)) + '" aria-label="' + esc(t('board.kind.' + k)) + '" aria-pressed="' + (cur0 === k) + '">' + penIcon(k) + '</button>';
        }).join('') + '</div>';
    }
    function penPreview(c, w, k, op) {
        var pts = [];
        for (var i = 0; i <= 28; i++)
            pts.push([12 + i * 6, 20 + Math.sin(i / 3.2) * 9]);
        return '<svg class="bp-prev" data-bprev viewBox="0 0 196 40" aria-hidden="true">' + itemSVG({ id: 'pv', type: 'stroke', pts: pts, color: c, width: Math.min(w, 14), kind: k, opacity: op }) + '</svg>';
    }
    function slider(label, key, min, max, step, val, fmt) {
        return '<label class="bp-sl"><span>' + esc(label) + '</span><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" data-sl="' + key + '" aria-label="' + esc(label) + '"><b data-slv="' + key + '">' + fmt(val) + '</b></label>';
    }
    var pct = function (n) { return Math.round(n) + '%'; }, px = function (n) { return String(n); };
    function sizeChips(cur0, key) {
        return '<div class="bp-row">' + TSIZES.map(function (z) {
            return '<button type="button" class="bp-k bp-ts' + (cur0 === z ? ' on' : '') + '" data-bp="tsize:' + z + '" aria-label="' + esc(t('board.size')) + ' ' + z + '" aria-pressed="' + (cur0 === z) + '"><span style="font-size:' + (10 + z / 56 * 14) + 'px">A</span></button>';
        }).join('') + '</div>';
    }
    function styleChips(cur0) {
        return '<div class="bp-row">' + ['straight', 'curve', 'elbow'].map(function (s0) {
            return '<button type="button" class="bp-k bp-wide' + (cur0 === s0 ? ' on' : '') + '" data-bp="cstyle:' + s0 + '" aria-pressed="' + (cur0 === s0) + '">' + esc(t('board.' + s0)) + '</button>';
        }).join('') + '</div>';
    }
    function shapeChips(cur0) {
        var paths = { rect: '<rect x="4" y="5" width="16" height="14" rx="2"/>', ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6.5"/>', triangle: '<path d="M12 4.5l8 14.5H4z"/>', diamond: '<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z"/>' };
        return '<div class="bp-row">' + SHAPES.map(function (k) {
            return '<button type="button" class="bp-k' + (cur0 === k ? ' on' : '') + '" data-bp="kind:' + k + '" title="' + esc(t('board.' + k)) + '" aria-label="' + esc(t('board.' + k)) + '" aria-pressed="' + (cur0 === k) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">' + paths[k] + '</svg></button>';
        }).join('') + '</div>';
    }
    function targetChips() {
        return '<div class="bp-row">' + ['fill', 'border'].map(function (k) {
            return '<button type="button" class="bp-k bp-wide' + (shapeTarget === k ? ' on' : '') + '" data-bp="target:' + k + '" aria-pressed="' + (shapeTarget === k) + '">' + esc(t('board.' + k)) + '</button>';
        }).join('') + '</div>';
    }
    function popHTML(name) {
        if (name === 'pen') {
            return penChips(pen.kind) + penPreview(pen.color, pen.width, pen.kind, pen.opacity) + colorBlock() +
                slider(t('board.width'), 'pen.width', 1, 40, 1, pen.width, px) + slider(t('board.opacity'), 'pen.opacity', 10, 100, 5, Math.round(pen.opacity * 100), pct);
        }
        if (name === 'shape')
            return shapeChips(shapeCfg.kind) + targetChips() + colorBlock() + slider(t('board.borderWidth'), 'shape.bw', 0, 12, 1, shapeCfg.bw, px);
        if (name === 'text')
            return sizeChips(textCfg.size, 'text') + colorBlock();
        if (name === 'connector')
            return styleChips(connCfg.style) + colorBlock() + slider(t('board.width'), 'conn.width', 1, 10, 0.5, connCfg.width, px);
        if (name === 'sel') {
            var it = selItem();
            if (!it)
                return '';
            if (it.type === 'stroke')
                return penChips(it.kind || 'pen') + colorBlock() + slider(t('board.width'), 'sel.width', 1, 40, 1, it.width || 4, px) + slider(t('board.opacity'), 'sel.opacity', 10, 100, 5, Math.round((it.opacity == null ? 1 : it.opacity) * 100), pct);
            if (it.type === 'shape')
                return shapeChips(it.kind) + targetChips() + colorBlock() + slider(t('board.borderWidth'), 'sel.bw', 0, 12, 1, it.bw == null ? 2 : it.bw, px);
            if (it.type === 'text')
                return sizeChips(it.size || 20, 'sel') + colorBlock();
            if (it.type === 'connector')
                return styleChips(it.style || 'curve') + colorBlock() + slider(t('board.width'), 'sel.width', 1, 10, 0.5, it.width || 2.2, px);
        }
        return '';
    }
    function refreshPop() {
        if (!popFor || !cur)
            return;
        var pop = $('[data-bpop]', cur.wrap);
        if (!pop)
            return;
        pop.innerHTML = popHTML(popFor);
        if (wheel.open)
            paintWheel();
        placePop();
    }
    function placePop() {
        var pop = $('[data-bpop]', cur.wrap);
        if (!pop || !popFor)
            return;
        var wr = cur.wrap.getBoundingClientRect();
        if (popFor === 'sel') {
            var bar = $('[data-bsel]', cur.wrap);
            pop.style.bottom = 'auto';
            var below = bar.offsetTop + bar.offsetHeight + 8, ph = pop.offsetHeight;
            var top = below + ph > cur.wrap.clientHeight - 8 ? bar.offsetTop - ph - 8 : below;
            pop.style.top = Math.max(8, top) + 'px';
            pop.style.left = Math.max(pop.offsetWidth / 2 + 8, Math.min(cur.wrap.clientWidth - pop.offsetWidth / 2 - 8, bar.offsetLeft + bar.offsetWidth / 2)) + 'px';
        }
        else {
            var b = $('[data-bt="' + popFor + '"]', cur.wrap);
            if (!b)
                return;
            var br = b.getBoundingClientRect();
            pop.style.top = 'auto';
            pop.style.bottom = '88px';
            pop.style.left = Math.max(pop.offsetWidth / 2 + 8, Math.min(cur.wrap.clientWidth - pop.offsetWidth / 2 - 8, br.left - wr.left + br.width / 2)) + 'px';
        }
    }
    function openPopup(name) {
        var pop = $('[data-bpop]', cur.wrap);
        if (!pop)
            return;
        popFor = name;
        if (name === 'shape' && selItem() === null)
            shapeTarget = shapeTarget || 'fill';
        if (wheel.open)
            syncWheel();
        pop.hidden = false;
        pop.innerHTML = popHTML(name);
        if (wheel.open)
            paintWheel();
        placePop();
    }
    function closePop() { endLive(); popFor = null; var pop = cur && $('[data-bpop]', cur.wrap); if (pop)
        pop.hidden = true; }
    function setTool(name) {
        tool = name;
        closePop();
        if (cur) {
            cur.canvas.dataset.tool = name;
            $$('[data-bt]', cur.wrap).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.bt === name)); });
        }
        if (name !== 'select') {
            sel = null;
            drawSel();
        }
    }
    function onBp(k, v) {
        var forSel = popFor === 'sel';
        if (k === 'c') {
            setColor(v, false);
            endLive();
        }
        else if (k === 'wheel') {
            wheel.open = !wheel.open;
            if (wheel.open)
                syncWheel();
        }
        else if (k === 'target') {
            shapeTarget = v;
            if (wheel.open)
                syncWheel();
        }
        else if (k === 'pentype') {
            if (forSel) {
                editSel(function (it) { it.kind = v; if (v === 'highlighter' && (it.opacity == null || it.opacity === 1))
                    it.opacity = 0.35;
                else if (v !== 'highlighter' && it.opacity === 0.35)
                    it.opacity = 1; });
                endLive();
            }
            else {
                pen.kind = v;
                if (v === 'highlighter' && pen.opacity === 1)
                    pen.opacity = 0.35;
                else if (v !== 'highlighter' && pen.opacity === 0.35)
                    pen.opacity = 1;
            }
        }
        else if (k === 'kind') {
            if (forSel) {
                editSel(function (it) { it.kind = v; });
                endLive();
            }
            else
                shapeCfg.kind = v;
        }
        else if (k === 'tsize') {
            if (forSel) {
                editSel(function (it) { it.size = +v; });
                endLive();
            }
            else
                textCfg.size = +v;
        }
        else if (k === 'cstyle') {
            if (forSel) {
                editSel(function (it) { it.style = v; });
                endLive();
            }
            else
                connCfg.style = v;
        }
        savePrefs();
        refreshPop();
        updateSelBar();
    }
    function onSlider(inp) {
        var key = inp.dataset.sl, v = +inp.value;
        if (key === 'pen.width')
            pen.width = v;
        else if (key === 'pen.opacity')
            pen.opacity = v / 100;
        else if (key === 'shape.bw')
            shapeCfg.bw = v;
        else if (key === 'conn.width')
            connCfg.width = v;
        else if (key === 'sel.width')
            editSel(function (it) { it.width = v; });
        else if (key === 'sel.opacity')
            editSel(function (it) { it.opacity = v / 100; });
        else if (key === 'sel.bw')
            editSel(function (it) { it.bw = v; });
        var lab = $('[data-slv="' + key + '"]', cur.wrap);
        if (lab)
            lab.textContent = /opacity/.test(key) ? pct(v) : String(v);
        var pv = $('[data-bprev]', cur.wrap);
        if (pv && popFor === 'pen')
            pv.outerHTML = penPreview(pen.color, pen.width, pen.kind, pen.opacity);
        savePrefs();
        updateSelBar();
    }
    function onToolbar(e) {
        var tg = e.target;
        var bp = tg.closest('[data-bp]');
        if (bp) {
            var kv = bp.dataset.bp.split(':');
            onBp(kv[0], kv.slice(1).join(':'));
            return;
        }
        var b = tg.closest('[data-bt]');
        if (!b)
            return;
        var name = b.dataset.bt;
        if (name === 'present') {
            startPresent();
            return;
        }
        if (name === 'media') {
            closePop();
            $('[data-bfile]', cur.wrap).click();
            return;
        }
        if (tool === name && POPUP_TOOLS.indexOf(name) >= 0) {
            if (popFor === name)
                closePop();
            else
                openPopup(name);
            return;
        }
        setTool(name);
        if (POPUP_TOOLS.indexOf(name) >= 0)
            openPopup(name);
    }
    /* ---------- selection bar (appears above the selected item) ---------- */
    function updateSelBar() {
        var bar = cur && $('[data-bsel]', cur.wrap);
        if (!bar)
            return;
        var it = sel && tool === 'select' && !presenting && !(drag && (drag.kind === 'move' || drag.kind === 'resize')) ? byId(sel) : null;
        if (!it) {
            bar.hidden = true;
            if (popFor === 'sel')
                closePop();
            return;
        }
        var styled = it.type === 'stroke' || it.type === 'shape' || it.type === 'text' || it.type === 'connector';
        var dot = it.type === 'shape' ? (it.fill === 'none' ? (it.border || 'ink') : it.fill) : (it.color || 'ink');
        function sb(a, label, inner, cls) { return '<button type="button" class="bs ' + (cls || '') + '" data-bsa="' + a + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + inner + '</button>'; }
        bar.innerHTML = (styled ? sb('style', t('board.style'), '<i class="bs-dot" style="background:' + (dot === 'none' ? 'transparent' : col(dot)) + '"></i>') : '') +
            (it.type === 'frame' ? sb('rename', t('board.frameRename'), D.icon('edit')) : '') +
            (it.type !== 'connector' ? sb('dup', t('board.duplicate'), D.icon('copy')) : '') +
            (it.type !== 'connector' && it.type !== 'frame' ? sb('front', t('board.front'), D.icon('layers')) : '') +
            sb('del', t('board.delete'), D.icon('trash'), 'bs-del');
        bar.hidden = false;
        var b = it.type === 'connector' ? (function () { var ps = connPoints(it); var xs = ps.map(function (q) { return q.x; }), ys = ps.map(function (q) { return q.y; }); var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys); return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 }; })() : bbox(it);
        var W = cur.canvas.clientWidth, Hh = cur.canvas.clientHeight, bw = bar.offsetWidth;
        var cx = view.x + (b.x + b.w / 2) * view.k, top = view.y + b.y * view.k - 58;
        if (top < 8)
            top = view.y + (b.y + b.h) * view.k + 16;
        bar.style.left = Math.max(8, Math.min(W - bw - 8, cx - bw / 2)) + 'px';
        bar.style.top = Math.max(8, Math.min(Hh - 140, top)) + 'px';
        if (popFor === 'sel')
            placePop();
    }
    function duplicateSel() {
        var it = selItem();
        if (!it || it.type === 'connector')
            return;
        var c = JSON.parse(JSON.stringify(it));
        c.id = D.uid('bi');
        if (c.pts)
            c.pts = c.pts.map(function (q) { return [q[0] + 28, q[1] + 28]; });
        else {
            c.x += 28;
            c.y += 28;
        }
        commit(function (list) { list.push(c); });
        sel = c.id;
        drawSel();
    }
    function frontSel() {
        var it = selItem();
        if (!it)
            return;
        commit(function (list) { var i = list.indexOf(it); if (i >= 0) {
            list.splice(i, 1);
            list.push(it);
        } });
    }
    function onSelBar(a) {
        if (a === 'style') {
            if (popFor === 'sel')
                closePop();
            else
                openPopup('sel');
        }
        else if (a === 'rename') {
            var it = selItem();
            if (it)
                renameFrame(it);
        }
        else if (a === 'dup')
            duplicateSel();
        else if (a === 'front')
            frontSel();
        else if (a === 'del')
            delSel();
    }
    /* ---------- full screen ---------- */
    function setFull(on) {
        if (!cur)
            return;
        fullMode = on;
        cur.wrap.classList.toggle('bd-full', on);
        var fb = $('[data-bz="full"]', cur.wrap);
        if (fb) {
            var lab = t(on ? 'board.exitFull' : 'board.fullscreen');
            fb.innerHTML = D.icon(on ? 'compress' : 'expand');
            fb.title = lab;
            fb.setAttribute('aria-label', lab);
        }
        if (on) {
            if (cur.wrap.requestFullscreen && !document.fullscreenElement)
                cur.wrap.requestFullscreen().catch(function () { });
        }
        else if (document.fullscreenElement && !presenting && document.exitFullscreen)
            document.exitFullscreen().catch(function () { });
        setTimeout(function () { if (cur) {
            applyView();
            updateSelBar();
        } }, 60);
    }
    /* ---------- text editing ---------- */
    function editText(initial, x, y, size, color, done) {
        var ed = document.createElement('div');
        ed.className = 'bd-edit';
        ed.contentEditable = 'plaintext-only';
        ed.spellcheck = false;
        ed.setAttribute('dir', 'auto');
        ed.style.left = x + 'px';
        ed.style.top = y + 'px';
        ed.style.fontSize = size + 'px';
        ed.style.color = col(color);
        ed.textContent = initial;
        cur.inner.appendChild(ed);
        ed.focus();
        var sel0 = window.getSelection();
        if (sel0) {
            var r = document.createRange();
            r.selectNodeContents(ed);
            sel0.removeAllRanges();
            sel0.addRange(r);
        }
        var finished = false;
        function finish() { if (finished)
            return; finished = true; var v = (ed.innerText || '').replace(/\u00a0/g, ' ').replace(/\n+$/, '').trim(); ed.remove(); done(v); }
        ed.addEventListener('blur', finish);
        ed.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                ed.blur();
            }
        });
    }
    function addText(p) {
        editText('', p.x, p.y, textCfg.size, textCfg.color, function (v) {
            setTool('select');
            if (!v)
                return;
            var id = D.uid('bi');
            commit(function (list) { list.push({ id: id, type: 'text', x: Math.round(p.x), y: Math.round(p.y), text: v, size: textCfg.size, color: textCfg.color }); });
            sel = id;
            drawSel();
        });
    }
    function renameFrame(it) {
        D.ui.prompt({ title: t('board.frameRename'), label: t('board.frameName'), value: it.title || '' }).then(function (v) {
            if (v === null || v === undefined)
                return;
            commit(function () { it.title = v; });
        });
    }
    /* ---------- images ---------- */
    function addImage(file, at) {
        if (!file || !/^image\//.test(file.type))
            return;
        var fr = new FileReader();
        fr.onerror = function () { D.ui.toast({ icon: 'box', title: t('board.imgbad') }); };
        fr.onload = function () {
            var src = String(fr.result), img = new Image();
            img.onerror = function () { D.ui.toast({ icon: 'box', title: t('board.imgbad') }); };
            img.onload = function () {
                var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 1280 / Math.max(w, h));
                var flat = file.type === 'image/svg+xml' || file.type === 'image/gif'; // keep vectors and animations as they are
                if (!flat && (k < 1 || file.size > 900000)) {
                    var c = document.createElement('canvas');
                    c.width = Math.round(w * k);
                    c.height = Math.round(h * k);
                    var g = c.getContext('2d');
                    g.drawImage(img, 0, 0, c.width, c.height);
                    src = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
                }
                if (src.length > 3000000) {
                    D.ui.toast({ icon: 'box', title: t('board.imgbad') });
                    return;
                }
                var dw = Math.min(420, w), dh = Math.round(dw * h / w);
                var mid = toWorld(cur.canvas.clientWidth / 2, cur.canvas.clientHeight / 2), cx = at ? at.x : mid.x, cy = at ? at.y : mid.y;
                var id = D.uid('bi');
                commit(function (list) { list.push({ id: id, type: 'image', x: Math.round(cx - dw / 2), y: Math.round(cy - dh / 2), w: dw, h: dh, src: src }); });
                setTool('select');
                sel = id;
                drawSel();
            };
            img.src = src;
        };
        fr.readAsDataURL(file);
    }
    /* ---------- pointer gestures ---------- */
    function previewSet(html) { var ui = layer('ui'); if (ui)
        ui.innerHTML = html; }
    function refAt(p) {
        var it = topAt(p, 6, function (i) { return i.type === 'connector' || i.type === 'stroke'; });
        if (it)
            return { id: it.id };
        var c = cardAt(p);
        if (c)
            return { page: c.id };
        return { x: Math.round(p.x), y: Math.round(p.y) };
    }
    function refPoint(r) { var b = refBox(r); return b ? center(b) : { x: r.x, y: r.y }; }
    function sameRef(a, b) { return (a.page && a.page === b.page) || (a.id && a.id === b.id); }
    function onDown(e) {
        if (presenting)
            return;
        var tg = e.target;
        if (tg.closest('.bd-edit'))
            return;
        if (e.button === 1 || (e.button === 0 && spaceDown)) {
            startPan(e);
            return;
        }
        if (e.button !== 0)
            return;
        closePop();
        var p = pt(e);
        if (tool === 'select') {
            selectDown(e, p);
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        cur.canvas.setPointerCapture(e.pointerId);
        if (tool === 'text') {
            addText(p);
            drag = null;
            return;
        }
        if (tool === 'note') {
            setTool('select');
            D.notes.create('', { canvas: { x: Math.round(p.x - 130), y: Math.round(p.y - 30) } });
            return;
        }
        if (tool === 'pen')
            drag = { kind: 'pen', pts: [[Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]] };
        else if (tool === 'shape' || tool === 'frame')
            drag = { kind: tool, s: p, c: p };
        else if (tool === 'eraser') {
            drag = { kind: 'eraser', before: snap(), removed: false };
            eraseAt(p);
        }
        else if (tool === 'connector')
            drag = { kind: 'connector', from: refAt(p), c: p };
        if (drag && drag.kind === 'pen')
            previewSet(itemSVG({ id: 'tmp', type: 'stroke', pts: drag.pts, color: pen.color, width: pen.width, kind: pen.kind, opacity: pen.opacity }));
    }
    function startPan(e) {
        e.preventDefault();
        e.stopPropagation();
        closePop();
        cur.canvas.setPointerCapture(e.pointerId);
        cur.canvas.classList.add('panning');
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    }
    function selectDown(e, p) {
        var s = sel ? byId(sel) : null;
        if (s && resizable(s)) {
            var b = bbox(s);
            if (Math.hypot(p.x - (b.x + b.w), p.y - (b.y + b.h)) <= 10 / view.k) {
                startMove(e, s, p, true);
                return;
            }
        }
        var it = topAt(p);
        if (!it) {
            if (sel) {
                sel = null;
                drawSel();
            }
            if (!cardAt(p))
                startPan(e); // empty space pans the board; page cards handle their own drag
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        sel = it.id;
        drawSel();
        if (it.type !== 'connector')
            startMove(e, it, p, false);
    }
    function startMove(e, it, p, resize) {
        e.preventDefault();
        e.stopPropagation();
        cur.canvas.setPointerCapture(e.pointerId);
        var carried = [], cards = [];
        if (!resize && it.type === 'frame') {
            var fb = bbox(it);
            items().forEach(function (o) {
                if (o === it || o.type === 'connector')
                    return;
                var ob = bbox(o);
                if (ob.x >= fb.x && ob.y >= fb.y && ob.x + ob.w <= fb.x + fb.w && ob.y + ob.h <= fb.y + fb.h)
                    carried.push(o);
            });
            $$('[data-cv]', cur.inner).forEach(function (el) {
                var cb = cardBox(el);
                if (cb.x >= fb.x && cb.y >= fb.y && cb.x + cb.w <= fb.x + fb.w && cb.y + cb.h <= fb.y + fb.h)
                    cards.push({ id: el.dataset.cv, el: el, x: cb.x, y: cb.y });
            });
        }
        var members = [it].concat(carried).map(function (o) { return { o: o, x: o.x, y: o.y, pts: o.pts ? o.pts.map(function (q) { return [q[0], q[1]]; }) : null }; });
        drag = { kind: resize ? 'resize' : 'move', it: it, s: p, before: snap(), moved: false, members: members, cards: cards, w: it.w, h: it.h };
    }
    function eraseAt(p) {
        var list = items(), gone = [];
        for (var i = list.length - 1; i >= 0; i--) {
            var it = list[i];
            if (it.type !== 'connector' && hit(it, p, 8) && it.type !== 'frame')
                gone.push(it.id);
        }
        // connectors are only erased directly, so they do not vanish when something next to them is wiped
        list.forEach(function (it2) { if (it2.type === 'connector' && gone.indexOf(it2.id) < 0 && hit(it2, p, 8))
            gone.push(it2.id); });
        if (gone.length) {
            removeItems(gone);
            drag.removed = true;
            redraw();
        }
    }
    function onMove(e) {
        if (!drag || presenting)
            return;
        if (drag.kind === 'pan') {
            setView({ x: drag.vx + e.clientX - drag.sx, y: drag.vy + e.clientY - drag.sy, k: view.k });
            return;
        }
        var p = pt(e), d = drag;
        if (d.kind === 'pen') {
            var l = d.pts[d.pts.length - 1];
            if (Math.hypot(p.x - l[0], p.y - l[1]) >= 2) {
                d.pts.push([Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
                previewSet(itemSVG({ id: 'tmp', type: 'stroke', pts: d.pts, color: pen.color, width: pen.width, kind: pen.kind, opacity: pen.opacity }));
            }
        }
        else if (d.kind === 'shape' || d.kind === 'frame') {
            d.c = p;
            var b = dragBox(d);
            previewSet(d.kind === 'shape' ? itemSVG({ id: 'tmp', type: 'shape', kind: shapeCfg.kind, x: b.x, y: b.y, w: b.w, h: b.h, fill: shapeCfg.fill, border: shapeCfg.border, bw: shapeCfg.bw })
                : itemSVG({ id: 'tmp', type: 'frame', x: b.x, y: b.y, w: b.w, h: b.h, title: '' }));
        }
        else if (d.kind === 'eraser')
            eraseAt(p);
        else if (d.kind === 'connector') {
            d.c = p;
            var a = refPoint(d.from), tgt = refAt(p), tb = refBox(tgt);
            previewSet((tb && !sameRef(tgt, d.from) ? '<rect x="' + (tb.x - 4) + '" y="' + (tb.y - 4) + '" width="' + (tb.w + 8) + '" height="' + (tb.h + 8) + '" rx="8" fill="none" stroke="var(--pine)" stroke-width="2"/>' : '') +
                '<path d="M' + a.x + ' ' + a.y + 'L' + p.x + ' ' + p.y + '" stroke="var(--pine)" stroke-width="2" stroke-dasharray="6 5" fill="none"/>');
        }
        else if (d.kind === 'move' || d.kind === 'resize') {
            var dx = p.x - d.s.x, dy = p.y - d.s.y;
            if (!d.moved && Math.hypot(dx, dy) < 3)
                return;
            d.moved = true;
            if (d.kind === 'resize') {
                var it = d.it;
                if (it.type === 'image') {
                    it.w = Math.max(24, Math.round(d.w + dx));
                    it.h = Math.round(it.w * d.h / d.w);
                }
                else {
                    it.w = Math.max(24, Math.round(d.w + dx));
                    it.h = Math.max(24, Math.round(d.h + dy));
                }
            }
            else {
                d.members.forEach(function (m) {
                    if (m.pts)
                        m.o.pts = m.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; });
                    else {
                        m.o.x = Math.round(m.x + dx);
                        m.o.y = Math.round(m.y + dy);
                    }
                });
                d.cards.forEach(function (c) { c.el.style.left = (c.x + dx) + 'px'; c.el.style.top = (c.y + dy) + 'px'; });
            }
            redraw();
        }
    }
    function dragBox(d) {
        var x = Math.min(d.s.x, d.c.x), y = Math.min(d.s.y, d.c.y);
        return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.abs(d.c.x - d.s.x)), h: Math.round(Math.abs(d.c.y - d.s.y)) };
    }
    function onUp(e) {
        if (!drag)
            return;
        var d = drag;
        drag = null;
        try {
            cur.canvas.releasePointerCapture(e.pointerId);
        }
        catch (err) { /* already released */ }
        if (d.kind === 'pan') {
            cur.canvas.classList.remove('panning');
            return;
        }
        var p = pt(e);
        if (d.kind === 'pen') {
            previewSet('');
            commit(function (list) { list.push({ id: D.uid('bi'), type: 'stroke', pts: d.pts, color: pen.color, width: pen.width, kind: pen.kind, opacity: pen.opacity }); });
        }
        else if (d.kind === 'shape' || d.kind === 'frame') {
            previewSet('');
            var b = dragBox(d), tiny = b.w < 8 && b.h < 8, id = D.uid('bi');
            if (tiny) {
                var dw = d.kind === 'frame' ? 360 : 140, dh = d.kind === 'frame' ? 220 : 100;
                b = { x: Math.round(d.s.x - dw / 2), y: Math.round(d.s.y - dh / 2), w: dw, h: dh };
            }
            b.w = Math.max(b.w, 24);
            b.h = Math.max(b.h, 24);
            if (d.kind === 'shape')
                commit(function (list) { list.push({ id: id, type: 'shape', kind: shapeCfg.kind, x: b.x, y: b.y, w: b.w, h: b.h, fill: shapeCfg.fill, border: shapeCfg.border, bw: shapeCfg.bw }); });
            else {
                var n = items().filter(function (i) { return i.type === 'frame'; }).length + 1;
                commit(function (list) { list.push({ id: id, type: 'frame', x: b.x, y: b.y, w: Math.max(b.w, 120), h: Math.max(b.h, 80), title: t('board.frameN', { n: n }) }); });
            }
            setTool('select');
            sel = id;
            drawSel();
        }
        else if (d.kind === 'eraser') {
            if (d.removed) {
                pushUndo(d.before);
                persist();
            }
        }
        else if (d.kind === 'connector') {
            previewSet('');
            var to = refAt(p);
            if (!sameRef(to, d.from) && Math.hypot(refPoint(to).x - refPoint(d.from).x, refPoint(to).y - refPoint(d.from).y) > 12) {
                commit(function (list) { list.push({ id: D.uid('bi'), type: 'connector', from: d.from, to: to, style: connCfg.style, color: connCfg.color, width: connCfg.width }); });
            }
            redraw();
        }
        else if (d.kind === 'move' || d.kind === 'resize') {
            if (d.moved) {
                pushUndo(d.before);
                D.store.mutate(function (S) {
                    d.cards.forEach(function (c) { var pg = D.store.page(c.id); if (pg)
                        pg.canvas = { x: parseInt(c.el.style.left, 10), y: parseInt(c.el.style.top, 10) }; });
                }, { silent: true });
                redrawConnectors();
            }
        }
    }
    function onDblClick(e) {
        if (tool !== 'select' || presenting || e.target.closest('.bd-edit'))
            return;
        var p = pt(e), it = topAt(p, 6, function (i) { return i.type === 'connector'; });
        if (it && it.type === 'text') {
            e.preventDefault();
            editText(it.text, it.x, it.y, it.size || 20, it.color, function (v) {
                if (v)
                    commit(function () { it.text = v; });
                else {
                    commit(function () { removeItems([it.id]); });
                    sel = null;
                }
            });
            redraw();
        }
        else if (it && it.type === 'frame')
            renameFrame(it);
        else if (!it && !cardAt(p)) {
            e.preventDefault();
            addText(p);
        }
    }
    /* ---------- present ---------- */
    function frames() {
        return items().filter(function (i) { return i.type === 'frame'; }).sort(function (a, b) { return (Math.round(a.y / 40) - Math.round(b.y / 40)) || (a.x - b.x); });
    }
    function startPresent() {
        var fr = frames();
        if (!fr.length) {
            D.ui.toast({ icon: 'box', title: t('board.noframes') });
            return;
        }
        closePop();
        sel = null;
        drawSel();
        presenting = { i: 0, fr: fr, saved: { x: view.x, y: view.y, k: view.k } };
        cur.wrap.classList.add('presenting');
        $('[data-bpresent]', cur.wrap).hidden = false;
        if (cur.wrap.requestFullscreen)
            cur.wrap.requestFullscreen().catch(function () { });
        setTimeout(showFrame, 60);
    }
    function showFrame() {
        if (!presenting || !cur)
            return;
        var f = presenting.fr[presenting.i], W = cur.wrap.clientWidth, H = cur.wrap.clientHeight;
        var k = Math.min(W * 0.92 / f.w, H * 0.88 / f.h);
        // presenting is a temporary camera move: it is not saved as the board's view
        view.k = k;
        view.x = (W - f.w * k) / 2 - f.x * k;
        view.y = (H - f.h * k) / 2 - f.y * k;
        applyView();
        $('[data-bpres-n]', cur.wrap).textContent = D.N(presenting.i + 1) + ' / ' + D.N(presenting.fr.length) + (f.title ? '  \u00b7  ' + f.title : '');
    }
    function stepPresent(by) {
        if (!presenting)
            return;
        presenting.i = Math.max(0, Math.min(presenting.fr.length - 1, presenting.i + by));
        showFrame();
    }
    function stopPresent() {
        if (!presenting || !cur) {
            presenting = null;
            return;
        }
        var saved = presenting.saved;
        presenting = null;
        cur.wrap.classList.remove('presenting');
        $('[data-bpresent]', cur.wrap).hidden = true;
        if (document.fullscreenElement && !fullMode && document.exitFullscreen)
            document.exitFullscreen().catch(function () { });
        setView(saved, false);
    }
    /* ---------- global keys + mount ---------- */
    function bindKeysOnce() {
        if (keysBound)
            return;
        keysBound = true;
        document.addEventListener('keydown', function (e) {
            if (!cur || !cur.wrap.isConnected)
                return;
            var el = e.target;
            if (presenting) {
                if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    stepPresent(1);
                }
                else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    stepPresent(-1);
                }
                else if (e.key === 'Escape')
                    stopPresent();
                return;
            }
            if (e.key === 'Escape' && fullMode && !(el && el.isContentEditable)) {
                e.preventDefault();
                setFull(false);
                return;
            }
            var typing = el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && /^(text|search|number)$/.test(el.type)));
            if (typing)
                return;
            if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (!spaceDown) {
                    spaceDown = true;
                    cur.canvas.classList.add('pan-ready');
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
                e.preventDefault();
                zoomBy(1.25);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault();
                zoomBy(0.8);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                zoomAt(cur.canvas.clientWidth / 2, cur.canvas.clientHeight / 2, 1);
                return;
            }
            if (e.shiftKey && e.key === '!') {
                e.preventDefault();
                fitView();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                undo();
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
                e.preventDefault();
                delSel();
                return;
            }
            if (e.key === 'Escape') {
                if (popFor)
                    closePop();
                else if (tool !== 'select')
                    setTool('select');
                else if (sel) {
                    sel = null;
                    drawSel();
                }
                return;
            }
            if (e.ctrlKey || e.metaKey || e.altKey)
                return;
            var map = { v: 'select', c: 'connector', f: 'frame', p: 'pen', e: 'eraser', s: 'shape', t: 'text' };
            var name = map[e.key.toLowerCase()];
            if (name) {
                e.preventDefault();
                setTool(name);
                if (POPUP_TOOLS.indexOf(name) >= 0)
                    openPopup(name);
            }
        });
        document.addEventListener('keyup', function (e) {
            if (e.key === ' ' && spaceDown) {
                spaceDown = false;
                if (cur)
                    cur.canvas.classList.remove('pan-ready');
            }
        });
        window.addEventListener('blur', function () { spaceDown = false; if (cur)
            cur.canvas.classList.remove('pan-ready'); });
        document.addEventListener('fullscreenchange', function () {
            if (!document.fullscreenElement) {
                if (presenting)
                    stopPresent();
                // a re-render while in full screen swaps the board element; give the new one a moment to re-enter before giving up
                if (fullMode && cur && Date.now() - cur.mountedAt > 600)
                    setFull(false);
            }
            else if (presenting)
                showFrame();
            setTimeout(function () { if (cur) {
                applyView();
                updateSelBar();
            } }, 60);
        });
        window.addEventListener('resize', function () { if (presenting)
            showFrame(); });
    }
    function mount(root) {
        var wrap = $('[data-board]', root);
        if (!wrap) {
            cur = null;
            return;
        }
        var canvas = $('[data-canvas]', wrap), inner = $('.canvas-inner', wrap);
        loadPrefs();
        cur = { root: root, wrap: wrap, canvas: canvas, inner: inner, grid: $('[data-bd-grid]', wrap), mountedAt: Date.now() };
        presenting = null;
        drag = null;
        spaceDown = false;
        bindKeysOnce();
        canvas.dataset.tool = tool;
        // everything listens on the canvas: the world layer ("inner") has no size of its own
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onUp);
        canvas.addEventListener('dblclick', onDblClick);
        canvas.addEventListener('wheel', function (e) {
            if (presenting)
                return;
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) { // pinch on a trackpad also arrives as ctrl+wheel
                var r = canvas.getBoundingClientRect();
                zoomAt(e.clientX - r.left, e.clientY - r.top, view.k * Math.exp(-Math.max(-30, Math.min(30, e.deltaY)) * 0.01)); // capped so one wheel notch is a gentle step
            }
            else {
                var sideways = e.shiftKey && !e.deltaX;
                setView({ x: view.x - (sideways ? e.deltaY : e.deltaX), y: view.y - (sideways ? 0 : e.deltaY), k: view.k });
            }
        }, { passive: false });
        wrap.addEventListener('click', function (e) {
            var tg = e.target, pr = tg.closest('[data-bpres]'), zb = tg.closest('[data-bz]');
            if (pr) {
                var a = pr.dataset.bpres;
                if (a === 'prev')
                    stepPresent(-1);
                else if (a === 'next')
                    stepPresent(1);
                else
                    stopPresent();
                return;
            }
            if (zb) {
                var z = zb.dataset.bz;
                if (z === 'in')
                    zoomBy(1.25);
                else if (z === 'out')
                    zoomBy(0.8);
                else if (z === 'fit')
                    fitView();
                else if (z === 'full')
                    setFull(!fullMode);
                else
                    zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1);
                return;
            }
            var sa = tg.closest('[data-bsa]');
            if (sa) {
                onSelBar(sa.dataset.bsa);
                return;
            }
            if (tg.closest('.board-tools') || tg.closest('[data-bpop]'))
                onToolbar(e);
        });
        // colour wheel (drag on the disc) and sliders / hex field inside the option popovers
        var wheelDrag = null;
        wrap.addEventListener('pointerdown', function (e) {
            var disc = e.target.closest('[data-cw-disc]');
            if (!disc)
                return;
            e.preventDefault();
            wheelDrag = disc;
            disc.setPointerCapture(e.pointerId);
            wheelPick(e, disc);
        });
        wrap.addEventListener('pointermove', function (e) { if (wheelDrag)
            wheelPick(e, wheelDrag); });
        wrap.addEventListener('pointerup', function () {
            if (!wheelDrag)
                return;
            wheelDrag = null;
            addRecent(hsv2hex(wheel.h, wheel.s, wheel.v));
            endLive();
            refreshPop();
        });
        wrap.addEventListener('input', function (e) {
            var inp = e.target;
            if (inp.matches('[data-cw-v]')) {
                wheel.v = +inp.value / 100;
                applyWheel();
            }
            else if (inp.matches('[data-sl]'))
                onSlider(inp);
        });
        wrap.addEventListener('change', function (e) {
            var inp = e.target;
            if (inp.matches('[data-cw-v]')) {
                addRecent(hsv2hex(wheel.h, wheel.s, wheel.v));
                endLive();
                refreshPop();
            }
            else if (inp.matches('[data-sl]'))
                endLive();
            else if (inp.matches('[data-cw-hex]')) {
                var v = inp.value.trim();
                if (v[0] !== '#')
                    v = '#' + v;
                if (isHex(v)) {
                    var o = hex2hsv(v);
                    wheel.h = o.h;
                    wheel.s = o.s;
                    wheel.v = o.v;
                    applyWheel();
                    addRecent(v.toUpperCase());
                    endLive();
                    refreshPop();
                }
                else
                    paintWheel();
            }
        });
        $('[data-bfile]', wrap).addEventListener('change', function (e) {
            var inp = e.target, f = inp.files && inp.files[0];
            if (f)
                addImage(f);
            inp.value = '';
        });
        canvas.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types, function (x) { return x === 'Files'; }))
            e.preventDefault(); });
        canvas.addEventListener('drop', function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f && /^image\//.test(f.type)) {
                e.preventDefault();
                addImage(f, pt(e));
            }
        });
        if (sel && !byId(sel))
            sel = null;
        if (fullMode) {
            wrap.classList.add('bd-full');
            var fb0 = $('[data-bz="full"]', wrap);
            if (fb0)
                fb0.innerHTML = D.icon('compress');
            if (wrap.requestFullscreen && !document.fullscreenElement)
                wrap.requestFullscreen().catch(function () { });
        }
        var saved = D.store.S.board && D.store.S.board.view;
        if (saved && isFinite(saved.k) && isFinite(saved.x) && isFinite(saved.y)) {
            view.x = saved.x;
            view.y = saved.y;
            view.k = Math.max(MINK, Math.min(MAXK, saved.k));
            applyView();
        }
        else
            fitView();
        redraw();
    }
    D.board = {
        toolbarHTML: toolbarHTML, layerHTML: layerHTML, gridHTML: gridHTML, mount: mount, redrawConnectors: redrawConnectors, undo: undo,
        scale: function () { return view.k; }, setFull: setFull, isFull: function () { return fullMode; }, getView: function () { return { x: view.x, y: view.y, k: view.k }; }, setView: setView, fitView: fitView
    };
})();
