# Site Visitor Log

A installable, offline-first PWA for a site security gatehouse: log visitor
entry/exit against a settable shift period, track contractor inductions with
a green/amber/red archive, get quick-pick autocomplete for regular visitors,
and export a daily occurrence sheet to PDF — with a hidden, machine-readable
copy of the day's data embedded invisibly in the PDF itself.

Everything runs entirely on-device. There is no server, no account, and no
data ever leaves the phone/tablet/PC it's used on — all records are stored
locally in the browser's IndexedDB.

## What's included

- **Tracker** — set a shift's start/end period (e.g. 05:00–13:00), then log
  each visitor's time in, time out, company/representative, vehicle
  registration, and reason for visit. Switch between **General** and
  **Contractor** entry; contractor entries add a required **Site contact /
  escort** field. You can run multiple sheets (e.g. one per shift) and
  switch or edit their period at any time.
- **Contractors** — an editable archive of contractors that need yearly
  inductions, with a colour status: green (valid), amber (expiring soon),
  red (induction needed or expired). "Mark induction completed today"
  renews it in one tap. Every contractor entry logged on the Tracker links
  back here automatically, so each contractor's card shows a full visit
  history.
- **Visitors** — a directory of recognised regular visitors (e.g. delivery
  drivers) with one or more vehicle registrations each.
- **Autocomplete** — start typing a name on the Tracker form and any
  matching recognised visitor or contractor appears, one row per vehicle,
  for one-tap fill of name + vehicle reg. If you log someone new, the app
  offers to save them to the right list afterwards.
- **Export** — turn any day's sheet into a PDF: a printable occurrence
  sheet, a contractor induction status table, and a recognised-visitors
  table. The PDF also carries an invisible text layer (real PDF "invisible
  render mode" — the same mechanism used for hidden OCR text) containing
  the full JSON of that sheet plus the whole contractor and visitor
  archive. It doesn't show on the page or print, but selecting/copying the
  text, or running it through any PDF text-extraction tool, recovers the
  full data — so every exported PDF also doubles as a portable backup.

A few extras worth knowing about: a **Settings** panel (gear icon) for the
site name (shown on the header and PDF), the induction validity period
(default 12 months) and the "expiring soon" warning window (default 30
days) — plus a manual JSON export/import backup and an "erase all data"
option, since everything lives only on this device.

## Try it immediately (no setup)

Unzip the folder and double-click `index.html`. Every feature — logging,
the contractor archive, autocomplete, PDF export — works straight away,
fully offline, with no server required. This is enough for one guard on
one device.

## Installing it as a proper app (recommended)

To get a home-screen icon, "Add to Home Screen"/"Install" prompts, and
guaranteed offline caching via the service worker, the files need to be
served over `http://` or `https://` rather than opened directly (this is a
browser security rule for service workers, not something specific to this
app). Any static host works — pick whichever is easiest for your team:

- **Quickest test on your own network**: from a terminal in this folder,
  run `python3 -m http.server 8080`, then open `http://<your-computer's-IP>:8080`
  on the gatehouse phone/tablet (same Wi-Fi network).
- **Free permanent hosting**: drag the folder into
  [Netlify Drop](https://app.netlify.com/drop), or push it to a GitHub repo
  and enable GitHub Pages — both give you a permanent `https://` URL.
- **Company server**: copy the folder to any existing web server (IIS,
  Apache, nginx, a Sharepoint/intranet static site, etc.) — no build step,
  no dependencies to install.

Once it's loaded once over http(s), open it in Chrome/Edge/Safari and use
"Add to Home Screen" (iOS Safari) or the install icon in the address bar
(Chrome/Edge/Android) to install it like a native app.

## Notes on the data model

- Each **sheet** is one shift record (date + start/end period). Entries
  belong to a sheet; switch sheets from the dropdown at the top of the
  Tracker tab, or create a new one with the **+** button.
- **Contractors** and **Visitors** share one underlying directory — the
  only difference is the "requires induction" flag — so a name typed on
  the Tracker form matches against both lists at once.
- All data is local to the browser it's used in. If you need the log
  available across multiple gatehouse devices, host the files centrally
  (above) — each device will still keep its **own** local copy of the
  data — or use Settings → Export JSON backup / Import backup to move data
  between devices manually.
- There's no build step and no external libraries — the PDF export is a
  small hand-written PDF generator (`js/pdf.js`) so exporting works from
  the very first launch, even before the service worker has cached
  anything.

## File structure

```
site-visitor-log/
├── index.html          Main app shell (all 4 views)
├── manifest.json        PWA manifest (install metadata, icons)
├── sw.js                 Service worker (offline caching)
├── css/style.css         Styling
├── js/db.js               IndexedDB data layer
├── js/pdf.js               Dependency-free PDF generator + invisible data layer
├── js/app.js                App logic, views, autocomplete, induction status
└── icons/                 App icons (192px, 512px)
```

## Customising

- Colours and type live at the top of `css/style.css` as CSS custom
  properties (`--ink`, `--accent`, `--green`/`--gold`/`--red`, etc.).
- Column widths for the PDF report are in `REPORT_COLS` near the top of
  the "Export view + PDF report" section in `js/app.js`.
- Bump `CACHE_NAME` in `sw.js` (e.g. `visitor-log-v2`) any time you edit a
  cached file, so devices that already installed the app pick up the
  update.
