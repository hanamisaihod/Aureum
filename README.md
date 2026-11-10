# AUREUM — The Aureate Standard

A duo productivity, focus timer, life-log sanctuary, and 100-tier progression web application powered by Firebase, Chart.js, Tailwind CSS, and the Web Audio API.

## Project Structure

```text
Aureum/
├── index.html          # Main application shell (modals, sidebar HUD, 5 workspace tabs)
├── package.json        # Project metadata and local dev server script
├── README.md           # Project documentation
├── assets/
│   └── favicon.svg     # Aureum vector emblem icon
├── css/
│   ├── themes.css      # 10 dual-tone color themes, custom SVG cursors, theme accent utilities
│   └── styles.css      # Core layout, glass/HUD cards, animations, badges, journal book, scrollbars
└── js/
    ├── config.js       # DOM selector helper ($), Firebase initialization, rating & badge catalogs
    ├── state.js        # Shared application state, user settings, and real-time listener handles
    ├── utils.js        # Date/hour formatting, press-and-hold repeaters, right-drag scrolling, rating UI
    ├── effects.js      # HTML5 Canvas particle burst engine, dynamic SVG background patterns, theme/cursor appliers
    ├── audio.js        # Web Audio API synthesizer (12 multi-oscillator tones), mute toggle, desktop notifications
    ├── ranks.js        # 100-tier Aureate Rank system, Lifetime PWR calculator, Rank Progression Roadmap modal
    ├── insights.js     # Real-time Aureate Insights synthesis and auto-cycling sidebar banner
    ├── badges.js       # Relics achievement grid renderer, toast notifications, unlock evaluator
    ├── todos.js        # Scratchpad task list CRUD and Firestore synchronization
    ├── pomodoro.js     # Pomodoro timer engine, hourglass presets, unlogged focus export, spectator sync & 250ms UI loop
    ├── charts.js       # Chart.js analytics (Work Analytics & Sanctuary Trends) and monthly goal gauge
    ├── journal.js      # Two-page Chronicle Journal book reader and daily reflection saving
    ├── ledger.js       # Crucible/Sanctuary logging handlers and filterable History Ledgers
    ├── settings.js     # Forge settings management, status preset picker modal, avatar customization
    └── app.js          # Authentication lifecycle, Duo HUD real-time listeners, tab router, and main data loader
```

## Running Locally

Because Aureum uses standard browser-native HTML, CSS, and JavaScript files with CDN libraries, no build step is required:

1. **Using Node/NPX:**
   ```bash
   npm start
   ```
2. **Using Python:**
   ```bash
   python -m http.server 3000
   ```
3. **Using VS Code:**
   Open `index.html` with the **Live Server** extension, or open `index.html` directly in your browser.
