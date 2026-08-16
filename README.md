# myUCF Frontend Overhaul

<img width="1502" height="815" alt="image" src="https://github.com/user-attachments/assets/7bfac515-070d-4044-9127-abea99f5b497" />

A personal-use Chrome extension (Manifest V3) that improves the visual/UX
layer of **my.ucf.edu** (Oracle PeopleSoft Campus Solutions, Fluid UI). It runs
entirely client-side inside your own authenticated session and is controlled
from a toolbar popup.

<p align="center">
  <a href="https://github.com/maxjb-xyz/better-myucf/releases/latest/download/better-myucf.zip">
    <img src="https://img.shields.io/github/v/release/maxjb-xyz/better-myucf?style=for-the-badge&label=%E2%AC%87%20Download%20latest&color=FFC904&logoColor=1a1a1a" alt="Download latest release">
  </a>
  &nbsp;
  <a href="https://github.com/maxjb-xyz/better-myucf/releases">
    <img src="https://img.shields.io/badge/All%20releases-1a1a1a?style=for-the-badge&logo=github" alt="All releases">
  </a>
</p>

> **Unofficial.** This is not affiliated with, endorsed by, or supported by
> UCF or Oracle. PeopleSoft Fluid markup is version-specific and changes on
> PeopleTools updates, so **this may break without warning.** It is provided
> as-is for personal use.

**Supported hosts:** `my.ucf.edu`, `m.my.ucf.edu`, and the PeopleSoft app host
`csprod-ss.net.ucf.edu`. Selectors are grounded in Oracle's *PeopleSoft Fluid
UI CSS Guide* (PeopleTools 8.54) and verified against the live myUCF DOM.

## Install

### Easiest — grab a release

1. Click the **Download latest** button above to get `better-myucf.zip`.
2. Extract the zip — you'll get a `better-myucf/` folder containing
   `manifest.json`.
3. Open `chrome://extensions`.
4. Toggle **Developer mode** (top-right).
5. Click **Load unpacked** and select the extracted `better-myucf/` folder.
6. Navigate to `https://csprod-ss.net.ucf.edu/` — the page restyles in place.
7. Click the **myUCF** toolbar icon to open the settings popup.

> The download button links to the most recently **published** release. It goes
> live after the first tagged release (see [Building & releasing](#building--releasing)).

### From source

1. Clone this repo somewhere permanent (Chrome loads the folder in place):
   ```bash
   git clone https://github.com/maxjb-xyz/better-myucf.git
   ```
2. Repeat steps 3–7 above, selecting the cloned `better-myucf/` folder.

To verify it's active, open DevTools and check that `<html>` has the class
`myucf-overhaul` and a `data-accent` attribute.

## What it does / doesn't do

**Does:**

- Inject a persistent left **sidebar** — a hierarchical nav (area → page →
  sub-page tabs) that merges the app's real structure into one tree: the
  homepage tiles plus each component's left vertical tab rail. Sub-page links
  route by activating the matching PeopleSoft tab (label-based, see
  `nav.js`), not by fragile hard-coded URLs.
- Add a **dashboard** greeting header (time-of-day + date) above the tiles.
- Refine PeopleSoft Fluid's native dark UCF branding (charcoal + gold) into a
  cleaner, more modern look — it **stays dark** rather than fighting it.
- Offer four accent colors and three density presets.
- Survive Fluid's SPA-style re-renders via a `MutationObserver`.
- Provide a **Capture** mode that saves a PII-redacted page snapshot locally
  for the developer (see below).
- *(Phase 2, opt-in)* Intercept JSON responses PeopleSoft's own JS already
  fetches and render a custom UI from them.

**Does not:**

- Touch authentication, SSO, or Duo.
- Proxy or replay requests outside your live tab.
- Store session cookies or send any data off the machine.
- Scrape or redistribute data server-side.

## Navigation model

The sidebar is built from `nav.js` — a single tree (`MYUCF.NAV`) of
**area → page → sub-page tabs** that mirrors how myUCF actually organizes
itself: the homepage tiles are the top level, and each tile's component
exposes a left vertical tab rail (`psa_vtab`) listing its sub-pages.

Each page carries a deep-link `url`; each sub-page tab carries a `label` and,
where the PeopleTools component is stable, a `component` id. Clicking a
sub-page activates the matching tab in place (or navigates to the parent page
first, then activates it after load via `sessionStorage`).

**Matching is label-based.** UCF's custom tabs carry hashed, timestamped
component ids (e.g. `UCF_S2026…`) that regenerate, so the sidebar matches on
the visible label instead. Oracle's own components (`SSR_CRSE_HIST_FL`,
`HC_SAA_SS_WHATIF_SEL_GBL`, `UA_DT_SS_PLAN`, …) are stable and matched by id
first, with label as fallback.

## The popup

Clicking the toolbar icon opens a graphical menu. Every change is saved to
`chrome.storage.sync` immediately and applied to open myUCF tabs live — no
reload, no Save button.

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| Master toggle | switch | on | Enable/disable the whole extension. |
| Accent | swatch | gold | Accent color (gold/blue/green/purple). |
| Density | segmented | cozy | Spacing/type scale (compact/cozy/spacious). |
| Data layer | switch | on | Intercept PeopleSoft JSON for custom widgets (renderers still stubs). |
| Debug logging | switch | off | Console diagnostics. |
| Capture page | button | — | Save a redacted page snapshot locally. |
| Include text content | switch | off | Capture: include redacted text. |
| Extra redact terms | text | — | Capture: comma-separated terms to strip. |

Settings are stored under `chrome.storage.sync` (requires the `storage`
permission — the extension declares no other permissions). The schema lives in
`defaults.js`, shared by the content script and popup so they can't drift.

## Capture mode (developer)

The **Capture page** button saves a local `myucf-capture.json` — nothing is
uploaded; the file is created in the browser and you attach it manually. It
contains:

- **`navbar`** — the NavBar menu tree (labels + de-identified URLs). Open the
  NavBar (compass/NavBar icon) *before* capturing so it's in the DOM.
- **`dom`** — a structural skeleton of the page (tag / id / class / href
  hierarchy) used to target selectors.
- **`meta`** — host, page URL (query-stripped), and redaction status.

**Redaction** — personal data is stripped before the file is written:

- By default, **no text content is captured** — only structure.
- If *Include text content* is enabled, text runs through a redactor
  (`capture-utils.js`) that replaces emails, phone numbers, SSNs, dates,
  dollar amounts, 7+ digit IDs, and GPA-like numbers with `[email]`, `[phone]`,
  `[ssn]`, etc. Terms you add in *Extra terms to redact* (name, NID) are
  stripped first.
- URLs are de-identified: query strings (where identifiers like `EMPLID` live)
  are dropped, leaving only the component path.

Review the JSON before attaching it if you enabled text capture — the redactor
is regex-based and cannot reliably detect names.

## Phase 2 — capturing the schema

The fetch/XHR hook (`page-hook.js`) matches URL substrings in
`ENDPOINT_SIGNATURES` and forwards JSON to `content.js` via `postMessage`.
The renderers in `content.js` are **stubs** — they validate a schema version
and do nothing until you implement them against real payloads.

To wire up a real widget:

1. Enable **Data layer** and **Debug logging** in the popup.
2. Open myUCF → DevTools → **Network**, filter by `Fetch/XHR`.
3. Open the grades/schedule/financial-aid view and note the request URL and
   JSON response shape.
4. Add the URL substring to `ENDPOINT_SIGNATURES` in `page-hook.js`.
5. Implement the matching `renderX(version, payload)` in `content.js`, bumping
   the version constant when the shape changes.

Every parser is version-guarded: if the schema drifts, the renderer silently
no-ops and the page falls back to stock markup (or Phase 1 styling).

## Building & releasing

Publishing is fully automated. Tag a version and push the tag — GitHub Actions
builds a clean `better-myucf.zip` (excluding `.context/`, hidden files, and CI
config) and attaches it to a new release:

```bash
# Bump the version in manifest.json first (e.g. 0.6.0 -> 0.7.0)
git add manifest.json
git commit -m "v0.7.0"
git tag v0.7.0
git push origin v0.7.0
```

The **Download latest** button always points at the newest published zip.

To build the same zip locally:

```bash
python3 - <<'PY'
import os, shutil
TOP = "better-myucf"
if os.path.exists("dist"): shutil.rmtree("dist")
os.makedirs(os.path.join("dist", TOP))
EXCLUDE_DIRS = {".git", ".github", ".context", "dist"}
for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]
    for name in files:
        if name.startswith("."):
            continue
        src = os.path.join(root, name)
        dst = os.path.join("dist", TOP, os.path.relpath(src, "."))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
shutil.make_archive(os.path.join("dist", TOP), "zip", "dist", TOP)
print("Built dist/" + TOP + ".zip")
PY
```

## Known-fragile selectors

PeopleSoft generates version-specific markup. These are the selectors most
likely to break on a PeopleTools update — audit them first if styling stops
applying:

| File | Selector | Purpose | Risk |
| --- | --- | --- | --- |
| `styles.css` | `.ps_header`, `.ps_header_bar` | header surface + gold underline | high |
| `styles.css` | `.nuilp`, `.nuitile` | homepage tile cards | high |
| `styles.css` | `.ps_groupleth`, `.psc_tile_livedata` | tile title / metrics | med |
| `styles.css` | `.pts_search_content input`, `.ps_box-edit input` | header search + inputs | med |
| `styles.css` | `.ps_grid-head`, `.ps_grid-row` | transaction-page grids | med |
| `styles.css` | `.pts_results_grid`, `.pts_brdcrmhdr` | global search dropdown | med |
| `styles.css` | `.ps_mod_wrap`, `.ps_menucontainer` | modals / menus | med |
| `nav.js` | `NAV` hierarchy (area → page → tabs) | sidebar nav tree | high |
| `content.js` | `findTab()` (`.psa_tab_*` / `.ps-text`) | sub-page tab routing | high |
| `content.js` | `findNavbar()` selector list | NavBar tree capture | high |
| `page-hook.js` | `ENDPOINT_SIGNATURES` regexes | payload routing | high |

**Important:** `.ps_box-group` is PeopleSoft's generic *layout* wrapper (used
hundreds of times per page). Never style it as a card — the extension
deliberately does not touch it.

## Policy note

Before redistributing this or publishing it publicly, re-check
[UCF Policy 4-002](https://policies.ucf.edu/) and the myUCF terms of use.
This project is intended for personal, local use only.
