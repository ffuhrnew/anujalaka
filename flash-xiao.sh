#!/usr/bin/env bash
# flash-xiao.sh - XIAO ESP32S3 + Wio-SX1262: entweder Tabula rasa oder nur neue Firmware
#
# Modi (einer ist Pflicht, damit nie versehentlich alles gelöscht wird):
#   --update   NUR Firmware aufspielen. Config, Identity (Hashes), Allow-Liste und EEPROM bleiben.
#              Ablauf: flashen, Firmware-Hash setzen, Kontrolle.
#   --full     TABULA RASA. Flash komplett löschen, flashen, EEPROM provisionieren, Hash setzen.
#              Danach: neue Identity/Hashes, keine Config, keine Allow-Liste.
#
# Optionen:
#   --yes, -y  Rückfrage bei --full überspringen
#   /dev/cu.usbmodemXXXX   Port festlegen (sonst automatisch, es darf nur EIN Node stecken)
#   MODEL=de ./flash-xiao.sh --full   (433 MHz statt 868 MHz, nur bei --full relevant)
#
# Beispiele:
#   ./flash-xiao.sh --update
#   ./flash-xiao.sh --full
#   ./flash-xiao.sh --update /dev/cu.usbmodem1421101

set -u

DIR="${MR_DIR:-$HOME/microReticulum_Firmware_Build}"
ENVNAME="seeed_xiao_esp32s3"
PRODUCT="eb"
MODEL="${MODEL:-dd}"
MODE=""
YES=0
GIVEN_PORT=""

die() { echo; echo "FEHLER: $*" >&2; exit 1; }

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

for arg in "$@"; do
  case "$arg" in
    --update)  MODE="update" ;;
    --full)    MODE="full" ;;
    --yes|-y)  YES=1 ;;
    -h|--help) usage ;;
    /dev/*)    GIVEN_PORT="$arg" ;;
    *)         echo "Unbekanntes Argument: $arg" >&2; usage ;;
  esac
done

[ -n "$MODE" ] || { echo "Modus fehlt: --update oder --full angeben." >&2; echo >&2; usage; }

command -v pio       >/dev/null || die "pio nicht gefunden"
command -v rnodeconf >/dev/null || die "rnodeconf nicht gefunden"
cd "$DIR" 2>/dev/null || die "Ordner nicht gefunden: $DIR"
grep -q "mgmt.announce();" RNode_Firmware.ino || die "Mgmt-Announce-Patch fehlt in RNode_Firmware.ino"
grep -q "BOARD_MODEL != BOARD_XIAO_S3" RNode_Firmware.ino || die "XIAO-Serial-Patch (while (!Serial)) fehlt in RNode_Firmware.ino"

# genau einen usbmodem-Port finden (wartet bis zu 30 s, z.B. nach dem Löschen oder Neustart)
get_port() {
  if [ -n "$GIVEN_PORT" ] && [ -e "$GIVEN_PORT" ]; then echo "$GIVEN_PORT"; return; fi
  local i n p
  for i in $(seq 1 30); do
    p=$(ls /dev/cu.usbmodem* 2>/dev/null)
    n=$(printf '%s\n' "$p" | grep -c .)
    [ "$n" -eq 1 ] && { echo "$p"; return; }
    [ "$n" -gt 1 ] && die "Mehrere usbmodem-Ports gefunden. Nur EINEN Node anstecken."
    sleep 1
  done
  die "Kein Node gefunden. Anstecken (Boot-Taste halten) und nochmal."
}

PORT=$(get_port) || exit 1

if [ "$MODE" = "full" ]; then
  echo "Modus: FULL (Tabula rasa)   Port: $PORT   Modell: $MODEL"
  echo "Das löscht ALLES auf dem Node: Config, Transport-Identity (neue Hashes!), Allow-Liste, EEPROM."
  if [ "$YES" -ne 1 ]; then
    printf "Zur Bestätigung JA eingeben: "
    read -r ans
    [ "$ans" = "JA" ] || die "Abgebrochen."
  fi
else
  echo "Modus: UPDATE (nur Firmware)   Port: $PORT"
  echo "Config, Identity und Allow-Liste bleiben erhalten."
fi

if [ "$MODE" = "full" ]; then
  echo; echo ">>> Flash löschen"
  pio run -e "$ENVNAME" -t erase --upload-port "$PORT" || die "Löschen fehlgeschlagen"
  sleep 3; PORT=$(get_port) || exit 1
fi

echo; echo ">>> Firmware flashen"
[ "$MODE" = "full" ] && echo "(Hinweis 'not provisioned' ist jetzt normal)"
LOG=$(mktemp)
pio run -e "$ENVNAME" -t upload --upload-port "$PORT" 2>&1 | tee "$LOG"
[ "${PIPESTATUS[0]}" -eq 0 ] || die "Flashen fehlgeschlagen"
HASH=$(grep -o "firmware_hash: [0-9a-f]\{64\}" "$LOG" | head -1 | awk '{print $2}')
rm -f "$LOG"
[ -n "$HASH" ] || die "Firmware-Hash nicht in der Ausgabe gefunden"
sleep 3; PORT=$(get_port) || exit 1

if [ "$MODE" = "full" ]; then
  echo; echo ">>> EEPROM provisionieren"
  rnodeconf --product "$PRODUCT" --model "$MODEL" --hwrev 1 --rom "$PORT" || die "Provisionieren fehlgeschlagen"
  sleep 3; PORT=$(get_port) || exit 1
fi

echo; echo ">>> Firmware-Hash setzen"
OUT=$(rnodeconf --firmware-hash "$HASH" "$PORT" 2>&1); echo "$OUT"
if ! echo "$OUT" | grep -q "Firmware hash set"; then
  if [ "$MODE" = "update" ] && echo "$OUT" | grep -qi "not been provisioned"; then
    die "Node ist nicht provisioniert (leerer Flash?). Dann einmal mit --full aufsetzen."
  fi
  die "Firmware-Hash wurde NICHT gesetzt"
fi

sleep 3; PORT=$(get_port) || exit 1
echo; echo ">>> Kontrolle"
INFO=$(rnodeconf "$PORT" -i 2>&1)
echo "$INFO" | grep -Ei "product|model|firmware|hash|signature|provision" || true
echo "$INFO" | grep -q "Device signature validated" || echo "WARNUNG: Gerätesignatur nicht bestätigt."

echo
echo "FERTIG ($MODE): $PORT"
if [ "$MODE" = "full" ]; then
  echo "Jetzt einrichten: Name, 869,525 MHz, 125 kHz, SF 9, CR 5, 22 dBm, Remote Management an, Allow-Liste (7c1707da…) - dann Commit."
else
  echo "Jetzt prüfen: Name, Funkparameter und Allow-Liste müssen noch stehen (mikara: Verbinden, Werte ansehen)."
  echo "Dann ohne Mac an ein Netzteil und warten, bis der Announce in der TUI erscheint."
fi
