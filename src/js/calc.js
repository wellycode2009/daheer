"use strict";
/*
  Daheer calculator
  ---------------------------------------------------------------
  A small, safe arithmetic evaluator (+ − × ÷ ^ % parentheses, no eval())
  plus a keypad dialog (D.calc.open()) and a one-line "quick math" reader
  that the Desk capture bar and command palette use: typing "12*4+8%" and
  pressing Enter shows the answer inline instead of searching.
  History is kept in the store so it survives a restart.
*/
(function () {
    'use strict';
    var D = window.D, t = D.t, N = D.N, esc = D.esc, icon = D.icon;
    /* ---------- tiny recursive-descent parser: + - * / % ^ ( ) unary − ---------- */
    function tokenize(src) {
        var s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s+/g, '');
        var toks = [], i = 0, n = s.length;
        while (i < n) {
            var c = s[i];
            if (/[0-9.]/.test(c)) {
                var j = i;
                while (j < n && /[0-9.]/.test(s[j]))
                    j++;
                var raw = s.slice(i, j);
                if ((raw.match(/\./g) || []).length > 1)
                    throw new Error(t('calc.bad'));
                toks.push({ k: 'num', v: parseFloat(raw) });
                i = j;
            }
            else if ('+-*/%^()'.indexOf(c) >= 0) {
                toks.push({ k: c });
                i++;
            }
            else
                throw new Error(t('calc.bad'));
        }
        return toks;
    }
    function parse(toks) {
        var p = 0;
        function peek() { return toks[p]; }
        function eat(k) { var x = toks[p]; if (!x || (k && x.k !== k))
            throw new Error(t('calc.bad')); p++; return x; }
        function expr() { var v = term(); while (peek() && (peek().k === '+' || peek().k === '-')) {
            var op = eat().k;
            v = op === '+' ? v + term() : v - term();
        } return v; }
        function term() { var v = pow(); while (peek() && (peek().k === '*' || peek().k === '/' || peek().k === '%')) {
            var op = eat().k;
            var r = pow();
            if (op === '*')
                v *= r;
            else if (op === '/') {
                if (r === 0)
                    throw new Error(t('calc.div0'));
                v /= r;
            }
            else
                v = v % r;
        } return v; }
        function pow() { var v = unary(); if (peek() && peek().k === '^') {
            eat();
            return Math.pow(v, pow());
        } return v; }
        function unary() { if (peek() && peek().k === '-') {
            eat();
            return -unary();
        } if (peek() && peek().k === '+') {
            eat();
            return unary();
        } return atom(); }
        function atom() {
            var x = peek();
            if (!x)
                throw new Error(t('calc.bad'));
            if (x.k === 'num') {
                eat();
                return x.v;
            }
            if (x.k === '(') {
                eat();
                var v = expr();
                eat(')');
                return v;
            }
            throw new Error(t('calc.bad'));
        }
        var v = expr();
        if (p !== toks.length)
            throw new Error(t('calc.bad'));
        return v;
    }
    function evaluate(src) {
        if (!/^[-+*/^%().,0-9×÷\s]+$/.test(src))
            throw new Error(t('calc.bad'));
        var v = parse(tokenize(src));
        if (!isFinite(v))
            throw new Error(t('calc.inf'));
        return v;
    }
    D.calc = { evaluate: evaluate };
    /* ---------- "quick math": true only for things worth evaluating, e.g. "12*4+8" ---------- */
    D.calc.quick = function (src) {
        var s = (src || '').trim();
        if (!s || !/[0-9]/.test(s) || !/[-+*/^%×÷]/.test(s) || !/^[-+*/^%().,0-9×÷\s]+$/.test(s))
            return null;
        try {
            return evaluate(s);
        }
        catch (e) {
            return null;
        }
    };
    function fmtResult(v) { var r = Math.round(v * 1e10) / 1e10; return N(r); }
    D.calc.fmtResult = fmtResult;
    /* ---------- history (persisted) ---------- */
    function hist() { return D.store.S.meta.calcHistory || []; }
    function pushHist(expr, val) {
        D.store.mutate(function (S) {
            S.meta.calcHistory = S.meta.calcHistory || [];
            S.meta.calcHistory.unshift({ e: expr, v: val, t: Date.now() });
            if (S.meta.calcHistory.length > 30)
                S.meta.calcHistory.length = 30;
        }, { silent: true });
    }
    /* ---------- keypad dialog ---------- */
    var KEYS = [
        ['(', ')', '%', '÷'],
        ['7', '8', '9', '×'],
        ['4', '5', '6', '-'],
        ['1', '2', '3', '+'],
        ['0', '.', '⌫', '=']
    ];
    function open(initial) {
        var body = document.createElement('div');
        body.className = 'calc-tool';
        var expr = initial || '', shownVal = null, err = false;
        function preview() {
            if (!expr)
                return { text: '', ok: true };
            try {
                return { text: fmtResult(evaluate(expr)), ok: true };
            }
            catch (e) {
                return { text: '', ok: false };
            }
        }
        function draw() {
            var p = preview();
            body.innerHTML =
                '<div class="calc-screen' + (err ? ' err' : '') + '"><div class="calc-expr" dir="ltr">' + (esc(expr) || '<span class="ph">0</span>') + '</div><div class="calc-prev" dir="ltr">' + (err ? esc(t('calc.bad')) : (p.ok && p.text !== expr ? '= ' + esc(p.text) : '')) + '</div></div>' +
                    '<div class="calc-pad">' + KEYS.map(function (row) {
                    return row.map(function (k) {
                        var cls = /[0-9.]/.test(k) ? 'num' : k === '=' ? 'eq' : k === '⌫' ? 'del' : 'op';
                        return '<button type="button" class="calc-k ' + cls + '" data-k="' + esc(k) + '">' + esc(k) + '</button>';
                    }).join('');
                }).join('') + '</div>' +
                    (hist().length ? '<div class="calc-hist"><h4 class="sub-h">' + esc(t('calc.history')) + '</h4><ul>' + hist().slice(0, 8).map(function (h) { return '<li data-reuse="' + esc(h.e) + '"><span dir="ltr">' + esc(h.e) + '</span><b dir="ltr">= ' + esc(fmtResult(h.v)) + '</b></li>'; }).join('') + '</ul></div>' : '');
        }
        draw();
        function press(k) {
            err = false;
            if (k === '⌫')
                expr = expr.slice(0, -1);
            else if (k === '=') {
                try {
                    var v = evaluate(expr);
                    pushHist(expr, v);
                    shownVal = v;
                    expr = fmtResult(v);
                }
                catch (e) {
                    err = true;
                }
            }
            else
                expr += k;
            draw();
        }
        body.addEventListener('click', function (e) {
            var b = e.target.closest('[data-k]');
            if (b)
                return press(b.dataset.k);
            var h = e.target.closest('[data-reuse]');
            if (h) {
                expr = h.dataset.reuse;
                err = false;
                draw();
            }
        });
        body.addEventListener('keydown', function (e) {
            if (/^[0-9.+\-*/%^()]$/.test(e.key)) {
                expr += e.key;
                err = false;
                draw();
                e.preventDefault();
            }
            else if (e.key === 'Backspace') {
                expr = expr.slice(0, -1);
                err = false;
                draw();
                e.preventDefault();
            }
            else if (e.key === 'Enter' || e.key === '=') {
                press('=');
                e.preventDefault();
            }
            else if (e.key === 'Escape') {
                e.stopPropagation();
            }
        });
        body.tabIndex = -1;
        return D.ui.dialog({
            title: t('calc.title'), html: body, cls: 'calc-dialog',
            actions: [{ label: t('common.close'), kind: 'ghost', value: true }],
            onOpen: function (box) { body.focus(); }
        });
    }
    D.calc.open = open;
    /* ---------- global shortcut: Ctrl/Cmd + Shift + C ---------- */
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            open();
        }
    });
})();
