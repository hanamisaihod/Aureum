# AUREUM — The Aureate Standard

A duo productivity, focus timer, life-log sanctuary, and 100-tier progression web application powered by Firebase, Chart.js, Tailwind CSS, and the Web Audio API.

## Project Structure

```text
Aureum/
├── index.html          # Main application shell (modals, sidebar HUD, 6 workspace tabs)
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
    ├── choreMultiplier.js # Monthly chore-hours → allowance multiplier engine (tiers, monthly breakdown, aggregation)
    ├── effects.js      # HTML5 Canvas particle burst engine, dynamic SVG background patterns, theme/cursor appliers
    ├── audio.js        # Web Audio API synthesizer (12 multi-oscillator tones), mute toggle, desktop notifications
    ├── insights.js     # Aureate Insights synthesis (logs + habit thermostat) and the Horizon bento card renderer
    ├── badges.js       # Relics achievement grid renderer, toast notifications, unlock evaluator
    ├── todos.js        # Scratchpad task list CRUD and Firestore synchronization
    ├── pomodoro.js     # Pomodoro timer engine, hourglass presets, unlogged focus export, spectator sync & 250ms UI loop
    ├── charts.js       # Chart.js analytics (Work Analytics & Sanctuary Trends) and monthly goal gauge
    ├── journal.js      # Two-page Chronicle Journal book reader and daily reflection saving
    ├── horizon.js      # Horizon forecasts: earning trajectory, sweet-spot windows, duration distribution & SVG charts
    ├── ledger.js       # Crucible/Sanctuary logging handlers and filterable History Ledgers
    ├── settings.js     # Forge settings management, status preset picker modal, avatar customization
    └── app.js          # Authentication lifecycle, Duo HUD listeners, personal card thermostat info popup, tab router, and main data loader

tests/
├── chore-multiplier.test.js  # Node test-runner unit tests for tier boundaries & retroactive allowance payouts
├── horizon.test.js           # Forecast math, sweet-spot windows, duration bands & duo merging
└── thermostat.test.js        # 5-state habit thermostat priority waterfall & rolling windows
```

## Horizon Analytics

The **Horizon** tab consolidates every forecast and visualization:

- **Monthly Earning Trajectory** — cumulative actual payout through today plus a dashed projection of base allowance, chore tier and month-end payout at the current daily pace (hard-capped at `monthlyCash × maxBonusCapPct%`).
- **Time-of-Day Sweet Spot** — 24-hour quality/effort bars with peak-clarity and high-strain window callouts.
- **Preferred Focus Duration** — session counts and average quality across `<20m`, `20–35m`, `35–55m`, `55–85m`, and `85m+` bands (Pomodoro history first, work-log durations as fallback).
- **Chronicle Analytics & Aureate Insights** — the relocated Chart.js panels and insight bento cards, scoped by the North / Cream / Duo Combined toggle or the active user.


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

## Monthly Chore → Allowance Multiplier

Every 10 hours of logged chores in the active calendar month unlocks a **+5%** retroactive bonus on the month's entire base work allowance, capped at **Tier 5 (+25% at 50h)**. Chore hours reset automatically on the 1st of each month. The multiplier is derived from logs on every realtime snapshot, so adding, deleting, or editing a chore log recalculates the tier and payout immediately.

## Testing

Unit tests use the built-in Node test runner (Node 18+) and require no dependencies:

```bash
npm test
```
