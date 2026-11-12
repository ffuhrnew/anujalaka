#!/usr/bin/env bash
# check_esp_image.sh <firmware.bin>
# Prüft im CI, dass das ESP32-S3-Abbild nach dem Eintragen des Passworts (wie es die Flasher-Seite macht)
# für den Bootloader gültig bleibt, und zeigt Kopfdaten und Platz im Abbild.
set -euo pipefail
in="${1:?firmware.bin fehlt}"
work="$(mktemp -d)"
ESPTOOL="$(find "$HOME/.platformio/packages" -name esptool.py -path '*tool-esptoolpy*' | head -1)"
[ -n "$ESPTOOL" ] || { echo "FEHLER: esptool.py nicht gefunden" >&2; exit 1; }

echo "== Original =="
python3 "$ESPTOOL" --chip esp32s3 image_info "$in"

echo; echo "== Passwort-Platz =="
python3 - "$in" <<'PY'
import sys
d = open(sys.argv[1], "rb").read()
m = b"@@OTA-PW-v1@@"
print("Marker:", d.count(m), "mal, Zustand:", d[d.find(m) + len(m):d.find(m) + len(m) + 1])
PY

echo; echo "== Nach dem Eintragen =="
node "$(dirname "$0")/patch_cli.mjs" "$in" "$work/patched.bin" "Test-Passwort-42"
python3 "$ESPTOOL" --chip esp32s3 image_info "$work/patched.bin"
