# Complete documentation for "Simple T99"

## Introduction
"Simple T99" is a static administration interface for Quectel T99W175 modems/routers. Bootstrap 5 and Alpine.js power the UI, while Bash CGI scripts execute AT commands, read/write configuration, and expose quick utilities (Watchcat, TTL override, SMS). Everything is meant to live on the modem web partition and run through the built-in HTTP server.

## Repository layout
- `README.md`: quick overview and credits.
- `DOCUMENTAZIONE.md`: this detailed walkthrough.
- `Default config files/`: XML baselines you can push to the modem.
  - `mobileap_cfg.xml`: LAN IP, DHCP, APN template, and network defaults.
  - `mobileap_firewall.xml`: default firewall ruleset.
- `modem_config`: interactive Bash CLI that mirrors most UI features (APN, band/cell lock, TTL, roaming, LAN IP, bridge mode, reboot, etc.).
- `www/`: root of the web payload the modem serves.
  - HTML pages (`*.html`).
  - Static assets (`css/`, `js/`, `fonts/`, `favicon.ico`).
  - CGI helpers in `cgi-bin/`.
  - Front-end settings in `config/simpleadmin.conf`.

## HTML pages: what they do and how they do it
### `www/index.html` — Home / status
- Purpose: live dashboard for modem health (temperature, SIM, signal, uptime, LTE/5G throughput, cell details, IPs).
- How: the Alpine component `processAllInfos()` builds a batch of AT commands and sends them to `cgi-bin/get_atcommand`, parses responses into cards/tables, refreshes periodically, and uses timeouts plus loading spinners to handle slow modems.

### `www/network.html` — Radio and network tools
- Purpose: band locking, cell locking, and quick network utilities.
- How: `cellLocking()` fetches allowed bands with `AT^BAND_PREF_EXT?`, then `populateCheckboxes()` draws dynamic checkboxes per RAT (LTE/NSA/SA) and preselects locked bands. The page lets you lock PCI/EARFCN combos, run pings, toggle TTL override, trigger resets, and shows confirmation modals before applying changes.

### `www/scanner.html` — Cell scanner
- Purpose: scan LTE/NR cells and label operators by MCC/MNC.
- How: `startCellScan()`/`parseCellScan()` orchestrate sequential AT scans, disable controls during execution, decode MCC/MNC via a local dictionary, and fill a results table (PCI, EARFCN, RSRP/RSRQ, signal level). Supports Full/LTE/NR5G modes and formats raw replies for readability.

### `www/settings.html` — Advanced utilities
- Purpose: consolidated hub for terminal access and maintenance tasks.
- How: the `simpleSettings()` component offers:
  - AT terminal with history and multi-command send (falls back to `ATI` when empty).
  - One-Click utilities: reboot, AT config reset, IP passthrough, DNS proxy toggle, USB mode switch (RMNET/ECM/MBIM/RNDIS), and scheduled reboot timer.
  - TTL override panel reading from `/cgi-bin/get_ttl_status` and applying changes via `/cgi-bin/set_ttl` with inline logs.
  - Watchcat configuration that syncs current state from `/cgi-bin/set_watchcat` responses and shows countdowns for safe reboots.
  - Modal confirmations keep UI switches aligned with CGI outputs even when commands take a few seconds.

### `www/sms.html` — SMS inbox and sender
- Purpose: read, delete, and send SMS (including multipart UCS-2).
- How: `fetchSMS()` calls `AT+CMGL="ALL"` through `cgi-bin/get_atcommand`, decodes UCS-2 with `convertHexToText`, normalizes timestamps, and supports multi-select delete. Sending builds UDH headers for multipart UCS-2 messages before posting to `cgi-bin/send_sms`, with per-message status feedback.

### `www/deviceinfo.html` — Device details
- Purpose: display identity/network info and let you change the IMEI.
- How: `fetchDeviceInfo()` issues AT queries (`AT+CGMI`, `AT+CGMM`, `^VERSION?`, `+CIMI`, `+ICCID`, `+CGSN`, `+CNUM`, `+CGCONTRDP`) plus `/cgi-bin/get_lanip` for LAN details. `updateIMEI()` prepares `^NV` strings to write a new IMEI and triggers a reboot countdown so users wait for the modem to return.

### `www/watchcat.html` — Modern Watchcat UI
- Purpose: configure connectivity watchdog with validation.
- How: `simpleWatchCat()` pulls current status from `/cgi-bin/get_watchcat_status`, enables the submit toggle only when target, cooldown, failures, and action are filled, and posts the config to `/cgi-bin/watchcat_maker`. User feedback echoes the CGI response to avoid silent failures.

### `www/watchcat_backup.html` — Legacy Watchcat UI
- Purpose: fallback page that keeps the older layout and simpler bindings.
- How: mostly static fields with Alpine bindings; users manually submit parameters without the guarded validations present in the modern page.

### `www/config/simpleadmin.conf`
- Purpose: front-end feature toggle.
- How: the flag `SIMPLEADMIN_ENABLE_LOGIN` sets whether the interface requires credentials (1) or is openly accessible (0).

## JavaScript files
- `www/js/dark-mode.js`: toggles light/dark themes by updating `data-bs-theme`, saves preference in `localStorage`, and defaults to dark when no choice exists.
- `www/js/generate-freq-box.js`: dynamically builds EARFCN/PCI input pairs for manual lock; responds to `NumCells` changes and emits Alpine-compatible markup (`x-show`).
- `www/js/parse-settings.js`: parses AT replies to detect active SIM, APN, current locks, and RAT preferences; returns a normalized object consumed by `cellLocking().getCurrentSettings()`.
- `www/js/populate-checkbox.js`: renders band-selection grids, preselects locked bands, and attaches listeners that keep the `cellLock` model in sync while minimizing reflows via `DocumentFragment`.
- `www/js/alpinejs.min.js`: minified Alpine.js 3 build used across the UI.
- `www/js/bootstrap.bundle.min.js`: Bootstrap 5 bundle (with Popper) for layout and components.

## CSS and assets
- `www/css/styles.css`: imports Poppins fonts, incorporates `all.min.css` icons, and defines custom styles for loaders, modals, and utility classes.
- `www/css/bootstrap.min.css`: local Bootstrap 5.3 distribution for offline-consistent UI.
- `www/css/all.min.css`: minified icon set (Font Awesome-derived) referenced by buttons and labels.
- `www/fonts/*.woff2`: Poppins font family (weights 300–700, regular/italic) to avoid external CDN dependencies.
- `www/favicon.ico`: site icon.

## CGI scripts (`www/cgi-bin/`)
- `get_atcommand`: decodes the URL-encoded `atcmd` parameter, sends concatenated commands to `atcli_smd8`, waits for `OK`/`ERROR`, and returns the full modem response with progressive timeouts.
- `user_atcommand`: variant of `get_atcommand` that strips ANSI sequences with `awk`, tailored for the advanced terminal in `settings.html`.
- `get_ping`: runs `ping -c 1 8.8.8.8` and returns `OK` or `ERROR` to test connectivity.
- `get_uptime`: calls `uptime` and outputs plain-text for the Uptime card.
- `get_lanip`: reads `APIPAddr` from `mobileap_cfg.xml` and returns it as JSON, defaulting to "0" if missing.
- `get_ttl_status`: inspects `iptables -t mangle` to detect the TTL rule; returns JSON with `isEnabled` and `ttl`.
- `set_ttl`: reads `ttlvalue` from the query string, stops `/usrdata/simplefirewall/ttl-override`, calls `ttl_script.sh` to enable/disable the value, restarts the service, and returns a JSON log array.
- `get_watchcat_status`: serves `/tmp/watchcat.json` (or `{}`) to show watchdog status and logs.
- `set_watchcat`: creates/updates the `watchcat.service` unit with parameters (`status`, `IpDNS`, `cooldown`, `failures`, `action`); when enabled it writes `/usrdata/simpleadmin/script/watchat.sh` to ping targets, log results, and reboot or swap SIM. Supports full removal when disabled.
- `watchcat_maker`: simplified helper that validates params and delegates to `create_watchcat.sh`/`remove_watchcat.sh`, returning plain-text messages.
- `send_sms`: accepts number and UCS-2 message, runs `AT+CMGS` through `atcli_smd8`, pipes the body to `microcom` with `CTRL+Z`, and returns the raw modem reply.

## Operational notes
- All pages load `js/dark-mode.js` so theme preference stays consistent through `localStorage`.
- AT batches sent to `cgi-bin/get_atcommand` combine multiple commands with `;`; keep generous timeouts and show loaders (`.loader`) for long replies.
- CGI scripts assume proprietary helpers like `atcli_smd8` and `/usrdata/simpleadmin/script/...`; verify your firmware has them before deploying.
