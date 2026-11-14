// Texte der Seite auf Deutsch und Englisch.
// Statische Texte stehen im HTML mit data-i18n (reiner Text) oder data-i18n-html (mit <strong>, <code>, <a>).
// Texte aus dem Programm holt t("schlüssel", { platzhalter: wert }).

const STR = {
  de: {
    "meta.desc": "Aṇujālaka: Reticulum-Node-Firmware (microReticulum) für XIAO ESP32-S3, XIAO nRF52840 und RAK4631 direkt im Browser flashen.",
    "sub": "Micro-Network: Reticulum-Node-Firmware (microReticulum) für XIAO ESP32-S3, XIAO nRF52840 und RAK4631. Flashen direkt im Browser, ohne Installation.",
    "nosupport": "<strong>Dieser Browser kann nicht per USB flashen.</strong> Bitte Chrome oder Edge am Computer verwenden (Web Serial). Firefox und Safari werden nicht unterstützt.",

    "h.board": "1. Board wählen",
    "board.xiao_esp32s3.sub": "mit Wio-SX1262",
    "board.xiao_nrf52840.sub": "mit Wio-SX1262",
    "board.rak4631.sub": "WisBlock, nRF52840",
    "fw.loading": "Firmware-Stand wird geladen …",
    "fw.info": "Firmware-Stand: Commit {commit}, gebaut {built} UTC",
    "fw.unknown": "Firmware-Stand unbekannt (manifest.json fehlt).",

    "h.flash": "2. Flashen",
    "mode.update": "Update",
    "mode.update.sub": "nur Firmware, Einstellungen und Identität bleiben",
    "mode.full": "Neu einrichten",
    "mode.full.sub": "neuer oder leerer Node, löscht alles",
    "esp.s1": "Board per USB anstecken und in den <strong>Download-Modus</strong> bringen: <strong>BOOT</strong> gedrückt halten, <strong>RESET</strong> kurz drücken, BOOT loslassen. Die Firmware auf dem Board lässt sich meist nicht selbst in diesen Modus schalten.",
    "esp.s2": "Optional ein Passwort für das WLAN-Update-Fenster eingeben (unten).",
    "esp.s3": "Auf „Flashen“ klicken und den Port des Boards wählen.",
    "esp.pwlabel": "Passwort für das WLAN-Update-Fenster",
    "esp.pwph": "8 bis 63 Zeichen, leer = Update-Fenster gesperrt",
    "esp.pwnote": "Das Passwort wird nur in deinem Browser in die Firmware eingetragen und nirgends gespeichert oder gesendet. Es gibt keins vorgegeben. Bei jedem neuen Flashen musst du es erneut eingeben, sonst bleibt das Update-Fenster gesperrt.",
    "nrf.s1": "Board per USB anstecken. Ein Knopfdruck am Board ist nicht nötig, die Seite schaltet den Update-Modus selbst ein.",
    "nrf.s2": "Auf „Flashen“ klicken und den Port des Boards wählen.",
    "nrf.s3": "Nur beim allerersten Mal verlangt der Browser eine zweite Auswahl, weil sich das Board im Update-Modus als neues USB-Gerät meldet. Dann noch einmal „Flashen“ klicken und den Port wählen.",
    "btn.flash": "Flashen",
    "btn.uf2": "UF2-Datei laden",
    "uf2hint": "Alternative ohne Browser-Flasher: Reset zweimal drücken, das Laufwerk XIAO-BOOT erscheint, die UF2-Datei darauf ziehen.",

    "h.after": "3. Nach dem Flashen",
    "after.update": "<strong>Update:</strong> nur Schritt c. Der Firmware-Hash ändert sich mit jeder neuen Firmware und muss danach gesetzt werden.",
    "after.full": "<strong>Neu einrichten:</strong> nach dem vollen Flash nur noch b (setzt auch den Hash). Schritt a nur bei einem Node, der vorher schon benutzt wurde. Jeder Schritt fragt den Port neu ab, weil das Board dazwischen neu startet.",
    "btn.wipe": "a. EEPROM leeren",
    "btn.provision": "b. Einrichten (EEPROM und Hash)",
    "btn.hash": "c. Firmware-Hash setzen",
    "btn.inspect": "Status prüfen",
    "after.note": "Das Leeren dauert bis zu 30 Sekunden. Eine Gerätesignatur wird hier nicht erzeugt (wie im rnode-flasher), <code>rnodeconf</code> kann sie deshalb als nicht bestätigt melden.",

    "h.bt": "4. Bluetooth",
    "bt.intro": "Hier schaltest du Bluetooth am Board ein oder aus (der Zustand wird im Board gespeichert) und startest das Pairing. „Pairing starten“ zeigt einen PIN, und das Board hält das Pairing-Fenster 35 Sekunden offen. In dieser Zeit am Smartphone das Board suchen und den PIN eingeben. Solange die USB-Verbindung der Seite offen ist, sind Flashen und Einrichten gesperrt.",
    "btn.bton": "Bluetooth einschalten",
    "btn.btoff": "Bluetooth ausschalten",
    "btn.btpair": "Pairing starten",
    "btn.btclose": "Verbindung trennen",
    "bt.pin.label": "Pairing-PIN:",
    "bt.note": "„Bluetooth ausschalten“ startet das Board neu, damit es sofort nicht mehr sendet, und speichert „aus“. „Bluetooth einschalten“ speichert „an“. „Pairing starten“ schaltet Bluetooth bei Bedarf ebenfalls dauerhaft ein. „Verbindung trennen“ beendet nur die USB-Verbindung der Seite. Ist ein Smartphone oder Computer per Bluetooth mit dem Board verbunden, antwortet das Board nicht über USB. Dann dort Bluetooth ausschalten oder das Board vergessen. Gekoppelte Geräte löscht diese Seite nicht.",

    "h.conf": "5. Konfigurieren",
    "conf.text": "Name, Funkparameter, Zugriffsliste und Transport stellst du in der Web-Konsole ein (USB oder Bluetooth). Nach „Neu einrichten“ ist die Identität des Nodes neu.",
    "btn.console": "Web-Konsole öffnen",

    "h.log": "Protokoll",
    "log.ready": "Bereit.",
    "h.more": "Mehr",
    "link.src": "Quellcode",
    "link.changelog": "Changelog",
    "link.prov": "Provisioning",
    "link.issues": "Fehler melden",
    "footer": "GPL-3.0. Der Flasher benutzt Code von <a href=\"https://github.com/liamcottle/rnode-flasher\">liamcottle/rnode-flasher</a> (MIT) und <a href=\"https://github.com/espressif/esptool-js\">esptool-js</a>, siehe <a href=\"vendor/THIRD-PARTY.md\">THIRD-PARTY.md</a>. Die Firmware wird bei jedem Stand von <code>main</code> automatisch gebaut. Flashen geschieht auf eigene Gefahr.",

    "act.flash.esp": "Flashen (ESP32-S3)",
    "act.flash.nrf": "Flashen (nRF52)",
    "act.wipe": "EEPROM leeren",
    "act.provision": "EEPROM einrichten",
    "act.hash": "Firmware-Hash setzen",
    "act.inspect": "Status prüfen",
    "act.bton": "Bluetooth einschalten",
    "act.btoff": "Bluetooth ausschalten",
    "act.btpair": "Bluetooth-Pairing starten",
    "act.btclose": "Bluetooth-Verbindung trennen",
    "log.done": "{title} fertig",
    "log.failed": "{title} fehlgeschlagen: {msg}",
    "log.noport": "Kein Port gewählt, abgebrochen.",

    "err.cancelled": "abgebrochen",
    "err.notfound": "{path} nicht gefunden (HTTP {status}). Wurde die Firmware schon gebaut?",
    "err.portopen": "Der Port lässt sich nicht öffnen.",
    "err.noanswer": "Das gewählte Gerät meldet sich nicht als RNode. Ist ein Smartphone oder Computer per Bluetooth mit dem Board verbunden? Dann antwortet das Board nur dort und nicht über USB. Bluetooth am Smartphone ausschalten (oder das Board dort vergessen), das Board neu anstecken und noch einmal versuchen.",
    "err.nopin": "Kein PIN vom Board erhalten.",
    "err.noconn": "Keine Verbindung zum Chip. Prüfe, ob das Board im Download-Modus ist: USB abziehen, BOOT-Knopf gedrückt halten, USB einstecken, erst dann loslassen. Dann nochmal Flashen.",
    "err.newid": "Das Board ist im Update-Modus, meldet sich aber unter einer neuen USB-Kennung. Einmalig: noch einmal auf „Flashen“ klicken und den Port des Boards wählen. Danach geht es ohne zweite Auswahl.",
    "err.eeprom.done": "Der EEPROM ist schon eingerichtet. Erst Schritt a (EEPROM leeren).",
    "err.readback": "Beim Zurücklesen stimmen die Werte nicht: {info}. Erst Schritt a (EEPROM leeren), dann nochmal b.",
    "err.nohash": "Der Node meldet noch keinen Firmware-Hash. Board neu anstecken und Schritt c ausführen.",
    "err.hashmismatch": "Hash nicht übernommen. Erwartet {want}, gespeichert {got}.",
    "err.noreturn": "Der Node ist nach dem Neustart nicht wieder erreichbar{detail}. Board neu anstecken und Schritt c ausführen.",
    "err.opentimeout": "Zeitüberschreitung beim Öffnen.",
    "err.notprov": "Der EEPROM ist nicht eingerichtet. Erst Schritt b.",
    "err.noreply": "Der Node antwortet nicht auf: {what}.",
    "err.timeout.noanswer": "keine Antwort",
    "what.hashread": "Firmware-Hash lesen",
    "what.savedhash": "gespeicherten Hash lesen",
    "confirm.full": "„Neu einrichten“ löscht den ganzen Flash des Nodes (Einstellungen, Identität, Zugriffsliste). Fortfahren?",
    "confirm.wipe": "Das löscht den EEPROM des Nodes (Gerätedaten und Funk-Einstellungen). Fortfahren?",

    "log.attempt": "Verbindung mit automatischem Reset",
    "log.notconn": "Nicht verbunden: {msg}",
    "log.pwset": "Update-Passwort eingetragen.",
    "log.bytes": "{name}: {n} Bytes",
    "log.nopw": "Kein Update-Passwort angegeben: das WLAN-Update-Fenster bleibt gesperrt.",
    "log.nostart": "Falls das Board nicht von selbst startet: kurz USB abziehen und wieder einstecken.",
    "log.next": "Danach: Schritt 3 (Firmware-Hash setzen{full}).",
    "log.next.full": ", vorher EEPROM einrichten",
    "log.dfu": "Board wird in den Update-Modus versetzt …",
    "log.flashing": "Flashen …",
    "log.wiping": "EEPROM wird geleert, das dauert bis zu 30 Sekunden …",
    "log.wiped": "Danach Board kurz neu anstecken, dann Schritt b.",
    "log.noanswer.reset": "Keine Antwort, starte den Node einmal neu …",
    "log.waiting": "Warte auf den Node … {s} s, {n} Bytes empfangen",
    "log.received": "Empfangen vom Board ({n} Bytes, letzte Ausgabe):\n{text}",
    "log.nothing": "(nichts)",
    "log.readback": "Zurückgelesen: Produkt 0x{product}, Modell 0x{model}, Prüfsumme stimmt.",
    "log.restart": "Node startet neu, warte auf ihn …",
    "log.hashset": "Firmware-Hash gesetzt und zurückgelesen: {hash} …",
    "log.back": "Node ist wieder da, öffne die Verbindung …",
    "log.open": "Öffne …",
    "log.finished": "Fertig.",
    "log.eeprom.none": "EEPROM: nicht eingerichtet (Info-Sperre fehlt). Schritt b.",
    "log.eeprom": "EEPROM: {state}, Produkt 0x{product}, Modell 0x{model}, Hardware-Rev {hw}, Seriennr. {serial}",
    "state.ok": "eingerichtet",
    "state.bad": "Prüfsumme passt NICHT",
    "log.checksum": "Prüfsumme gespeichert {a}, berechnet {b}",
    "log.configured": "Konfiguriert: {v}",
    "yes": "ja",
    "no": "nein",
    "log.hash.set": "Firmware-Hash gesetzt:   {h}",
    "log.hash.actual": "Firmware-Hash tatsächlich: {h}",
    "log.hash.ok": "Hash passt",
    "log.hash.bad": "Hash passt NICHT, Schritt c",
    "log.btrestart": "Board wird neu gestartet, damit Bluetooth sofort aus ist …",
    "log.pin": "Pairing-PIN: {pin}",

    "bt.status.idle": "Pairing nicht gestartet.",
    "bt.lost": "Verbindung zum Board verloren.",
    "bt.starting": "Starte Pairing …",
    "bt.nopin": "Kein PIN empfangen.",
    "bt.window.left": "PIN am Smartphone eingeben, das Pairing-Fenster ist noch {n} s offen.",
    "bt.window.wait": "Pairing ist offen (noch {n} s). Jetzt am Smartphone das Board wählen, der PIN erscheint dann hier.",
    "bt.window.expired": "Pairing-Fenster abgelaufen. Mit „Pairing starten“ einen neuen PIN holen.",
    "bt.closed": "Verbindung getrennt. Der Bluetooth-Zustand am Board bleibt unverändert.",
    "bt.on.done": "Bluetooth eingeschaltet und gespeichert. Ist ein Smartphone verbunden, antwortet das Board nicht mehr über USB.",
    "bt.off.done": "Bluetooth ausgeschaltet und gespeichert. Das Board startet neu und sendet danach nicht mehr."
  },
  en: {
    "meta.desc": "Aṇujālaka: flash Reticulum node firmware (microReticulum) for XIAO ESP32-S3, XIAO nRF52840 and RAK4631 straight from the browser.",
    "sub": "Micro-Network: Reticulum node firmware (microReticulum) for XIAO ESP32-S3, XIAO nRF52840 and RAK4631. Flash straight from the browser, no installation.",
    "nosupport": "<strong>This browser cannot flash over USB.</strong> Please use Chrome or Edge on a computer (Web Serial). Firefox and Safari are not supported.",

    "h.board": "1. Choose board",
    "board.xiao_esp32s3.sub": "with Wio-SX1262",
    "board.xiao_nrf52840.sub": "with Wio-SX1262",
    "board.rak4631.sub": "WisBlock, nRF52840",
    "fw.loading": "Loading firmware version …",
    "fw.info": "Firmware version: commit {commit}, built {built} UTC",
    "fw.unknown": "Firmware version unknown (manifest.json missing).",

    "h.flash": "2. Flash",
    "mode.update": "Update",
    "mode.update.sub": "firmware only, settings and identity stay",
    "mode.full": "Set up fresh",
    "mode.full.sub": "new or empty node, erases everything",
    "esp.s1": "Connect the board by USB and put it into <strong>download mode</strong>: hold <strong>BOOT</strong>, press <strong>RESET</strong> briefly, release BOOT. The firmware on the board usually cannot switch to this mode by itself.",
    "esp.s2": "Optionally enter a password for the WiFi update window (below).",
    "esp.s3": "Click “Flash” and choose the board's port.",
    "esp.pwlabel": "Password for the WiFi update window",
    "esp.pwph": "8 to 63 characters, empty = update window locked",
    "esp.pwnote": "The password is written into the firmware in your browser only and is never stored or sent anywhere. There is no default. You must enter it again every time you flash, otherwise the update window stays locked.",
    "nrf.s1": "Connect the board by USB. No button press on the board is needed, the page switches to update mode itself.",
    "nrf.s2": "Click “Flash” and choose the board's port.",
    "nrf.s3": "Only the very first time the browser asks for a second selection, because in update mode the board shows up as a new USB device. Then click “Flash” once more and choose the port.",
    "btn.flash": "Flash",
    "btn.uf2": "Download UF2 file",
    "uf2hint": "Alternative without the browser flasher: press reset twice, the XIAO-BOOT drive appears, drag the UF2 file onto it.",

    "h.after": "3. After flashing",
    "after.update": "<strong>Update:</strong> step c only. The firmware hash changes with every new firmware and has to be set afterwards.",
    "after.full": "<strong>Set up fresh:</strong> after the full flash only b (it also sets the hash). Step a only for a node that was used before. Each step asks for the port again, because the board restarts in between.",
    "btn.wipe": "a. Erase EEPROM",
    "btn.provision": "b. Set up (EEPROM and hash)",
    "btn.hash": "c. Set firmware hash",
    "btn.inspect": "Check status",
    "after.note": "Erasing takes up to 30 seconds. No device signature is created here (as in rnode-flasher), so <code>rnodeconf</code> may report it as unconfirmed.",

    "h.bt": "4. Bluetooth",
    "bt.intro": "Here you turn Bluetooth on the board on or off (the setting is stored in the board) and start pairing. “Start pairing” shows a PIN, and the board keeps the pairing window open for 35 seconds. During that time, search for the board on your smartphone and enter the PIN. While the page's USB connection is open, flashing and setup are locked.",
    "btn.bton": "Turn Bluetooth on",
    "btn.btoff": "Turn Bluetooth off",
    "btn.btpair": "Start pairing",
    "btn.btclose": "Close connection",
    "bt.pin.label": "Pairing PIN:",
    "bt.note": "“Turn Bluetooth off” restarts the board so that it stops transmitting at once, and stores “off”. “Turn Bluetooth on” stores “on”. “Start pairing” also turns Bluetooth on permanently if needed. “Close connection” only ends the page's USB connection. If a smartphone or computer is connected to the board over Bluetooth, the board does not answer over USB. Then turn Bluetooth off there or forget the board. This page does not delete paired devices.",

    "h.conf": "5. Configure",
    "conf.text": "You set name, radio parameters, access list and transport in the web console (USB or Bluetooth). After “Set up fresh” the node's identity is new.",
    "btn.console": "Open web console",

    "h.log": "Log",
    "log.ready": "Ready.",
    "h.more": "More",
    "link.src": "Source code",
    "link.changelog": "Changelog",
    "link.prov": "Provisioning",
    "link.issues": "Report a problem",
    "footer": "GPL-3.0. The flasher uses code from <a href=\"https://github.com/liamcottle/rnode-flasher\">liamcottle/rnode-flasher</a> (MIT) and <a href=\"https://github.com/espressif/esptool-js\">esptool-js</a>, see <a href=\"vendor/THIRD-PARTY.md\">THIRD-PARTY.md</a>. The firmware is built automatically for every state of <code>main</code>. Flashing is at your own risk.",

    "act.flash.esp": "Flash (ESP32-S3)",
    "act.flash.nrf": "Flash (nRF52)",
    "act.wipe": "Erase EEPROM",
    "act.provision": "Set up EEPROM",
    "act.hash": "Set firmware hash",
    "act.inspect": "Check status",
    "act.bton": "Turn Bluetooth on",
    "act.btoff": "Turn Bluetooth off",
    "act.btpair": "Start Bluetooth pairing",
    "act.btclose": "Close Bluetooth connection",
    "log.done": "{title} finished",
    "log.failed": "{title} failed: {msg}",
    "log.noport": "No port chosen, cancelled.",

    "err.cancelled": "cancelled",
    "err.notfound": "{path} not found (HTTP {status}). Has the firmware been built yet?",
    "err.portopen": "The port cannot be opened.",
    "err.noanswer": "The selected device does not answer as an RNode. Is a smartphone or computer connected to the board over Bluetooth? Then the board only answers there and not over USB. Turn Bluetooth off on the smartphone (or forget the board there), reconnect the board and try again.",
    "err.nopin": "No PIN received from the board.",
    "err.noconn": "No connection to the chip. Check that the board is in download mode: unplug USB, hold the BOOT button, plug USB in, only then release. Then flash again.",
    "err.newid": "The board is in update mode but shows up under a new USB ID. Once only: click “Flash” again and choose the board's port. After that no second selection is needed.",
    "err.eeprom.done": "The EEPROM is already set up. Do step a (erase EEPROM) first.",
    "err.readback": "Read-back values do not match: {info}. Do step a (erase EEPROM) first, then b again.",
    "err.nohash": "The node does not report a firmware hash yet. Reconnect the board and run step c.",
    "err.hashmismatch": "Hash not accepted. Expected {want}, stored {got}.",
    "err.noreturn": "The node cannot be reached again after the restart{detail}. Reconnect the board and run step c.",
    "err.opentimeout": "Timeout while opening.",
    "err.notprov": "The EEPROM is not set up. Do step b first.",
    "err.noreply": "The node does not answer to: {what}.",
    "err.timeout.noanswer": "no answer",
    "what.hashread": "reading firmware hash",
    "what.savedhash": "reading stored hash",
    "confirm.full": "“Set up fresh” erases the whole flash of the node (settings, identity, access list). Continue?",
    "confirm.wipe": "This erases the node's EEPROM (device data and radio settings). Continue?",

    "log.attempt": "Connecting with automatic reset",
    "log.notconn": "Not connected: {msg}",
    "log.pwset": "Update password written.",
    "log.bytes": "{name}: {n} bytes",
    "log.nopw": "No update password given: the WiFi update window stays locked.",
    "log.nostart": "If the board does not start by itself: unplug USB briefly and plug it in again.",
    "log.next": "Next: step 3 (set firmware hash{full}).",
    "log.next.full": ", set up EEPROM first",
    "log.dfu": "Putting the board into update mode …",
    "log.flashing": "Flashing …",
    "log.wiping": "Erasing EEPROM, this takes up to 30 seconds …",
    "log.wiped": "Then reconnect the board briefly, then step b.",
    "log.noanswer.reset": "No answer, restarting the node once …",
    "log.waiting": "Waiting for the node … {s} s, {n} bytes received",
    "log.received": "Received from the board ({n} bytes, last output):\n{text}",
    "log.nothing": "(nothing)",
    "log.readback": "Read back: product 0x{product}, model 0x{model}, checksum OK.",
    "log.restart": "Node is restarting, waiting for it …",
    "log.hashset": "Firmware hash set and read back: {hash} …",
    "log.back": "Node is back, opening the connection …",
    "log.open": "Opening …",
    "log.finished": "Done.",
    "log.eeprom.none": "EEPROM: not set up (info lock missing). Step b.",
    "log.eeprom": "EEPROM: {state}, product 0x{product}, model 0x{model}, hardware rev {hw}, serial {serial}",
    "state.ok": "set up",
    "state.bad": "checksum does NOT match",
    "log.checksum": "Checksum stored {a}, calculated {b}",
    "log.configured": "Configured: {v}",
    "yes": "yes",
    "no": "no",
    "log.hash.set": "Firmware hash set:    {h}",
    "log.hash.actual": "Firmware hash actual: {h}",
    "log.hash.ok": "Hash matches",
    "log.hash.bad": "Hash does NOT match, step c",
    "log.btrestart": "Restarting the board so that Bluetooth is off at once …",
    "log.pin": "Pairing PIN: {pin}",

    "bt.status.idle": "Pairing not started.",
    "bt.lost": "Connection to the board lost.",
    "bt.starting": "Starting pairing …",
    "bt.nopin": "No PIN received.",
    "bt.window.left": "Enter the PIN on your smartphone, the pairing window stays open for {n} more s.",
    "bt.window.wait": "Pairing is open ({n} s left). Now choose the board on your smartphone, the PIN then appears here.",
    "bt.window.expired": "Pairing window expired. Use “Start pairing” to get a new PIN.",
    "bt.closed": "Connection closed. The Bluetooth setting on the board is unchanged.",
    "bt.on.done": "Bluetooth turned on and stored. If a smartphone is connected, the board no longer answers over USB.",
    "bt.off.done": "Bluetooth turned off and stored. The board restarts and no longer transmits afterwards."
  }
};

let lang = "de";

export const getLang = () => lang;

export function detectLang() {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "de" || saved === "en") return saved;
  } catch (_) { /* Speicher gesperrt: Standard nehmen */ }
  return (navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en";
}

// Beim Start: gespeicherte oder Browser-Sprache nehmen, ohne sie zu speichern.
export function initLang() { lang = detectLang(); }

export function setLang(l) {
  lang = l === "en" ? "en" : "de";
  try { localStorage.setItem("lang", lang); } catch (_) { /* nicht schlimm */ }
}

export function t(key, params) {
  let s = (STR[lang] && STR[lang][key]) ?? STR.de[key] ?? key;
  if (params) for (const k of Object.keys(params)) s = s.split("{" + k + "}").join(String(params[k]));
  return s;
}

// Setzt alle statischen Texte der Seite in der gewählten Sprache.
export function applyStatic() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", t(el.dataset.i18nPh)); });
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("meta.desc"));
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
}

export const STRINGS = STR;
