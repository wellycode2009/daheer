# Daheer — original UI + Arabic support

Daheer is an Electron desktop app (HTML/CSS/vanilla JS). Arabic is a true RTL UI: the document direction is `rtl` and the layout mirrors, while calculator/time surfaces opt back into LTR.

## Arabic

Arabic is translated through the i18n system and uses the Thmanyah fonts installed privately with `npm run prepare:arabic` (see ARABIC-FONTS.md). French, Spanish, Chinese, Japanese and Korean currently cover the app chrome only; other strings fall back to English. Run `npm run check:i18n` to see coverage.

## About Daheer

Settings includes an About Daheer action. The supplied Arabic Daheer artwork is used in the About dialog from `src/assets/branding/daheer-arabic-about.jpg`.

## Development

This is the plain JavaScript edition: renderer code in `src/js/`, Electron main/preload in `electron/`. No build step is needed.

```bash
npm install
npm test            # runs the tests
npm start           # opens the desktop app
```

## Build

```bash
npm run dist
```


## Habit intelligence & data model (v3)

Daheer keeps its local-first JSON store, but the state is now structured for richer analytics. In addition to habits, logs, notes, focus sessions and moods, the store keeps a bounded `events` journal, `adventure` roll history, and an `achievements` map. The event journal is capped at 5,000 events so frequent use does not grow the state without limit.

The habit math module exposes:
- `HM.schoolReport(S, comp, today)` for report-card style scores and per-habit grades.
- `HM.achievementList(comp, saved)` for 25 achievement definitions, with 5 active in the current release.
- `HM.badHabitLoad(S, today)` for a seven-day avoid-habit cost estimate.
- `HM.adventurePick(S, comp, today, seed)` for weighted habit roulette.
- `HM.RECOMMENDED` for the 10 recommended starter habits.

Avoid habits can now have a `badCost` value (default 15 minutes). The Adventure view uses that value to increase the chance of selecting useful habits that are due or have been neglected; it never selects an avoid habit.

## Notes / whiteboard

Notes use a page + board flow. NOTE: the bundled drawing/whiteboard library is not included in this source tree (`src/vendor/` is empty) and `notes.js` strips legacy `sketch` blocks, so drawing is currently unavailable.

## Arabic fonts

Arabic mode uses a true document `dir="rtl"`. Thmanyah Sans, Thmanyah Serif Text, and Thmanyah Serif Display are loaded before the first Arabic paint from your licensed local font installation.

## Tools section (new)

Open **Tools** in the sidebar (or the command palette) for seven small utilities:
Calculator, Sticky Notes, MP3 Player, Video Player (URL or local file), Calendar
(flags perfect-habit days and due notes), Time (clock, stopwatch, countdown timer)
and a PDF Reader. Code lives in `src/js/tools.js`, `src/js/strings-tools.js` and
`src/css/tools.css`. Playlists and loaded files are not saved between sessions;
sticky notes, volume, last video link and timer length are.

The PDF reader uses Chromium's built-in viewer, enabled with `plugins: true` in
`electron/main.js`.

## Notes & Habits additions

- Notes: sidebar search, pin/unpin (pinned notes get their own group), live word count and read time.
- Habits: search box plus "Hide completed" and "Due only" filters above the habit list.


## Board tools (Notes > Board)

A floating toolbar sits at the bottom of the board. Shortcuts work when you are not typing.

| Tool | Key | What it does |
|---|---|---|
| Select | V | Click to select, drag to move, drag the corner dot to resize, Delete to remove. Moving a frame carries everything inside it. Double-click empty space to add text, double-click a frame to rename it. |
| Connector | C | Drag from one card/shape/text/image to another to draw an arrow (straight or curved). Arrows follow their targets. |
| Frame | F | Drag a region. Frames are the slides for Present. |
| Present | | Fullscreen tour of your frames (top to bottom, left to right). Arrow keys / Space to step, Esc to exit. |
| Note | | Click the board to drop a new page card. |
| Pen | P | Freehand drawing with colour and thickness options. |
| Eraser | E | Drag over drawings, shapes, text or images to remove them (page cards are never erased). |
| Shapes | S | Rectangle, ellipse, triangle, diamond with optional fill. |
| Text | T | Click and type. Esc finishes. |
| Image | | Pick a file (or drag one onto the board). Large images are downscaled to 1280 px. |

Ctrl/Cmd+Z undoes board changes (including cards moved with a frame). Board content is saved in the app state (`S.board.items`).
Images are stored inside that state as data URLs, so a board with many large images makes the save file larger.

### Edgeless board
The board is infinite. Drag empty space (or hold Space and drag, or middle-mouse drag) to pan; scroll to pan, Ctrl/Cmd + scroll or trackpad pinch to zoom, Ctrl/Cmd +/-/0 to zoom in/out/reset, Shift+1 to fit everything. The zoom widget (top-right) offers the same. Cards and drawings can sit at any position, including negative coordinates, and the view is remembered.

### Drawing options, colours and full screen
- **Pen** has four kinds (pen, marker, highlighter, dashed), thickness and opacity sliders, a live preview, 15 ready colours plus a **colour wheel**: drag on the disc to pick hue and saturation, use the brightness slider, or type a hex code. Colours you pick with the wheel appear under *Recent*. Your pen, shape, text and connector settings are remembered between sessions.
- **Shapes** have separate Fill and Border colours and a border width. **Text** has five sizes. **Connectors** can be straight, curved or elbow, with colour and thickness.
- **Selection bar:** select anything and a small bar appears above it to recolour/restyle it, duplicate it, bring it to the front or delete it.
- **Full screen:** the expand button at the top-right of the board fills the screen; press **Esc** to leave.
- Stars used as decoration are eight-ray stars (`src/assets/vectors/eight-point-spark-cc0.svg`).

## Time zone and the desk clock
- At first launch the sign-up asks for your time zone the way a Linux installer does: the zone is **detected from the system**, shown first, and you can search any city or country (in your language) to change it. The choice, plus a 12/24-hour style, is saved in settings and can be changed any time from **Settings** or from the **Time** card on the desk.
- The whole app uses that zone: the desk clock, the greeting, the day boundary for habits and streaks, the focus log and the Tools clock all read `D.now()`.
- The Time card uses the **Flowers Kingdom** font. **Its licence says "free for personal use only"** - see `ASSET-LICENSES.md` before distributing the app.
- Code: `src/ts/timezone.ts` (logic and picker), `src/ts/tzdata.ts` (country/zone table generated from the IANA tz database), tests in `test/timezone.test.js`.
