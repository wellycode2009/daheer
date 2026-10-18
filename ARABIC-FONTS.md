# Arabic fonts (Thmanyah)

Daheer uses the **full Thmanyah family** for Arabic UI text: **Thmanyah Sans**, **Thmanyah Serif Text**, and **Thmanyah Serif Display**, with Light, Regular, Medium, Bold, and Black weights loaded before the Arabic UI is rendered. The provided license allows embedding in a compiled/packaged product but prohibits redistribution of the font software as standalone files. Therefore this source ZIP does not contain the font binaries.

Before running/building on your machine, install your privately downloaded copy:

```bash
npm run prepare:arabic -- "/path/to/Thmanyah-Font-Family.zip"
```

The installer places the original WOFF2 files in `~/.local/share/daheer/thmanyah-fonts/`. Electron reads them through the preload bridge and the renderer creates `FontFace` objects in memory. Arabic font loading completes before the first render, so the UI does not flash into a fallback font.
