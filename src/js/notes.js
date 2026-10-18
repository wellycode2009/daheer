"use strict";
/*
  Daheer notes
  ---------------------------------------------------------------
  A page is: { id, title, tags:[], blocks:[...], due, canvas:{x,y}, links:[pageId],
               archived, created, edited }
  Blocks: paragraph, heading, callout, todo (list of {id,text,done}), table
          (rows of {c0..cn}, first row is header, optional status column),
          habit (embeds a live habit ring), focus (a "start focus, linked here" card).
  Views: a document editor (.doc/.page/.blk...) and a lightweight linked-page board mode
  (.canvas/.cv, draggable, with dashed SVG connector lines between linked pages,
  ported from the original app's drawLinks()).
*/
(function () {
    'use strict';
    var D = window.D, HM = window.HM, t = D.t, N = D.N, esc = D.esc, icon = D.icon, $ = D.$, $$ = D.$$;
    var ST = function () { return D.store.S; };
    /* ---------------- data helpers ---------------- */
    function blank(title) {
        var k = D.store.todayKey();
        return { id: D.uid('p'), title: title || '', tags: [], blocks: [{ id: D.uid('b'), type: 'paragraph', text: '' }], due: null, canvas: null, links: [], pinned: false, archived: false, created: k, edited: Date.now() };
    }
    function touch(p) { p.edited = Date.now(); }
    function create(title, opts) {
        var p = blank(title);
        Object.assign(p, opts || {});
        D.store.mutate(function (S) { S.notes.push(p); });
        D.store.record('note.create', { pageId: p.id });
        return p;
    }
    function remove(id) {
        var p = D.store.page(id);
        if (!p)
            return;
        var snap = JSON.parse(JSON.stringify(p));
        D.store.record('note.delete', { pageId: id });
        D.store.mutate(function (S) { S.notes = S.notes.filter(function (x) { return x.id !== id; }); S.notes.forEach(function (x) { x.links = (x.links || []).filter(function (l) { return l !== id; }); }); if (S.meta.focusPage === id)
            S.meta.focusPage = null; });
        D.ui.toast({ icon: 'trash', title: t('n.deleted'), action: { label: t('common.undo'), fn: function () { D.store.mutate(function (S) { S.notes.push(snap); }); } } });
    }
    function latest() {
        var list = ST().notes.filter(function (p) { return !p.archived; }).sort(function (a, b) { return b.edited - a.edited; });
        return list[0] || null;
    }
    function excerpt(p, len) {
        var text = (p.blocks || []).map(function (b) {
            if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'callout')
                return b.text || '';
            if (b.type === 'todo')
                return (b.items || []).map(function (i) { return i.text; }).join(', ');
            return '';
        }).filter(Boolean).join(' ');
        text = text.trim();
        if (!text)
            return t('n.empty.excerpt');
        return text.length > len ? text.slice(0, len).replace(/\s+\S*$/, '') + '…' : text;
    }
    function nextDue() {
        var today = D.store.today(), best = null;
        ST().notes.forEach(function (p) { if (p.archived || !p.due)
            return; var d = HM.di(p.due); if (d >= today && (!best || d < HM.di(best.due)))
            best = p; });
        return best ? { label: best.title || t('n.untitled'), date: best.due, id: best.id } : null;
    }
    function focusPage() { var id = ST().meta.focusPage; return id ? D.store.page(id) : null; }
    function todoBlock(p, create1) {
        var b = (p.blocks || []).filter(function (x) { return x.type === 'todo'; })[0];
        if (!b && create1) {
            b = { id: D.uid('b'), type: 'todo', items: [] };
            p.blocks.push(b);
        }
        return b;
    }
    function todosOf(p) { var b = todoBlock(p); return b ? b.items : []; }
    function setTodo(pageId, todoId, done) {
        D.store.mutate(function (S) { var p = D.store.page(pageId); if (!p)
            return; var b = todoBlock(p); if (!b)
            return; var it = b.items.filter(function (x) { return x.id === todoId; })[0]; if (it) {
            it.done = done;
            touch(p);
        } }, { silent: true });
    }
    function addTask(text) {
        text = (text || '').trim();
        if (!text)
            return;
        var p = focusPage();
        if (!p) {
            p = create(t('n.tonight'));
            D.store.mutate(function (S) { S.meta.focusPage = p.id; });
        }
        D.store.mutate(function (S) { var pp = D.store.page(p.id); var b = todoBlock(pp, true); b.items.push({ id: D.uid('t'), text: text, done: false }); touch(pp); }, { silent: true });
        var input = $('[data-quick]');
        if (input)
            input.value = '';
        D.sfx('tick');
    }
    function open(id, blockToFocus) { activePage = id; D.go('notes'); if (blockToFocus)
        setTimeout(function () { var el = $('[data-block="' + blockToFocus + '"] [contenteditable]'); if (el)
            el.focus(); }, 30); }
    D.notes = { create: create, remove: remove, latest: latest, excerpt: excerpt, nextDue: nextDue, focusPage: focusPage, todosOf: todosOf, setTodo: setTodo, addTask: addTask, open: open };
    /* ---------------- view state ---------------- */
    var activePage = null, mode = 'doc', slashFor = null;
    function pages() { return ST().notes.filter(function (p) { return !p.archived; }); }
    function migrateLegacySketches() {
        var changed = false;
        ST().notes.forEach(function (p) {
            if (!Array.isArray(p.blocks))
                return;
            var before = p.blocks.length;
            p.blocks = p.blocks.filter(function (b) { return b && b.type !== 'sketch'; });
            if (p.blocks.length !== before) {
                if (!p.blocks.length)
                    p.blocks.push({ id: D.uid('b'), type: 'paragraph', text: '' });
                touch(p);
                changed = true;
            }
        });
        if (changed)
            D.store.flush();
    }
    function ensureActive() { if (activePage && D.store.page(activePage))
        return; var l = latest(); activePage = l ? l.id : null; }
    function groupBy() {
        var list = pages().slice().sort(function (a, b) { return b.edited - a.edited; });
        var pinned = list.filter(function (p) { return p.pinned; }), unpinned = list.filter(function (p) { return !p.pinned; });
        var recent = unpinned.slice(0, 5), rest = unpinned.slice(5), byTag = {};
        rest.forEach(function (p) { var tag = p.tags[0] || t('n.untagged'); (byTag[tag] = byTag[tag] || []).push(p); });
        return { pinned: pinned, recent: recent, byTag: byTag };
    }
    function wcLabel(p) { var w = wordCount(p); return t('n.wordcount', { w: N(w), m: N(Math.max(1, Math.round(w / 200))) }); }
    function wordCount(p) {
        var n = 0;
        (p.blocks || []).forEach(function (b) {
            var txt = (b.text || '') + ' ' + (b.items ? b.items.map(function (i) { return i.text || ''; }).join(' ') : '');
            var m = txt.trim().match(/\S+/g);
            if (m)
                n += m.length;
        });
        return n;
    }
    /* Live sidebar filter: show/hide rows in place so the search box keeps focus while typing. */
    function filterNotes(root, value) {
        var q = (value || '').trim().toLowerCase();
        $$('.nlist .pg', root).forEach(function (b) { b.style.display = (!q || b.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none'; });
        $$('.nlist .grp', root).forEach(function (g) {
            var n = g.nextElementSibling, any = false;
            while (n && !n.classList.contains('grp')) {
                if (n.classList.contains('pg') && n.style.display !== 'none')
                    any = true;
                n = n.nextElementSibling;
            }
            g.style.display = (!q || any) ? '' : 'none';
        });
    }
    /* ---------------- sidebar ---------------- */
    function sidebarHTML() {
        var g = groupBy(), rows = function (list) { return list.map(rowHTML).join(''); };
        function rowHTML(p) { return '<button class="pg' + (p.id === activePage && mode === 'doc' ? ' on' : '') + '" data-open="' + esc(p.id) + '">' + icon('page') + '<span>' + esc(p.title || t('n.untitled')) + '</span></button>'; }
        var body = g.pinned.length ? '<div class="grp">' + esc(t('n.pinned')) + '</div>' + rows(g.pinned) : '';
        body += '<div class="grp">' + esc(t('n.recent')) + '</div>' + (g.recent.length ? rows(g.recent) : '<p class="meta gpad">' + esc(t('n.norecent')) + '</p>');
        Object.keys(g.byTag).sort().forEach(function (tag) { body += '<div class="grp">' + esc(tag) + '</div>' + rows(g.byTag[tag]); });
        return '<aside class="nlist"><div class="ws"><span class="av">' + icon('notes') + '</span><span>' + esc(ST().meta.workspace || t('d.ws')) + '</span></div>' +
            '<div class="seg wide"><button data-mode="doc" aria-pressed="' + (mode === 'doc') + '">' + icon('page') + esc(t('n.doc')) + '</button><button data-mode="canvas" aria-pressed="' + (mode === 'canvas') + '">' + icon('canvas') + esc(t('n.canvas')) + '</button></div>' +
            '<input class="inp sm nsearch" type="search" data-nsearch placeholder="' + esc(t('n.search')) + '" aria-label="' + esc(t('n.search')) + '">' +
            '<div class="note-actions"><button class="btn btn-ghost sm" data-n="new">' + icon('plus') + esc(t('n.new')) + '</button></div>' + body + '</aside>';
    }
    /* ---------------- block rendering ---------------- */
    function ringMini(p) { var c = 2 * Math.PI * 18; return '<svg class="ringmini" viewBox="0 0 46 46" aria-hidden="true"><circle class="t" cx="23" cy="23" r="18"/><circle class="p" cx="23" cy="23" r="18" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '" transform="rotate(-90 23 23)"/></svg>'; }
    function blockHTML(p, b) {
        if (b.type === 'heading')
            return '<div class="blk" data-block="' + b.id + '"><h2 contenteditable="plaintext-only" spellcheck="false" data-txt dir="auto">' + esc(b.text) + '</h2></div>';
        if (b.type === 'callout')
            return '<div class="blk" data-block="' + b.id + '"><div class="callout">' + icon('leaf') + '<p contenteditable="plaintext-only" spellcheck="false" data-txt dir="auto">' + esc(b.text) + '</p></div></div>';
        if (b.type === 'todo')
            return '<div class="blk" data-block="' + b.id + '">' + (b.items || []).map(function (it) { return '<label class="chk"><input type="checkbox" data-todo="' + it.id + '"' + (it.done ? ' checked' : '') + '><span contenteditable="plaintext-only" spellcheck="false" data-todo-txt="' + it.id + '" dir="auto">' + esc(it.text) + '</span></label>'; }).join('') + '<button class="addline" data-add-todo>' + icon('plus') + esc(t('n.addtodo')) + '</button></div>';
        if (b.type === 'table') {
            var rows = b.rows || [['', ''], ['', '']];
            return '<div class="blk" data-block="' + b.id + '"><div class="tbl-wrap"><table class="tbl"><thead><tr>' + rows[0].map(function (c, i) { return '<th contenteditable="plaintext-only" spellcheck="false" data-cell="0:' + i + '" dir="auto">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.slice(1).map(function (r, ri) { return '<tr>' + r.map(function (c, ci) { return b.status && ci === r.length - 1 ? '<td><button class="st ' + (c === 'ok' ? 'ok' : 're') + '" data-status="' + (ri + 1) + '">' + esc(c === 'ok' ? t('n.ok') : t('n.review')) + '</button></td>' : '<td contenteditable="plaintext-only" spellcheck="false" data-cell="' + (ri + 1) + ':' + ci + '" dir="auto">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div><button class="addline" data-add-row>' + icon('plus') + esc(t('n.addrow')) + '</button></div>';
        }
        if (b.type === 'habit') {
            var h = D.store.habit(b.habitId), c = h && D.store.comp().habits[h.id];
            if (!h)
                return '<div class="blk" data-block="' + b.id + '"><p class="meta">' + esc(t('n.gone')) + '</p></div>';
            return '<div class="blk" data-block="' + b.id + '"><div class="inline">' + ringMini(c.strength) + '<div class="grow"><b>' + esc(h.name) + '</b><span class="meta">' + esc(t('h.streakd', { n: c.streak })) + ' · ' + D.pct(c.r30) + '</span></div><button class="btn btn-ghost sm" data-open-habit="' + esc(h.id) + '">' + esc(t('common.open')) + '</button></div></div>';
        }
        if (b.type === 'focus')
            return '<div class="blk" data-block="' + b.id + '"><div class="inline"><span class="i">' + icon('timer') + '</span><div class="grow"><b>' + esc(t('n.focusblock')) + '</b><span class="meta">' + esc(t('u.min', { n: ST().settings.focus.focus })) + '</span></div><button class="btn btn-warm sm" data-start-focus="' + esc(p.id) + '">' + icon('play', 'i-fill') + esc(t('d.start')) + '</button></div></div>';
        return '<div class="blk" data-block="' + b.id + '"><p contenteditable="plaintext-only" spellcheck="false" data-txt dir="auto">' + esc(b.text) + '</p></div>';
    }
    var SLASH = [
        { k: 'paragraph', label: 'n.b.text', icon: 'page' }, { k: 'heading', label: 'n.b.heading', icon: 'page' }, { k: 'callout', label: 'n.b.callout', icon: 'leaf' },
        { k: 'todo', label: 'n.b.todo', icon: 'check' }, { k: 'table', label: 'n.b.table', icon: 'table' }, { k: 'habit', label: 'n.b.habit', icon: 'sprout' },
        { k: 'focus', label: 'n.b.focus', icon: 'timer' }
    ];
    function newBlock(kind) {
        if (kind === 'todo')
            return { id: D.uid('b'), type: 'todo', items: [{ id: D.uid('t'), text: '', done: false }] };
        if (kind === 'table')
            return { id: D.uid('b'), type: 'table', rows: [['', ''], ['', '']] };
        if (kind === 'habit')
            return { id: D.uid('b'), type: 'habit', habitId: (D.store.activeHabits()[0] || {}).id || null };
        if (kind === 'focus')
            return { id: D.uid('b'), type: 'focus' };
        return { id: D.uid('b'), type: kind, text: '' };
    }
    /* ---------------- document view ---------------- */
    function docHTML(p) {
        var due = p.due ? '<span class="due">' + icon('timer') + esc(D.relDay(p.due)) + '</span>' : '';
        var link = ST().meta.focusPage === p.id ? '<span class="tag on">' + esc(t('n.linked')) + '</span>' : '';
        return '<div class="doc"><div class="dbar"><span class="crumb"><b>' + esc(p.title || t('n.untitled')) + '</b></span><div class="row-r"><button class="ib" data-p="pin" aria-label="' + esc(t(p.pinned ? 'n.unpin' : 'n.pin')) + '" aria-pressed="' + (!!p.pinned) + '">' + icon('pin') + '</button><button class="ib" data-p="link" aria-label="' + esc(t('n.link')) + '" aria-pressed="' + (ST().meta.focusPage === p.id) + '">' + icon('link') + '</button><button class="ib" data-p="due" aria-label="' + esc(t('n.setdue')) + '">' + icon('timer') + '</button><button class="ib" data-p="more" aria-label="' + esc(t('common.more')) + '">' + icon('more') + '</button></div></div>' +
            '<div class="page"><h1 class="title" contenteditable="plaintext-only" spellcheck="false" data-title data-ph="' + esc(t('n.untitled')) + '" dir="auto">' + esc(p.title) + '</h1>' +
            '<div class="props"><span data-p="tags">' + (p.tags.length ? p.tags.map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join(' ') : '<button class="addline sm" data-p="addtag">' + icon('plus') + esc(t('n.addtag')) + '</button>') + '</span>' + due + link + '<span class="meta">' + esc(t('n.edited', { when: D.ago(p.edited) })) + '</span><span class="meta" data-wc>' + esc(wcLabel(p)) + '</span></div>' +
            p.blocks.map(function (b) { return blockHTML(p, b); }).join('') +
            '<button class="addline" data-p="addblock">' + icon('plus') + esc(t('n.addblock')) + '</button>' +
            '<div class="slash' + (slashFor ? ' open' : '') + '" data-slash>' + SLASH.map(function (s) { return '<button data-add="' + s.k + '">' + icon(s.icon) + '<span>' + esc(t(s.label)) + '<small>' + esc(t(s.label + '.d')) + '</small></span></button>'; }).join('') + '</div>' +
            '</div></div>';
    }
    /* ---------------- canvas / board mode ---------------- */
    function canvasHTML() {
        var list = pages();
        list.forEach(function (p, i) { if (!p.canvas)
            p.canvas = { x: 40 + (i % 3) * 300, y: 40 + Math.floor(i / 3) * 220 }; });
        var cards = list.map(function (p) {
            var todos = todosOf(p), done = todos.filter(function (x) { return x.done; }).length;
            return '<div class="cv" data-cv="' + esc(p.id) + '" style="left:' + p.canvas.x + 'px;top:' + p.canvas.y + 'px;background:var(--paper);width:260px" tabindex="0">' +
                '<h3>' + esc(p.title || t('n.untitled')) + '</h3><p class="meta">' + esc(excerpt(p, 90)) + '</p>' +
                (todos.length ? '<div class="row2"><span>' + esc(t('n.tasks')) + '</span><span>' + N(done) + '/' + N(todos.length) + '</span></div>' : '') +
                '<div class="row2"><span>' + esc(t('n.edited', { when: D.ago(p.edited) })) + '</span><button class="ib sm" data-open="' + esc(p.id) + '">' + icon('page') + '</button></div></div>';
        }).join('');
        return '<div class="board-main"><div class="board-wrap" data-board><div class="canvas" data-canvas data-tool="select">' + D.board.gridHTML() + '<div class="canvas-inner"><svg class="links" data-links></svg>' + cards + D.board.layerHTML() + '</div></div>' + D.board.toolbarHTML() + '</div><p class="hint">' + esc(t('n.canvas.hint')) + '</p></div>';
    }
    function drawLinks(root) {
        var host = $('[data-canvas]', root);
        if (!host)
            return;
        var svg = $('[data-links]', root), inner = $('.canvas-inner', root);
        if (!svg || !inner)
            return;
        var d = '';
        pages().forEach(function (p) {
            (p.links || []).forEach(function (lid) {
                var a = $('[data-cv="' + p.id + '"]', root), b = $('[data-cv="' + lid + '"]', root);
                if (!a || !b)
                    return;
                var x1 = a.offsetLeft + a.offsetWidth / 2, y1 = a.offsetTop + a.offsetHeight / 2, x2 = b.offsetLeft + b.offsetWidth / 2, y2 = b.offsetTop + b.offsetHeight / 2;
                d += 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'Q' + ((x1 + x2) / 2).toFixed(1) + ' ' + (Math.min(y1, y2) - 30) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' ';
            });
        });
        svg.innerHTML = d ? '<path d="' + d + '"/>' : '';
        if (D.board)
            D.board.redrawConnectors(root);
    }
    /* ---------------- drag (pointer events) ---------------- */
    function bindDrag(root) {
        var drag = null;
        root.addEventListener('pointerdown', function (e) {
            var cv = e.target.closest('.cv');
            if (!cv || e.target.closest('button,[contenteditable]') || e.button !== 0)
                return;
            var id = cv.dataset.cv, p = D.store.page(id);
            if (!p)
                return;
            drag = { id: id, sx: e.clientX, sy: e.clientY, ox: p.canvas.x, oy: p.canvas.y, el: cv, k: (D.board && D.board.scale()) || 1 };
            cv.classList.add('drag');
            cv.setPointerCapture(e.pointerId);
        });
        root.addEventListener('pointermove', function (e) {
            if (!drag)
                return;
            var dx = (e.clientX - drag.sx) / drag.k, dy = (e.clientY - drag.sy) / drag.k;
            drag.el.style.left = (drag.ox + dx) + 'px';
            drag.el.style.top = (drag.oy + dy) + 'px';
            drawLinks(root);
        });
        function end(e) {
            if (!drag)
                return;
            var nx = drag.ox + (e.clientX - drag.sx) / drag.k, ny = drag.oy + (e.clientY - drag.sy) / drag.k;
            D.store.mutate(function (S) { var p = D.store.page(drag.id); if (p)
                p.canvas = { x: Math.round(nx), y: Math.round(ny) }; }, { silent: true });
            drag.el.classList.remove('drag');
            drag = null;
        }
        root.addEventListener('pointerup', end);
        root.addEventListener('pointercancel', end);
    }
    /* The board's drawing tools live in board.ts (toolbar, pen, shapes, frames, connectors, images, present). */
    /* ---------------- render + bind ---------------- */
    function render(root) {
        migrateLegacySketches();
        ensureActive();
        var p = activePage ? D.store.page(activePage) : null;
        var main = mode === 'canvas' ? canvasHTML() : (p ? docHTML(p) : '<div class="doc"><section class="card c-paper empty-card"><div class="empty-art">' + icon('notes') + '</div><h3>' + esc(t('n.empty.t')) + '</h3><p class="meta">' + esc(t('n.empty.p')) + '</p><button class="btn" data-n="new">' + icon('plus') + esc(t('n.new')) + '</button></section></div>');
        root.innerHTML = '<div class="notes">' + sidebarHTML() + main + '</div>';
        if (mode === 'canvas') {
            drawLinks(root);
            D.board.mount(root);
        }
    }
    function bind(root) {
        if (root.dataset.notesBound)
            return;
        root.dataset.notesBound = '1';
        bindDrag(root);
        root.addEventListener('click', function (e) {
            var op = e.target.closest('[data-open]');
            if (op) {
                activePage = op.dataset.open;
                mode = 'doc';
                D.refresh();
                return;
            }
            var md = e.target.closest('[data-mode]');
            if (md) {
                mode = md.dataset.mode;
                slashFor = null;
                D.refresh();
                return;
            }
            var nb = e.target.closest('[data-n="new"]');
            if (nb) {
                var p = create('');
                activePage = p.id;
                mode = 'doc';
                D.refresh();
                setTimeout(function () { var el = $('.title', root); if (el)
                    el.focus(); }, 20);
                return;
            }
            var pact = e.target.closest('[data-p]');
            if (pact) {
                var a = pact.dataset.p, pg = D.store.page(activePage);
                if (!pg)
                    return;
                if (a === 'pin') {
                    D.store.mutate(function (S) { var pp = D.store.page(pg.id); pp.pinned = !pp.pinned; }, { silent: true });
                    D.refresh();
                }
                else if (a === 'link') {
                    D.store.mutate(function (S) { S.meta.focusPage = S.meta.focusPage === pg.id ? null : pg.id; }, { silent: true });
                    D.refresh();
                }
                else if (a === 'due')
                    D.ui.prompt({ title: t('n.setdue'), label: t('n.setdue.p'), value: pg.due || D.store.todayKey(), placeholder: 'YYYY-MM-DD' }).then(function (v) { if (v === null)
                        return; D.store.mutate(function (S) { var pp = D.store.page(pg.id); pp.due = v || null; touch(pp); }, { silent: true }); D.refresh(); });
                else if (a === 'addtag')
                    D.ui.prompt({ title: t('n.addtag'), label: t('n.tagname') }).then(function (v) { if (!v)
                        return; D.store.mutate(function (S) { var pp = D.store.page(pg.id); pp.tags.push(v); touch(pp); }, { silent: true }); D.refresh(); });
                else if (a === 'addblock') {
                    slashFor = pg.id;
                    D.refresh();
                    setTimeout(function () { var s = $('[data-slash]', root); s && s.classList.add('open'); }, 0);
                }
                else if (a === 'more')
                    D.ui.menu(pact, [
                        { label: t('n.archive'), icon: 'box', fn: function () { D.store.mutate(function (S) { D.store.page(pg.id).archived = true; }); activePage = null; D.refresh(); D.ui.toast({ icon: 'box', title: t('n.archived') }); } },
                        { label: t('common.delete'), icon: 'trash', danger: true, fn: function () { D.ui.confirm({ title: t('n.delq', { name: pg.title || t('n.untitled') }), ok: t('common.delete'), danger: true }).then(function (ok) { if (ok) {
                                remove(pg.id);
                                activePage = null;
                                D.refresh();
                            } }); } }
                    ], { at: 'end' });
                return;
            }
            var add = e.target.closest('[data-add]');
            if (add) {
                var pg2 = D.store.page(activePage);
                D.store.mutate(function (S) { var p2 = D.store.page(pg2.id); p2.blocks.push(newBlock(add.dataset.add)); touch(p2); }, { silent: true });
                slashFor = null;
                D.refresh();
                return;
            }
            var at = e.target.closest('[data-add-todo]');
            if (at) {
                var pg3 = D.store.page(activePage);
                D.store.mutate(function (S) { var p3 = D.store.page(pg3.id); todoBlock(p3, true).items.push({ id: D.uid('t'), text: '', done: false }); touch(p3); }, { silent: true });
                D.refresh();
                return;
            }
            var ar = e.target.closest('[data-add-row]');
            if (ar) {
                var blk = e.target.closest('[data-block]').dataset.block, pg4 = D.store.page(activePage);
                D.store.mutate(function (S) { var p4 = D.store.page(pg4.id); var b = p4.blocks.filter(function (x) { return x.id === blk; })[0]; b.rows.push(b.rows[0].map(function () { return ''; })); touch(p4); }, { silent: true });
                D.refresh();
                return;
            }
            var stb = e.target.closest('[data-status]');
            if (stb) {
                var blk2 = e.target.closest('[data-block]').dataset.block, pg5 = D.store.page(activePage), ri = +stb.dataset.status;
                D.store.mutate(function (S) { var p5 = D.store.page(pg5.id); var b = p5.blocks.filter(function (x) { return x.id === blk2; })[0]; var c = b.rows[ri].length - 1; b.rows[ri][c] = b.rows[ri][c] === 'ok' ? 're' : 'ok'; touch(p5); }, { silent: true });
                D.refresh();
                return;
            }
            var oh = e.target.closest('[data-open-habit]');
            if (oh)
                return D.habits.openDetail(oh.dataset.openHabit);
            var sf = e.target.closest('[data-start-focus]');
            if (sf)
                return D.focus.startFor(sf.dataset.startFocus);
            if (mode === 'canvas' && e.target.closest('.canvas') === $('.canvas', root) && e.target.classList.contains('canvas')) { /* empty area click: no-op */ }
            if (!e.target.closest('.slash') && !e.target.closest('[data-p="addblock"]')) {
                var s = $('[data-slash]', root);
                if (s)
                    s.classList.remove('open');
                slashFor = null;
            }
        });
        root.addEventListener('input', function (e) {
            if (e.target.matches('[data-nsearch]')) {
                filterNotes(root, e.target.value);
                return;
            }
            var pg = D.store.page(activePage);
            if (!pg)
                return;
            if (e.target.closest('.doc')) {
                var wc = $('[data-wc]', root);
                if (wc)
                    setTimeout(function () { var cur = D.store.page(pg.id); if (cur && wc.isConnected)
                        wc.textContent = wcLabel(cur); }, 0);
            }
            if (e.target.matches('[data-title]'))
                D.store.mutate(function (S) { var p = D.store.page(pg.id); p.title = e.target.textContent; touch(p); }, { silent: true });
            else if (e.target.matches('[data-txt]')) {
                var blk = e.target.closest('[data-block]').dataset.block;
                D.store.mutate(function (S) { var p = D.store.page(pg.id); p.blocks.filter(function (x) { return x.id === blk; })[0].text = e.target.textContent; touch(p); }, { silent: true });
            }
            else if (e.target.matches('[data-todo-txt]')) {
                var blk2 = e.target.closest('[data-block]').dataset.block, tid = e.target.dataset.todoTxt;
                D.store.mutate(function (S) { var p = D.store.page(pg.id); var b = p.blocks.filter(function (x) { return x.id === blk2; })[0]; b.items.filter(function (x) { return x.id === tid; })[0].text = e.target.textContent; touch(p); }, { silent: true });
            }
            else if (e.target.matches('[data-cell]')) {
                var blk3 = e.target.closest('[data-block]').dataset.block, rc = e.target.dataset.cell.split(':').map(Number);
                D.store.mutate(function (S) { var p = D.store.page(pg.id); var b = p.blocks.filter(function (x) { return x.id === blk3; })[0]; b.rows[rc[0]][rc[1]] = e.target.textContent; touch(p); }, { silent: true });
            }
        });
        root.addEventListener('change', function (e) { if (e.target.matches('[data-todo]'))
            setTodo(activePage, e.target.dataset.todo, e.target.checked); });
        root.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.matches('[data-title],[data-txt],[data-todo-txt],[data-cell]')) {
                e.preventDefault();
                e.target.blur();
            }
            if (e.key === '/' && e.target.matches('[data-txt]') && !e.target.textContent.trim()) {
                e.preventDefault();
                slashFor = activePage;
                setTimeout(function () { var s = $('[data-slash]', root); if (s) {
                    s.classList.add('open');
                    s.dataset.filter = '';
                    var b = s.querySelector('button');
                    if (b)
                        b.focus();
                } }, 0);
            }
            if (e.key === 'Escape') {
                var s2 = $('[data-slash]', root);
                if (s2)
                    s2.classList.remove('open');
                slashFor = null;
            }
        });
        window.addEventListener('resize', function () { if (mode === 'canvas' && root.isConnected)
            drawLinks(root); });
    }
    D.notes.render = function (root) { bind(root); render(root); };
    D.notes.bind = bind;
})();
