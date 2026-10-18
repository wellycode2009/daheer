"use strict";
/* Words that are not accepted as a display name, per language (see data/curse-words/README.md).
   They are embedded here instead of being fetched: Chromium refuses fetch() on file:// pages, which silently disabled the filter. */
(function () {
    'use strict';
    window.D = window.D || {};
    window.D.blocklist = {
        ar: ["كس", "كلب", "حمار", "خنزير", "تباً", "قذر", "شرموط", "زب"],
        en: ["ass", "bastard", "bitch", "bullshit", "crap", "damn", "fuck", "shit", "slut", "whore"],
        es: ["mierda", "joder", "puta", "puto", "cabron", "cabrón", "coño", "gilipollas"],
        fr: ["merde", "putain", "salope", "con", "connard", "bâtard", "bordel"],
        ja: ["くそ", "ばか", "死ね", "ちくしょう", "まぬけ"],
        ko: ["씨발", "병신", "개새끼", "미친놈", "좆"],
        zh: ["操", "妈的", "傻逼", "王八蛋", "混蛋", "他妈的"]
    };
})();
