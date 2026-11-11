# Aṇujālaka (अणुजालक)

**Micro-Network: standalone Reticulum node firmware (microReticulum) for XIAO nRF52840, XIAO ESP32-S3 and RAK4631.**

Aṇujālaka is a fork of [ScotMesh/microReticulum_Firmware](https://github.com/ScotMesh/microReticulum_Firmware),
which in turn builds on Chad Attermann's
[microReticulum_Firmware](https://github.com/attermann/microReticulum_Firmware) and
Mark Qvist's [RNode_Firmware](https://github.com/markqvist/RNode_Firmware).
The full upstream history is preserved. The original README is kept as
[README.upstream.md](README.upstream.md).

## What this fork adds

See `git log` for details. Highlights:

- Board support for XIAO nRF52840 + Wio-SX1262 (`xiao_nrf52840`)
- Bluetooth update window (OTA) and a health page
- Samaya time sync and a build-time clock seed (`clock_seed_patch.py`)
- Repeated NomadNet announces, reduced log level for field nodes
- Helper scripts: `flash-node.sh`, `node_backup.py`, `node_restore.py`, `node_reset.py`, `publish-dfu.sh`

## Web flasher

`site/` holds a browser flasher (Chrome or Edge, Web Serial) for XIAO ESP32-S3, XIAO nRF52840 and RAK4631,
plus the web console as `console.html`. The workflow `.github/workflows/pages.yml` builds the three firmwares
on every push to `main` and publishes everything on GitHub Pages
(once: Settings > Pages > Source = "GitHub Actions"). The optional secret `OTA_WIFI_PASSWORD` sets the
ESP32 update-window password, otherwise a random one is used per build.

## Building

The libraries `microReticulum` and `microStore` (Apache License 2.0) and a few other
dependencies are pinned in `platformio.ini`.

The ESP32 WiFi update window has **no default password**. Set one at build time
(at least 8 characters). The quotes must be escaped with backslashes, otherwise
PlatformIO strips them and the compiler fails with `'<word>' was not declared`:

```
export PLATFORMIO_BUILD_FLAGS='-DOTA_WIFI_PASSWORD=\"choose-your-own\"'
pio run -e seeed_xiao_esp32s3
```

## License

GNU General Public License v3.0, see [LICENSE](LICENSE). Copyright notices of the
original authors (Mark Qvist, Chad Attermann, ScotMesh and others) are kept in the
source files. Third-party components keep their own licenses.
