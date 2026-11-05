#!/bin/bash
# publish-dfu.sh - baut RAK4631, XIAO nRF52840 und XIAO ESP32-S3 neu und legt sie in iCloud ab
cd ~/microReticulum_Firmware_Build || exit 1
unset PLATFORMIO_BUILD_FLAGS
DEST="$HOME/Library/Mobile Documents/com~apple~CloudDocs/DFU/Solar"
[ -d "$DEST" ] || { echo "FEHLER: Ordner fehlt: $DEST"; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "FEHLER: ungespeicherte Aenderungen im Quellcode - erst committen"; git status --short --untracked-files=no; exit 1
fi
TREE=$(git rev-parse --short 'HEAD^{tree}')
ONLY="$*"   # Aufruf ohne Argument: alles bauen; sonst nur die genannten Dateien (rak4631.zip xiao_nrf.zip xiao_esp32s3.bin)
for a in $ONLY; do case "$a" in rak4631.zip|xiao_nrf.zip|xiao_esp32s3.bin) ;; *) echo "FEHLER: unbekannte Datei $a (erlaubt: rak4631.zip xiao_nrf.zip xiao_esp32s3.bin)"; exit 1;; esac; done
want() { [ -z "$ONLY" ] && return 0; case " $ONLY " in *" $1 "*) return 0;; esac; return 1; }
STAND="$DEST/STAND.txt"
{ echo "Stand: $(date '+%d.%m.%Y %H:%M')   Tree: $TREE   Commit: $(git rev-parse --short HEAD)${ONLY:+   (nur neu gebaut: $ONLY)}"; } > "$STAND.tmp"

build() {  # env  suchmuster  zielname
  local env="$1" pat="$2" name="$3" start f
  want "$name" || { grep "^$name " "$STAND" 2>/dev/null | sed 's/$/  (nicht neu gebaut)/' >> "$STAND.tmp"; echo "    uebersprungen $name"; return 0; }
  start=$(date +%s)
  echo ">>> Baue $env"
  pio run -e "$env" -t clean >/dev/null 2>&1; pio run -e "$env" >/tmp/publish-dfu-$env.log 2>&1 || { echo "FEHLER beim Bauen von $env (Log: /tmp/publish-dfu-$env.log)"; exit 1; }
  f=$(ls -t .pio/build/$env/$pat 2>/dev/null | head -1)
  [ -n "$f" ] || { echo "FEHLER: keine Datei $pat fuer $env"; exit 1; }
  [ "$(stat -f %m "$f")" -ge "$start" ] || { echo "FEHLER: $f ist nicht frisch gebaut"; exit 1; }
  cp -f "$f" "$DEST/$name" || exit 1
  echo "$name  $(shasum -a 256 "$DEST/$name" | cut -c1-16)  (aus $(basename "$f"))" >> "$STAND.tmp"
  echo "    OK $name"
}
build wiscore_rak4631      'rnode_firmware_*.zip' rak4631.zip
build xiao_nrf52840  'rnode_firmware_*.zip' xiao_nrf.zip
build seeed_xiao_esp32s3   'rnode_firmware_xiao_esp32s3.bin' xiao_esp32s3.bin
mv -f "$STAND.tmp" "$STAND"
echo; cat "$STAND"
