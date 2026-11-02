#!/usr/bin/env bash
# flash-node.sh - Firmware per USB auf einen RAK4631 oder ein XIAO ESP32-S3 einspielen.
#
# Fragt ab: Node-Typ und (bei XIAO) Modus. Es darf nur EIN Node stecken.
# Sichert vorher automatisch die Einstellungen (node_backup.py, nach ~/node-backups/).
# Der Name des Nodes bleibt immer unverändert.
#
# Modi:
#   Update  NUR Firmware aufspielen. Config, Identity (Hashes), Allow-Liste und EEPROM bleiben.
#   Full    TABULA RASA, nur XIAO. Flash löschen, flashen, EEPROM provisionieren, Hash setzen.
#           Danach: neue Identity/Hashes, keine Config, keine Allow-Liste.
#
# Optionen:
#   /dev/cu.usbmodemXXXX   Port festlegen (sonst automatisch)
#   MODEL=de ./flash-node.sh   433 MHz statt 868 MHz (nur bei Full relevant)
#
# Protokoll je Lauf: ~/flash-logs/

set -u

cd "$(dirname "$0")" || exit 1

LOGDIR="$HOME/flash-logs"
PRODUCT="eb"
MODEL="${MODEL:-dd}"
GIVEN_PORT="${1:-}"

die() { echo; echo "FEHLER: $*" >&2; exit 1; }

ask_yes() {  # Standard ist Nein
  local reply
  read -r -p "$1 [j/N] " reply
  [ "$reply" = "j" ] || [ "$reply" = "J" ]
}

# genau einen usbmodem-Port finden (wartet bis zu 30 s, z. B. nach dem Löschen oder Neustart)
get_port() {
  if [ -n "$GIVEN_PORT" ] && [ -e "$GIVEN_PORT" ]; then echo "$GIVEN_PORT"; return; fi
  local i n p
  for i in $(seq 1 30); do
    p=$(ls /dev/cu.usbmodem* 2>/dev/null)
    n=$(printf '%s\n' "$p" | grep -c .)
    [ "$n" -eq 1 ] && { echo "$p"; return; }
    [ "$n" -gt 1 ] && die "Mehrere usbmodem-Ports gefunden. Nur EINEN Node anstecken."
    [ "$i" -eq 1 ] && echo "Kein Node gefunden - bitte anstecken (warte bis zu 30 s) ..." >&2
    sleep 1
  done
  die "Kein Node gefunden. Anstecken (ggf. Boot-Taste halten) und nochmal."
}

# --- Voraussetzungen und Stand der Firmware ---------------------------------
[ -z "$GIVEN_PORT" ] || case "$GIVEN_PORT" in /dev/*) ;; *) die "Unbekanntes Argument: $GIVEN_PORT" ;; esac
command -v pio       >/dev/null || die "pio nicht gefunden"
command -v rnodeconf >/dev/null || die "rnodeconf nicht gefunden"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Dies ist kein Git-Ordner"
grep -q "mgmt.announce();" RNode_Firmware.ino || die "Mgmt-Announce-Patch fehlt in RNode_Firmware.ino"

BRANCH=$(git branch --show-current)
COMMIT=$(git rev-parse --short HEAD)
echo "Firmware-Stand: $BRANCH @ $COMMIT"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo
  echo "WARNUNG: Nicht eingecheckte Änderungen an getrackten Dateien:"
  git status --short --untracked-files=no
  ask_yes "Trotzdem weitermachen?" || die "Abgebrochen - erst committen."
fi

# --- Fragen -----------------------------------------------------------------
echo
echo "Node-Typ:"
echo "  1) RAK4631"
echo "  2) XIAO ESP32-S3"
read -r -p "Auswahl [1/2]: " choice
case "$choice" in
  1) TYPE="rak";  ENVNAME="wiscore_rak4631"     ;;
  2) TYPE="xiao"; ENVNAME="seeed_xiao_esp32s3"  ;;
  *) die "Ungültige Auswahl" ;;
esac

MODE="update"
if [ "$TYPE" = "xiao" ]; then
  grep -q "BOARD_MODEL != BOARD_XIAO_S3" RNode_Firmware.ino \
    || die "XIAO-Serial-Patch (while (!Serial)) fehlt in RNode_Firmware.ino"
  echo
  echo "Modus:"
  echo "  1) Update  (nur Firmware, Config bleibt)"
  echo "  2) Full    (Tabula rasa, löscht ALLES)"
  read -r -p "Auswahl [1/2]: " choice
  case "$choice" in
    1) MODE="update" ;;
    2) MODE="full"   ;;
    *) die "Ungültige Auswahl" ;;
  esac
fi

LABEL="$ENVNAME"   # nur Beschriftung für das Protokoll; der Name des Nodes wird nie angefasst
PORT=$(get_port) || exit 1

# --- Zusammenfassung und Bestätigung ----------------------------------------
echo
echo "Zusammenfassung:"
echo "  Board: $ENVNAME"
echo "  Modus: $MODE"
echo "  Port:  $PORT"
echo "  Stand: $BRANCH @ $COMMIT"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/$(date +%Y%m%d-%H%M%S)-${LABEL//[^A-Za-z0-9._-]/_}.log"
echo "Node=$LABEL Typ=$TYPE Modus=$MODE Branch=$BRANCH Commit=$COMMIT" > "$LOG"

# --- Sicherung (nur lesen, per USB) -----------------------------------------
# Die Einstellungen des angesteckten Nodes werden vor jedem Flash nach ~/node-backups/ gesichert.
# Geheime Schlüssel gibt der Node nicht heraus: die Transport-Identity ist nicht Teil der Sicherung.
echo
echo ">>> Sicherung der Einstellungen"
[ -f ./node_backup.py ] || die "node_backup.py fehlt (muss neben flash-node.sh liegen)"
# Python-Umgebung von rnodeconf verwenden: dort sind pyserial und RNS installiert
PY=$(head -1 "$(command -v rnodeconf)" | sed -n 's|^#![[:space:]]*||p' | awk '{print $1}')
case "$PY" in ""|*/env) PY="python3" ;; esac
command -v "$PY" >/dev/null 2>&1 || PY="python3"
"$PY" ./node_backup.py "$PORT" 2>&1 | tee -a "$LOG"
if [ "${PIPESTATUS[0]}" -ne 0 ]; then
  echo
  ask_yes "Die Sicherung ist fehlgeschlagen. Trotzdem OHNE Sicherung flashen?" \
    || die "Abgebrochen - es wurde nichts geflasht."
fi

# --- Bestätigung ------------------------------------------------------------
echo
if [ "$MODE" = "full" ]; then
  echo "Das löscht ALLES auf dem Node: Config, Transport-Identity (neue Hashes!), Allow-Liste, EEPROM."
  read -r -p "Ist das der richtige Node? Zur Bestätigung JA eingeben: " ans
  [ "$ans" = "JA" ] || die "Abgebrochen - es wurde nichts geflasht."
else
  echo "Config, Identity und Allow-Liste bleiben erhalten."
  ask_yes "Ist das der richtige Node? Jetzt flashen?" || die "Abgebrochen - es wurde nichts geflasht."
fi

# --- Flashen ----------------------------------------------------------------

if [ "$MODE" = "full" ]; then
  echo; echo ">>> Flash löschen"
  pio run -e "$ENVNAME" -t erase --upload-port "$PORT" || die "Löschen fehlgeschlagen"
  sleep 3; PORT=$(get_port) || exit 1
fi

echo; echo ">>> Firmware flashen"
[ "$MODE" = "full" ] && echo "(Hinweis 'not provisioned' ist jetzt normal)"
pio run -e "$ENVNAME" -t upload --upload-port "$PORT" 2>&1 | tee -a "$LOG"
[ "${PIPESTATUS[0]}" -eq 0 ] || die "Flashen fehlgeschlagen (Protokoll: $LOG)"
HASH=$(grep -o "firmware_hash: [0-9a-f]\{64\}" "$LOG" | head -1 | awk '{print $2}')
sleep 3; PORT=$(get_port) || exit 1

if [ "$MODE" = "full" ]; then
  echo; echo ">>> EEPROM provisionieren"
  rnodeconf --product "$PRODUCT" --model "$MODEL" --hwrev 1 --rom "$PORT" || die "Provisionieren fehlgeschlagen"
  sleep 3; PORT=$(get_port) || exit 1
fi

# --- Firmware-Hash ----------------------------------------------------------
# Beim Update setzt pio den Hash nach dem Flashen meist selbst. Dann nichts doppelt tun.
echo; echo ">>> Firmware-Hash"
if [ "$MODE" = "update" ] && grep -q "Firmware hash set" "$LOG"; then
  echo "Wurde schon beim Flashen gesetzt."
else
  [ -n "$HASH" ] || die "Firmware-Hash nicht in der Ausgabe gefunden"
  ok=0
  for try in 1 2 3; do
    OUT=$(rnodeconf --firmware-hash "$HASH" "$PORT" 2>&1); echo "$OUT"
    if echo "$OUT" | grep -q "Firmware hash set"; then ok=1; break; fi
    if [ "$MODE" = "update" ] && echo "$OUT" | grep -qi "not been provisioned"; then
      die "Node ist nicht provisioniert (leerer Flash?). Dann einmal mit Full aufsetzen."
    fi
    echo "Versuch $try von 3 ohne Erfolg, warte ..."
    sleep 3; PORT=$(get_port) || exit 1
  done
  [ "$ok" -eq 1 ] || die "Firmware-Hash wurde NICHT gesetzt"
fi

# --- Kontrolle --------------------------------------------------------------
sleep 3; PORT=$(get_port) || exit 1
echo; echo ">>> Kontrolle"
INFO=$(rnodeconf "$PORT" -i 2>&1)
echo "$INFO" | grep -Ei "product|model|firmware|hash|signature|provision" || true
echo "$INFO" | grep -q "Device signature validated" || echo "WARNUNG: Gerätesignatur nicht bestätigt."
echo "$INFO" >> "$LOG"   # im Protokoll steht so, welcher Node es war

echo
echo "FERTIG: $LABEL ($TYPE, $MODE) @ $COMMIT auf $PORT"
echo "Protokoll: $LOG"
echo "FERTIG $(date +%H:%M:%S)" >> "$LOG"
if [ "$MODE" = "full" ]; then
  echo "Jetzt einrichten: Name, 869,525 MHz, 125 kHz, SF 8, CR 5, 22 dBm, Remote Management an, Allow-Liste - dann Commit."
else
  echo "Jetzt prüfen: Name, Funkparameter und Allow-Liste müssen noch stehen (mikara: Verbinden, Werte ansehen)."
fi
