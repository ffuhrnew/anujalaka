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
(once: Settings > Pages > Source = "GitHub Actions"). The published ESP32 firmware has no WiFi update
password; the flasher writes the one the user types into the image while flashing (`site/espimage.js`).
Without it the update window stays locked.

The page is available in German and English (switch at the top right, preset from the browser language).
Its Bluetooth card has buttons to turn Bluetooth on, turn it off and start pairing (the PIN is shown on the page,
the pairing window stays open for 35 seconds). "Turn Bluetooth off" saves the state and restarts the board so that it
stops transmitting at once.

Note: while a phone or computer is connected to the board over Bluetooth, the firmware answers only there and not over
USB. The flasher then reports that the device does not answer as an RNode. Switch Bluetooth off on that device
(or forget the board there) and reconnect the board. Paired devices cannot be deleted from the page.

## Building

The libraries `microReticulum` and `microStore` (Apache License 2.0) and a few other
dependencies are pinned in `platformio.ini`.

The ESP32 WiFi update window has **no default password**. For a local build, set one at build time
(at least 8 characters; without it the firmware has an empty password slot, see `OtaWifi.h`). The quotes must be escaped with backslashes, otherwise
PlatformIO strips them and the compiler fails with `'<word>' was not declared`:

```
export PLATFORMIO_BUILD_FLAGS='-DOTA_WIFI_PASSWORD=\"choose-your-own\"'
pio run -e seeed_xiao_esp32s3
```

## License

GNU General Public License v3.0, see [LICENSE](LICENSE). Copyright notices of the
original authors (Mark Qvist, Chad Attermann, ScotMesh and others) are kept in the
source files. Third-party components keep their own licenses.
