"use strict";
/* About Daheer dialog. Uses the supplied Arabic artwork when Arabic is active. */
(function () {
    'use strict';
    var D = window.D, t = D.t, esc = D.esc;
    D.about = {
        open: function () {
            var body = document.createElement('div');
            body.className = 'about-body';
            var ar = D.isRTL();
            body.innerHTML =
                '<figure class="about-art" aria-label="' + esc(t('about.artAlt')) + '">' +
                    '<img src="assets/branding/daheer-arabic-about.jpg" alt="' + esc(t('about.artAlt')) + '">' +
                    '</figure>' +
                    '<div class="about-copy" dir="auto">' +
                    '<p class="about-kicker">' + esc(t('about.kicker')) + '</p>' +
                    '<h3>' + esc(t('about.title')) + '</h3>' +
                    '<p>' + esc(t('about.text')) + '</p>' +
                    '<div class="about-meta">' +
                    '<span>' + esc(t('about.version')) + ' 1.0.0</span>' +
                    '<span>' + esc(t('about.stack')) + '</span>' +
                    '</div>' +
                    '</div>';
            D.ui.dialog({
                title: ar ? 'عن ظهير' : 'About Daheer',
                html: body,
                wide: true,
                actions: [{ label: t('common.close'), kind: 'warm', value: true }]
            });
        }
    };
})();
