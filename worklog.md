
2026-10-05 — Decorative star cleanup
- Removed Unicode star glyphs used by the UI onboarding/adventure decorations.
- Replaced them with a CSS clip-path four-point star with four tapered rays.
- Kept the functional plus/add icon unchanged; this is not a decorative cross/star.
- Rechecked all JS files with `node --check` successfully.
- Fixed language switching for all 7 supported languages (en/ar/fr/es/zh/ja/ko), including locale-aware dates/times and a pixel-curtain language transition.
- Routed the language picker through the same transition, with Arabic font loading before the swap and full chrome/nav repaint.
- Added original localized chrome packs for French, Spanish, Mandarin Chinese, Japanese, and Korean; missing deep-copy strings still fall back safely to English.
- Refreshed core SVG UI symbols with smoother rounded vector geometry.
- Replaced the decorative rotated sparkle with a clear four-ray star that is not cross-shaped.
- Added original CC0 vector assets and an asset licensing ledger; added a botanical vector flourish to the onboarding art.
