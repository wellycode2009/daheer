"use strict";
/* First-run personalization and language picker. Preferences stay local in D.store. */
(function () {
    'use strict';
    var D = window.D, esc = D.esc;
    var languages = [
        ['en', 'English', 'English'], ['zh', 'Mandarin', '中文'], ['ar', 'Arabic', 'العربية'],
        ['fr', 'French', 'Français'], ['es', 'Spanish', 'Español'], ['ja', 'Japanese', '日本語'], ['ko', 'Korean', '한국어']
    ];
    var copy = {
        en: { kicker: 'Make Daheer yours', title: 'A few gentle questions', sub: 'Set up your space once. Daheer will remember your choices on this device.', name: 'What should I call you?', nameph: 'Your name or nickname', lang: 'Which language would you like to use?', clock: 'Set your clock', clockHint: 'Choose the time style and a reference time for your desk.', look: 'Choose your look', system: 'System', light: 'Day', dark: 'Night', tools: 'What would you like in your toolkit?', finish: 'Save my preferences', serious: 'Are you serious?', invalid: 'Please choose a different name.', saved: 'Your preferences are saved locally.' },
        ar: { kicker: 'اجعل ظهير يشبهك', title: 'بضعة أسئلة لطيفة', sub: 'اضبط مساحتك مرة واحدة. سيتذكر ظهير اختياراتك على هذا الجهاز.', name: 'بماذا تحب أن أناديك؟', nameph: 'اسمك أو لقبك', lang: 'ما اللغة التي تريد استخدامها؟', clock: 'اضبط ساعتك', clockHint: 'اختر تنسيق الوقت ووقتًا مرجعيًا لمكتبك.', look: 'اختر مظهرك', system: 'تلقائي', light: 'نهاري', dark: 'ليلي', tools: 'ما الأدوات التي تريدها؟', finish: 'حفظ تفضيلاتي', serious: 'هل أنت جاد؟', invalid: 'اختر اسمًا مختلفًا.', saved: 'حُفظت تفضيلاتك محليًا.' },
        fr: { kicker: 'Faites de Daheer votre espace', title: 'Quelques questions simples', sub: 'Configurez votre espace une fois. Daheer se souviendra de vos choix sur cet appareil.', name: 'Comment dois-je vous appeler ?', nameph: 'Votre nom ou surnom', lang: 'Quelle langue souhaitez-vous utiliser ?', clock: 'Réglez votre horloge', clockHint: 'Choisissez le format et une heure de référence.', look: 'Choisissez votre apparence', system: 'Système', light: 'Jour', dark: 'Nuit', tools: 'Quels outils voulez-vous ?', finish: 'Enregistrer mes préférences', serious: 'Vous êtes sérieux ?', invalid: 'Choisissez un autre nom.', saved: 'Vos préférences sont enregistrées localement.' },
        es: { kicker: 'Haz Daheer tuyo', title: 'Unas preguntas rápidas', sub: 'Configura tu espacio una vez. Daheer recordará tus elecciones en este dispositivo.', name: '¿Cómo quieres que te llame?', nameph: 'Tu nombre o apodo', lang: '¿Qué idioma quieres usar?', clock: 'Configura tu reloj', clockHint: 'Elige el formato y una hora de referencia.', look: 'Elige tu apariencia', system: 'Sistema', light: 'Día', dark: 'Noche', tools: '¿Qué herramientas quieres?', finish: 'Guardar mis preferencias', serious: '¿En serio?', invalid: 'Elige otro nombre.', saved: 'Tus preferencias se guardaron localmente.' },
        zh: { kicker: '定制你的 Daheer', title: '几个小问题', sub: '只需设置一次，Daheer 会在此设备上记住你的选择。', name: '我应该怎么称呼你？', nameph: '姓名或昵称', lang: '你想使用哪种语言？', clock: '设置时钟', clockHint: '选择时间格式和桌面参考时间。', look: '选择外观', system: '跟随系统', light: '白天', dark: '夜间', tools: '你想要哪些工具？', finish: '保存我的偏好', serious: '你是认真的吗？', invalid: '请换一个名字。', saved: '偏好已保存在本地。' },
        ja: { kicker: 'Daheerをあなたらしく', title: 'いくつか質問があります', sub: '一度設定すれば、この端末に選択を保存します。', name: '何とお呼びすればいいですか？', nameph: '名前またはニックネーム', lang: '使いたい言語は？', clock: '時計を設定', clockHint: '時間形式とデスクの基準時刻を選びます。', look: '見た目を選ぶ', system: 'システム', light: '昼', dark: '夜', tools: '使いたいツールは？', finish: '設定を保存', serious: '本気ですか？', invalid: '別の名前を選んでください。', saved: '設定を端末に保存しました。' },
        ko: { kicker: 'Daheer를 나답게', title: '간단한 질문 몇 가지', sub: '한 번만 설정하면 이 기기에 선택 사항이 저장됩니다.', name: '어떻게 불러드릴까요?', nameph: '이름 또는 별명', lang: '사용할 언어를 선택하세요.', clock: '시계 설정', clockHint: '시간 형식과 데스크 기준 시간을 선택합니다.', look: '화면 분위기 선택', system: '시스템', light: '낮', dark: '밤', tools: '어떤 도구를 원하시나요?', finish: '환경 저장', serious: '진심인가요?', invalid: '다른 이름을 선택해 주세요.', saved: '환경 설정을 이 기기에 저장했습니다.' }
    };
    function words(lang) { return Promise.resolve((D.blocklist && D.blocklist[lang]) || []); }
    function normalize(s) { return String(s || '').toLocaleLowerCase().trim(); }
    // Whole-word match for space-separated scripts (so "Hassan" or "Connor" are not rejected for containing "ass"/"con");
    // substring match only for Chinese/Japanese/Korean, which are written without spaces.
    function isBadName(name, list, lang) {
        var noSpaces = /^(zh|ja|ko)$/.test(lang);
        var tokens = noSpaces ? [] : name.split(/[^\p{L}\p{M}]+/u).filter(Boolean);
        return list.some(function (w) {
            w = normalize(w);
            if (!w)
                return false;
            return noSpaces ? name.indexOf(w) >= 0 : tokens.indexOf(w) >= 0;
        });
    }
    function languageOptions(current) { return languages.map(function (x) { return { label: x[2] + '  ·  ' + x[1], icon: x[0] === current ? 'check' : 'globe', fn: function () { D.changeLanguage(x[0]); } }; }); }
    D.changeLanguage = function (lang) {
        if (!/^(en|ar|fr|es|zh|ja|ko)$/.test(lang))
            lang = 'en';
        if (D.changeLanguageNow)
            return D.changeLanguageNow(lang);
        D.store.mutate(function (S) { S.settings.lang = lang; S.settings.digits = lang === 'ar' ? 'arab' : 'latn'; }, { silent: true });
        if (D.applyLangDigits)
            D.applyLangDigits();
        if (D.refresh)
            D.refresh();
    };
    D.openLanguagePicker = function (anchor) { D.ui.menu(anchor || document.body, languageOptions(D.store.S.settings.lang), { at: 'start' }); };
    function show() {
        var S = D.store.S, lang = S.settings.lang || 'en', c = copy[lang] || copy.en;
        var overlay = document.createElement('div');
        overlay.className = 'personalize-onboard';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        var toolList = [['notes', 'Notes'], ['habits', 'Habits'], ['focus', 'Focus'], ['tools', 'Tools'], ['insights', 'Insights'], ['adventure', 'Adventure']];
        overlay.innerHTML = '<div class="personalize-art"><div class="personalize-orb"><span class="spark-four" aria-hidden="true"></span></div><span class="personalize-spark s1"><span class="spark-four" aria-hidden="true"></span></span><span class="personalize-spark s2"><span class="spark-four" aria-hidden="true"></span></span><span class="personalize-spark s3"><span class="spark-four" aria-hidden="true"></span></span></div>' +
            '<div class="personalize-panel"><p class="eyebrow">' + esc(c.kicker) + '</p><h1>' + esc(c.title) + '</h1><p class="personalize-lead">' + esc(c.sub) + '</p><form class="personalize-form">' +
            '<label class="fld"><span>' + esc(c.name) + '</span><input class="inp" data-on-name autofocus required maxlength="32" placeholder="' + esc(c.nameph) + '" value="' + esc(S.settings.name || '') + '"><small class="name-error" aria-live="polite"></small></label>' +
            '<label class="fld"><span>' + esc(c.lang) + '</span><select class="inp" data-on-lang>' + languages.map(function (x) { return '<option value="' + x[0] + '" ' + (x[0] === lang ? 'selected' : '') + '>' + esc(x[2] + ' · ' + x[1]) + '</option>'; }).join('') + '</select></label>' +
            '<div class="fld"><span>' + esc(c.clock) + '</span><small>' + esc(D.t('tz.onboardHint')) + '</small><div data-on-tz></div><label class="tz-fmt"><span>' + esc(D.t('tz.format')) + '</span><select class="inp" data-on-format><option value="auto">' + esc(c.system) + '</option><option value="12">' + esc(D.t('tz.fmt.12')) + '</option><option value="24">' + esc(D.t('tz.fmt.24')) + '</option></select></label></div>' +
            '<div class="fld"><span>' + esc(c.look) + '</span><div class="seg personalize-seg"><button type="button" data-on-theme="auto" aria-pressed="' + (S.settings.theme === 'auto') + '">' + esc(c.system) + '</button><button type="button" data-on-theme="light" aria-pressed="' + (S.settings.theme === 'light') + '">' + esc(c.light) + '</button><button type="button" data-on-theme="dark" aria-pressed="' + (S.settings.theme === 'dark') + '">' + esc(c.dark) + '</button></div></div>' +
            '<fieldset class="fld"><legend>' + esc(c.tools) + '</legend><div class="personalize-tools">' + toolList.map(function (x) { return '<label><input type="checkbox" data-on-tool="' + x[0] + '" ' + ((S.settings.selectedTools || []).indexOf(x[0]) >= 0 ? 'checked' : '') + '><span>' + esc(D.t('nav.' + x[0])) + '</span></label>'; }).join('') + '</div></fieldset>' +
            '<button class="btn btn-warm personalize-submit" type="submit">' + esc(c.finish) + ' <span>→</span></button><p class="meta">' + esc(c.saved) + '</p></form></div>';
        document.body.appendChild(overlay);
        document.body.classList.add('personalize-open');
        var theme = S.settings.theme || 'auto';
        overlay.querySelector('[data-on-name]').addEventListener('input', function () { overlay.querySelector('.name-error').textContent = ''; }); // clear the message as soon as the person edits the name
        var tzHost = overlay.querySelector('[data-on-tz]');
        D.tz.picker(tzHost, { value: S.settings.tz || D.tz.detected() }); // like a Linux installer: detected first, searchable by city or country
        overlay.querySelectorAll('[data-on-theme]').forEach(function (b) { b.addEventListener('click', function () { theme = b.dataset.onTheme; overlay.querySelectorAll('[data-on-theme]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }); });
        overlay.querySelector('[data-on-lang]').addEventListener('change', function () { lang = this.value; });
        overlay.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            var typed = overlay.querySelector('[data-on-name]').value.trim(), name = normalize(typed), chosen = overlay.querySelector('[data-on-lang]').value, cc = copy[chosen] || copy.en, err = overlay.querySelector('.name-error');
            words(chosen).then(function (list) {
                var bad = isBadName(name, list, chosen);
                if (bad) {
                    err.textContent = cc.serious + ' ' + cc.invalid;
                    overlay.querySelector('[data-on-name]').classList.add('input-wrong');
                    setTimeout(function () { overlay.querySelector('[data-on-name]').classList.remove('input-wrong'); }, 650);
                    return;
                }
                var selected = [];
                overlay.querySelectorAll('[data-on-tool]:checked').forEach(function (x) { selected.push(x.dataset.onTool); });
                D.store.mutate(function (st) { st.settings.name = typed; st.settings.lang = chosen; st.settings.digits = chosen === 'ar' ? 'arab' : 'latn'; st.settings.tz = tzHost.__tz.value; st.settings.clockFormat = overlay.querySelector('[data-on-format]').value; st.settings.theme = theme; st.settings.selectedTools = selected; st.meta.onboarded = true; }, { silent: true });
                overlay.classList.add('out');
                document.body.classList.remove('personalize-open');
                setTimeout(function () { overlay.remove(); if (D.applyTheme)
                    D.applyTheme(); if (D.applyLangDigits)
                    D.applyLangDigits(); if (D.go)
                    D.go('desk'); if (D.paintChrome)
                    D.paintChrome(); }, 220);
            });
        });
        requestAnimationFrame(function () { overlay.classList.add('in'); overlay.querySelector('[data-on-name]').focus(); });
    }
    D.onboarding = { show: show, maybeOpen: function () { if (!D.store.S.meta.onboarded)
            show(); } };
})();
