"use strict";
/*
  Daheer plant
  ---------------------------------------------------------------
  One houseplant drawing shared by the desk window, the growth cards and the level-up celebration.
  It grows with the level (1-10): a two-leaf sprout, then a fuller plant with veined leaves, then
  flowers and a trailing vine. Local coordinates: the soil line is y = 0, the pot sits below it and
  the plant above it, centred on x = 0.

    D.plantG(stage)    -> SVG markup for a <g> (embed it anywhere and scale/translate it)
    D.plantSVG(stage)  -> a standalone <svg>
*/
(function () {
    'use strict';
    var D = window.D;
    function f(n) { return Math.round(n * 10) / 10; }
    /* a single leaf pointing up from (0,0): two-tone halves, a midrib and side veins */
    function leaf(L, W) {
        var right = 'M0 0C' + f(W * 0.95) + ' ' + f(-L * 0.2) + ' ' + f(W * 0.85) + ' ' + f(-L * 0.74) + ' 0 ' + f(-L);
        var main = right + 'C' + f(-W * 0.85) + ' ' + f(-L * 0.74) + ' ' + f(-W * 0.95) + ' ' + f(-L * 0.2) + ' 0 0Z';
        var shade = 'M0 0C' + f(-W * 0.95) + ' ' + f(-L * 0.2) + ' ' + f(-W * 0.85) + ' ' + f(-L * 0.74) + ' 0 ' + f(-L) + 'Z';
        var veins = '';
        for (var k = 1; k <= 3; k++) {
            var y = -L * (0.22 + k * 0.2), r = W * (0.62 - k * 0.1);
            veins += 'M0 ' + f(y) + 'L' + f(r) + ' ' + f(y - L * 0.13) + 'M0 ' + f(y) + 'L' + f(-r) + ' ' + f(y - L * 0.13);
        }
        return '<path d="' + main + '" style="fill:var(--leaf)"/><path d="' + shade + '" style="fill:var(--leaf2)" opacity=".62"/>' +
            '<path d="M0 -1V' + f(-L * 0.93) + '" stroke="#fff" stroke-opacity=".38" stroke-width="1" stroke-linecap="round" fill="none"/>' +
            '<path d="' + veins + '" stroke="#fff" stroke-opacity=".2" stroke-width=".7" stroke-linecap="round" fill="none"/>';
    }
    function flower(x, y, r, hue) {
        var out = '';
        for (var a = 0; a < 5; a++) {
            var an = (a * 72 + 18) * Math.PI / 180;
            out += '<circle cx="' + f(x + Math.sin(an) * r * 1.1) + '" cy="' + f(y - Math.cos(an) * r * 1.1) + '" r="' + f(r * 0.82) + '" style="fill:' + hue + '"/>';
        }
        return out + '<circle cx="' + x + '" cy="' + y + '" r="' + f(r * 0.55) + '" style="fill:var(--lamp)"/><circle cx="' + f(x - r * 0.15) + '" cy="' + f(y - r * 0.15) + '" r="' + f(r * 0.2) + '" fill="#fff" fill-opacity=".55"/>';
    }
    D.plantG = function (stage) {
        stage = D.clamp(stage || 1, 1, 10);
        var n = Math.min(3 + Math.round(stage * 1.1), 14), reach = 18 + stage * 4.4, i;
        var items = [];
        for (i = 0; i < n; i++) {
            var slot = (i * 0.6180339) % 1, ang = -64 + 128 * slot, tall = 1 - Math.abs(ang) / 118;
            var L = (13 + stage * 2.5) * (0.68 + 0.5 * tall) * (0.9 + ((i * 37) % 7) / 40), W = L * 0.36;
            var S = reach * (0.36 + 0.54 * tall), th = ang * Math.PI / 180;
            var sx = Math.sin(th) * S, sy = -Math.cos(th) * S * 0.96, cx = sx * 0.15, cy = sy * 0.55;
            var rot = ang * 1.12 + (i % 2 ? 6 : -6);
            items.push({
                tall: tall,
                stem: '<path d="M0 0Q' + f(cx) + ' ' + f(cy) + ' ' + f(sx) + ' ' + f(sy) + '" fill="none" style="stroke:var(--leaf2)" stroke-width="' + f(1.6 + stage * 0.12) + '" stroke-linecap="round"/>',
                svg: '<g transform="translate(' + f(sx) + ' ' + f(sy) + ') rotate(' + f(rot) + ')"><g class="z-leaf" style="animation-delay:-' + f((i * 0.83) % 5.5) + 's">' + leaf(L, W) + '</g></g>'
            });
        }
        items.sort(function (a, b) { return a.tall - b.tall; }); // outer leaves first, the tall middle ones on top
        var stems = items.map(function (x) { return x.stem; }).join(''), leaves = items.map(function (x) { return x.svg; }).join('');
        // flowers on their own thin stems
        var blooms = '', fl = stage >= 9 ? 3 : stage >= 6 ? 2 : stage >= 4 ? 1 : 0, spots = [[-12, 1.02], [15, 0.9], [2, 1.12]], hues = ['var(--bloom,#E58B9B)', '#F6C453', 'var(--bloom,#E58B9B)'];
        for (i = 0; i < fl; i++) {
            var fa = spots[i][0] * Math.PI / 180, fh = reach * spots[i][1] + 6, fx = Math.sin(fa) * fh * 0.9, fy = -Math.cos(fa) * fh;
            blooms += '<path d="M0 0Q' + f(fx * 0.2) + ' ' + f(fy * 0.55) + ' ' + f(fx) + ' ' + f(fy) + '" fill="none" style="stroke:var(--leaf2)" stroke-width="1.5" stroke-linecap="round"/>' + flower(f(fx), f(fy), 4.2 - i * 0.3, hues[i]);
        }
        // a trailing vine over the pot rim once the plant is established
        var vine = '';
        if (stage >= 7) {
            vine = '<path d="M-21 4C-35 12-31 27-37 40" fill="none" style="stroke:var(--leaf2)" stroke-width="1.8" stroke-linecap="round"/>';
            [[-30, 14, -30], [-33, 24, 20], [-36, 34, -24]].forEach(function (v) { vine += '<g transform="translate(' + v[0] + ' ' + v[1] + ') rotate(' + v[2] + ')">' + leaf(8, 3.2) + '</g>'; });
        }
        var pot = '<ellipse cx="0" cy="44" rx="33" ry="3.4" fill="#000" opacity=".1"/>' +
            '<ellipse cx="0" cy="1" rx="23" ry="4.5" fill="#4F3526"/><ellipse cx="-9" cy="-.5" rx="4" ry="1.4" fill="#8E7A68"/><ellipse cx="8" cy="0" rx="3" ry="1.1" fill="#9C8B7A"/><ellipse cx="14" cy="-1" rx="2" ry="0.9" fill="#7E6B5A"/>';
        var potFront = '<path d="M-23 7L-19.5 38Q0 43 19.5 38L23 7Z" style="fill:var(--pot)"/>' +
            '<path d="M-23 7L-19.5 38Q-10 40.6 -2 41L-3 7Z" fill="#000" opacity=".07"/>' + // shaded left half
            '<path d="M-17 11L-14.5 33" stroke="#fff" stroke-opacity=".3" stroke-width="3.2" stroke-linecap="round"/>' + // glossy highlight
            '<path d="M-21.6 20H21.6" stroke="#fff" stroke-opacity=".22" stroke-width="1.6"/><path d="M-21 25H21" stroke="#fff" stroke-opacity=".14" stroke-width="1"/>' +
            '<rect x="-27" y="0" width="54" height="9" rx="4.5" style="fill:var(--pot)"/><rect x="-27" y="5.6" width="54" height="3.4" rx="1.7" fill="#000" opacity=".12"/><rect x="-24" y="1.4" width="48" height="2" rx="1" fill="#fff" opacity=".28"/>' +
            '<ellipse cx="0" cy="41" rx="29" ry="4" style="fill:var(--sill)"/><ellipse cx="0" cy="40.2" rx="29" ry="3.2" fill="#fff" opacity=".18"/>';
        return pot + '<g class="z-sway">' + stems + blooms + leaves + '</g>' + potFront + vine;
    };
    D.plantSVG = function (stage) {
        return '<svg viewBox="-72 -128 144 180" aria-hidden="true">' + D.plantG(stage) + '</svg>';
    };
})();
