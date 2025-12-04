# Simpleadmin for Quectel T99W175

Static web interface (HTML/JS with Bash CGI helpers) to administer Quectel T99W175-based modems/routers. This edition integrates the toolkit published at [iamromulan/quectel-rgmii-toolkit](https://github.com/iamromulan/quectel-rgmii-toolkit) and keeps the layout lean so you can add deployment notes and custom steps later.

## Credits and thanks
- Original toolkit idea and maintenance: [iamromulan](https://github.com/iamromulan) – repo: [quectel-rgmii-toolkit](https://github.com/iamromulan/quectel-rgmii-toolkit).
- Core contributors for scripts, testing, and troubleshooting:
  - [1alessandro1](https://github.com/1alessandro1)
  - [stich86](https://github.com/stich86)

Thanks to everyone who shared logs, fixes, and on-device tests that made the web UI and CLI scripts more robust.

## Quick overview
- Responsive HTML pages (Bootstrap 5 + Alpine.js) served from the modem web partition.
- Bash CGI scripts in `www/cgi-bin/` that drive AT commands, Watchcat, TTL override, and utility actions.
- Front-end settings via `www/config/simpleadmin.conf` plus default XML baselines in `Default config files/`.
- Shell helpers in `modem_config` for quick CLI-driven setup and recovery.

Check [DOCUMENTAZIONE.md](DOCUMENTAZIONE.md) for file-by-file behavior, request flows, and how each page uses the CGI helpers.
