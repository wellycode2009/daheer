# Local name-safety dictionaries

These small, local dictionaries are loaded by the Electron/web shell to prevent a curse word being saved as the user's display name. They are intentionally kept separate by language so the onboarding check can respect the selected locale without sending personal text anywhere.

Note: the lists now live in `src/ts/blocklist.ts` (embedded, because `fetch()` of local files is blocked by Chromium).
