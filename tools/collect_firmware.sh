#!/usr/bin/env bash
# collect_firmware.sh <pio-env> <zielordner>
# Legt die Build-Ergebnisse eines PlatformIO-Environments unter den festen Namen ab, die die Flasher-Seite
# (site/app.js) erwartet. Aufruf im Repo-Hauptordner nach "pio run -e <env>".
set -euo pipefail
env="${1:?pio-env fehlt}"; out="${2:?Zielordner fehlt}"
B=".pio/build/$env"
mkdir -p "$out"

newest() {  # newest <muster>: neueste passende Datei, sonst Fehler
  local f
  f=$(ls -t $1 2>/dev/null | head -1 || true)
  [ -n "$f" ] || { echo "FEHLER: keine Datei $1" >&2; exit 1; }
  echo "$f"
}

case "$env" in
  wiscore_rak4631)
    cp "$(newest "$B/rnode_firmware_*.zip")" "$out/rak4631.zip"
    ;;
  xiao_nrf52840)
    cp "$(newest "$B/rnode_firmware_*.zip")" "$out/xiao_nrf52840.zip"
    python3 tools/uf2conv.py -f 0xADA52840 -c "$(newest "$B/rnode_firmware_*.hex")" -o "$out/xiao_nrf52840.uf2"
    ;;
  seeed_xiao_esp32s3)
    d="$out/xiao_esp32s3"; mkdir -p "$d"
    cp "$(newest "$B/rnode_firmware_xiao_esp32s3.bin")" "$d/firmware.bin"
    cp "$B/bootloader.bin" "$d/bootloader.bin"
    cp "$B/partitions.bin" "$d/partitions.bin"
    boot=$(ls "$B"/rnode_firmware_*.boot_app0 2>/dev/null | head -1 || true)
    [ -n "$boot" ] || boot="$HOME/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"
    [ -f "$boot" ] || { echo "FEHLER: boot_app0.bin nicht gefunden" >&2; exit 1; }
    cp "$boot" "$d/boot_app0.bin"
    ;;
  heltec_wifi_lora_32_V3)
    d="$out/heltec_v3"; mkdir -p "$d"
    fw=$(ls -t "$B"/rnode_firmware_*.bin 2>/dev/null | head -1 || true)
    [ -n "$fw" ] || fw="$B/firmware.bin"
    [ -f "$fw" ] || { echo "FEHLER: keine Firmware-Datei in $B" >&2; exit 1; }
    cp "$fw" "$d/firmware.bin"
    cp "$B/bootloader.bin" "$d/bootloader.bin"
    cp "$B/partitions.bin" "$d/partitions.bin"
    boot=$(ls "$B"/rnode_firmware_*.boot_app0 2>/dev/null | head -1 || true)
    [ -n "$boot" ] || boot="$HOME/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin"
    [ -f "$boot" ] || { echo "FEHLER: boot_app0.bin nicht gefunden" >&2; exit 1; }
    cp "$boot" "$d/boot_app0.bin"
    ;;
  *)
    echo "FEHLER: unbekanntes Environment $env" >&2; exit 1
    ;;
esac
echo "Gesammelt in $out:"; find "$out" -type f -exec ls -l {} \;
