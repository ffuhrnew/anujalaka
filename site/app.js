// Aṇujālaka Flasher: Logik der Seite.
// Nutzt vendor/rnode.js (RNode, ROM, Utils), vendor/nrf52_dfu_flasher.js (Nrf52DfuFlasher),
// vendor/esptool-js und zip.js aus liamcottle/rnode-flasher (MIT).
import { ESPLoader, Transport } from "./vendor/esptool-js/bundle.js";
import { patchOtaPassword, checkPassword } from "./espimage.js";

// Werte wie in flash-node.sh: RAK4631 und XIAO nRF52840 werden als RAK4631 eingetragen (Produkt 0x10, Modell 0x12),
// der XIAO ESP32-S3 als Produkt 0xEB, Modell 0xDD.
const BOARDS = {
  xiao_esp32s3: {
    kind: "esp32",
    product: 0xEB,
    model: 0xDD,
    flashSize: "8MB",
    files: [
      { address: 0x0,     path: "firmware/xiao_esp32s3/bootloader.bin" },
      { address: 0x8000,  path: "firmware/xiao_esp32s3/partitions.bin" },
      { address: 0xe000,  path: "firmware/xiao_esp32s3/boot_app0.bin" },
      { address: 0x10000, path: "firmware/xiao_esp32s3/firmware.bin" },
    ],
  },
  xiao_nrf52840: { kind: "nrf52", product: 0x10, model: 0x12, zip: "firmware/xiao_nrf52840.zip", uf2: "firmware/xiao_nrf52840.uf2" },
  rak4631:       { kind: "nrf52", product: 0x10, model: 0x12, zip: "firmware/rak4631.zip" },
};

const $ = (id) => document.getElementById(id);
const logEl = $("log");
const progressEl = $("progress");
let busy = false;

function log(text, cls) {
  const line = document.createElement("div");
  line.textContent = new Date().toLocaleTimeString("de-DE") + "  " + text;
  if (cls) line.className = cls;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}
function setProgress(pct) {
  progressEl.classList.toggle("hidden", pct == null);
  if (pct != null) progressEl.value = pct;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const board = () => BOARDS[document.querySelector('input[name="board"]:checked').value];
const mode = () => document.querySelector('input[name="mode"]:checked').value;

function setBusy(on) {
  busy = on;
  document.querySelectorAll("button").forEach((b) => (b.disabled = on));
}

// Jede Aktion läuft über run(): ein Vorgang gleichzeitig, Fehler landen im Protokoll.
async function run(title, fn) {
  if (busy) return;
  setBusy(true);
  log("→ " + title);
  try {
    await fn();
    log("✓ " + title + " fertig", "ok");
  } catch (e) {
    if (e && e.name === "NotFoundError") log("Kein Port gewählt, abgebrochen.");
    else log("✗ " + title + " fehlgeschlagen: " + (e && e.message ? e.message : e), "err");
    console.error(e);
  } finally {
    setProgress(null);
    setBusy(false);
  }
}

async function pickPort() {
  return await navigator.serial.requestPort({ filters: [] });
}

// Gibt einen Port frei, auch wenn er schon zu ist. Ohne das bleibt er nach einem Fehler belegt,
// und alle weiteren Versuche scheitern, bis die Seite neu geladen wird.
async function releasePort(port) {
  try { await port.close(); } catch (_) { /* war schon zu */ }
}

const hex = (bytes) => Array.from(bytes || [], (b) => b.toString(16).padStart(2, "0")).join("");

async function fetchBytes(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(path + " nicht gefunden (HTTP " + res.status + "). Wurde die Firmware schon gebaut?");
  return new Uint8Array(await res.arrayBuffer());
}

function toBinaryString(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return s;
}

// ---- Flashen ---------------------------------------------------------------

// esptool-js schreibt die Verbindungsversuche zeichenweise (".", "_"). Das fassen wir zu einer Zeile zusammen.
function espTerminal() {
  let pending = "";
  const flush = () => {
    const s = pending.replace(/[\r\n]+/g, "").trim();
    if (s) log(s);
    pending = "";
  };
  return {
    clean() {},
    write(t) { pending += t; if (/[\r\n]/.test(t)) flush(); },
    writeLine(t) { flush(); log(t); },
    flush,
  };
}

// Verbindet mit dem Chip. Erst ohne Reset (das Board ist von Hand im Download-Modus, ein Reset würde ihn verlassen),
// dann mit dem automatischen Reset von esptool-js (für Boards, die noch die Firmware ausführen).
async function connectEsp32(port, baudrate) {
  const attempts = [
    ["default_reset", "Verbindung mit automatischem Reset"],
  ];
  for (const [resetMode, label] of attempts) {
    const terminal = espTerminal();
    const transport = new Transport(port, false);
    const loader = new ESPLoader({ transport, baudrate, terminal });
    log(label + " …");
    try {
      await loader.main(resetMode);
      terminal.flush();
      return { transport, loader };
    } catch (e) {
      terminal.flush();
      log("Nicht verbunden: " + (e && e.message ? e.message : e));
      try { await transport.disconnect(); } catch (_) { /* schon zu */ }
    }
  }
  throw new Error("Keine Verbindung zum Chip. Prüfe, ob das Board im Download-Modus ist: USB abziehen, BOOT-Knopf gedrückt halten, USB einstecken, erst dann loslassen. Dann nochmal Flashen.");
}

async function flashEsp32() {
  const b = board();
  const full = mode() === "full";
  // Der Port muss ganz am Anfang gewählt werden: Chrome erlaubt das nur kurz nach dem Klick.
  // Danach darf alles andere (Prüfen, Bestätigen, Laden) beliebig lange dauern.
  const port = await pickPort();
  const password = $("ota-pw").value;
  if (password) {
    const problem = checkPassword(password);
    if (problem) throw new Error(problem);
  }
  if (full && !confirm("„Neu einrichten“ löscht den ganzen Flash des Nodes (Einstellungen, Identität, Zugriffsliste). Fortfahren?")) {
    throw new Error("abgebrochen");
  }
  const fileArray = [];
  for (const f of b.files) {
    let bytes = await fetchBytes(f.path);
    if (password && f.path.endsWith("/firmware.bin")) {
      // Passwort in die Firmware eintragen, Prüfsumme und Hash werden dabei neu berechnet
      bytes = await patchOtaPassword(bytes, password);
      log("Update-Passwort eingetragen.");
    }
    log(f.path.split("/").pop() + ": " + bytes.length + " Bytes");
    fileArray.push({ address: f.address, data: toBinaryString(bytes) });
  }
  if (!password) log("Kein Update-Passwort angegeben: das WLAN-Update-Fenster bleibt gesperrt.");
  let transport;
  try {
    const conn = await connectEsp32(port, 921600);
    transport = conn.transport;
    const loader = conn.loader;
    await loader.writeFlash({
      fileArray,
      flashSize: b.flashSize,
      flashMode: "DIO",
      flashFreq: "80MHz",
      eraseAll: full,
      compress: true,
      calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)),
      reportProgress: (i, written, total) => setProgress(Math.floor((written / total) * 100)),
    });
    // Neustart über die Reset-Leitung (RTS)
    try { await loader.hardReset(); } catch (_) { /* siehe Hinweis unten */ }
    // DTR/RTS loslassen: bleibt DTR gesetzt, hält der Chip beim nächsten Neustart GPIO0 auf Low
    // und landet im Download-Modus statt in der Firmware.
    try { await transport.setDTR(false); await transport.setRTS(false); } catch (_) { /* egal */ }
    log("Falls das Board nicht von selbst startet: kurz USB abziehen und wieder einstecken.");
  } finally {
    if (transport) { try { await transport.disconnect(); } catch (_) { /* Port war schon zu */ } }
    await releasePort(port);
  }
  log("Danach: Schritt 3 (Firmware-Hash setzen" + (full ? ", vorher EEPROM einrichten" : "") + ").");
}

// Versetzt das Board per Software in den Update-Modus (Port kurz mit 1200 Baud öffnen und schließen)
// und liefert den Port, über den geflasht wird. Im Update-Modus meldet sich das Board unter einer anderen
// USB-Kennung. Hat der Browser diese Kennung noch nie gesehen, darf die Seite sie nur nach einer neuen Auswahl
// durch den Nutzer öffnen: dann kommt null zurück (einmalig, danach ist sie bekannt).
async function toDfuPort(port) {
  const vid = port.getInfo().usbVendorId;
  let gone = false, fresh = null;
  const onGone = (e) => { if (e.target === port) gone = true; };
  const onNew = (e) => { if (e.target && e.target !== port && e.target.getInfo().usbVendorId === vid) fresh = e.target; };
  navigator.serial.addEventListener("disconnect", onGone);
  navigator.serial.addEventListener("connect", onNew);
  try {
    log("Board wird in den Update-Modus versetzt …");
    await new Nrf52DfuFlasher(port).enterDfuMode();   // wartet selbst 1,5 s
    for (let i = 0; i < 20; i++) {
      if (!gone && i >= 3) return port;                // meldet sich nicht ab: war schon im Update-Modus
      if (gone) {
        const ports = await navigator.serial.getPorts();
        const cand = fresh || ports.find((p) => p !== port && p.getInfo().usbVendorId === vid);
        if (cand) return cand;
      }
      await sleep(400);
    }
    return null;
  } finally {
    navigator.serial.removeEventListener("disconnect", onGone);
    navigator.serial.removeEventListener("connect", onNew);
  }
}

async function flashNrf() {
  const b = board();
  const port = await pickPort();   // zuerst, solange die Klick-Erlaubnis gilt
  const bytes = await fetchBytes(b.zip);
  log(b.zip.split("/").pop() + ": " + bytes.length + " Bytes");
  let target = null;
  try {
    target = await toDfuPort(port);
    if (!target) {
      throw new Error("Das Board ist im Update-Modus, meldet sich aber unter einer neuen USB-Kennung. " +
        "Einmalig: noch einmal auf „Flashen“ klicken und den Port des Boards wählen. Danach geht es ohne zweite Auswahl.");
    }
    log("Flashen …");
    await new Nrf52DfuFlasher(target).flash(new Blob([bytes]), (pct) => setProgress(Math.floor(pct)));
  } finally {
    if (target && target !== port) await releasePort(target);
    await releasePort(port);
  }
  log("Danach: Schritt 3 (Firmware-Hash setzen" + (mode() === "full" ? ", vorher EEPROM einrichten" : "") + ").");
}

// ---- Nach dem Flashen ------------------------------------------------------


const withTimeout = (promise, ms, msg) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))]);
const closeQuiet = (rnode) => withTimeout(rnode.close(), 3000, "close").catch(() => {});

async function openRNode(port) {
  port = port || await pickPort();
  // Rohdaten mitschreiben: Die Firmware gibt beim Start Textzeilen aus, die zeigen, wo sie gerade steht.
  let raw = [], rawCount = 0;
  RNode.rawTap = (chunk) => { rawCount += chunk.length; raw.push(...chunk); if (raw.length > 4000) raw = raw.slice(-4000); };
  const rnode = await withTimeout(RNode.fromSerialPort(port), 8000, "Der Port lässt sich nicht öffnen.");
  // Der Browser setzt beim Öffnen DTR und RTS. Auf dem ESP32-S3 (USB-Serial-JTAG) führt das beim nächsten Neustart
  // in den Download-Modus: das Board schweigt dann, die Firmware läuft nicht. Deshalb gleich beide loslassen.
  const setLines = (dtr, rts) => port.setSignals({ dataTerminalReady: dtr, requestToSend: rts }).catch(() => {});
  // Nur ESP32 (Espressif, 0x303a): DTR loslassen. Beim nRF52 sendet die Firmware nur, solange DTR gesetzt ist.
  const isEsp = port.getInfo().usbVendorId === 0x303a;
  await (isEsp ? setLines(false, false) : setLines(true, false));
  try {
    // Beim ersten Start nach dem Flashen formatiert der Node seinen Speicher und legt eine Identität an.
    // Das kann deutlich länger dauern als ein normaler Start, daher bis zu 20 Sekunden warten.
    const start = Date.now();
    let nextNote = 10000;
    let resetTried = false;
    while (Date.now() - start < 25000) {
      if (await rnode.detect()) return rnode;
      const rom = await Promise.race([rnode.getRom().catch(() => null), sleep(1500).then(() => null)]);
      if (rom && rom.length >= 0x9c) return rnode;
      if (isEsp && !resetTried && Date.now() - start >= 6000) {
        // Keine Antwort: vermutlich steckt der Chip im Download-Modus. Einmal sauber in die Firmware neu starten.
        resetTried = true;
        log("Keine Antwort, starte den Node einmal neu …");
        await setLines(false, true);
        await sleep(200);
        await setLines(false, false);
        await sleep(1500);
      }
      if (Date.now() - start >= nextNote) {
        log("Warte auf den Node … " + Math.round((Date.now() - start) / 1000) + " s, " + rawCount + " Bytes empfangen");
        nextNote += 10000;
      }
      await sleep(500);
    }
    const text = new TextDecoder().decode(new Uint8Array(raw)).replace(/[^\x20-\x7e\r\n]/g, "·").trim();
    log("Empfangen vom Board (" + rawCount + " Bytes, letzte Ausgabe):\n" + (text.slice(-800) || "(nichts)"));
    throw new Error("Das gewählte Gerät meldet sich nicht als RNode.");
  } catch (e) {
    await closeQuiet(rnode);
    throw e;
  } finally {
    RNode.rawTap = null;
  }
}

async function wipeEeprom() {
  const port = await pickPort();   // zuerst, solange die Klick-Erlaubnis gilt
  if (!confirm("Das löscht den EEPROM des Nodes (Gerätedaten und Funk-Einstellungen). Fortfahren?")) throw new Error("abgebrochen");
  const rnode = await openRNode(port);
  log("EEPROM wird geleert, das dauert bis zu 30 Sekunden …");
  await rnode.wipeRom();
  await rnode.close();
  log("Danach Board kurz neu anstecken, dann Schritt b.");
}

async function provisionEeprom() {
  const b = board();
  const rnode = await openRNode();
  try {
    const rom = await rnode.getRomAsObject();
    if (rom.parse()) throw new Error("Der EEPROM ist schon eingerichtet. Erst Schritt a (EEPROM leeren).");
    const hwRev = 0x1;
    const serial = Utils.packUInt32BE(1);
    const made = Utils.packUInt32BE(Math.floor(Date.now() / 1000));
    const checksum = Utils.md5([b.product, b.model, hwRev, ...serial, ...made]);
    await rnode.writeRom(ROM.ADDR_PRODUCT, b.product);
    await rnode.writeRom(ROM.ADDR_MODEL, b.model);
    await rnode.writeRom(ROM.ADDR_HW_REV, hwRev);
    for (let i = 0; i < 4; i++) await rnode.writeRom(ROM.ADDR_SERIAL + i, serial[i]);
    for (let i = 0; i < 4; i++) await rnode.writeRom(ROM.ADDR_MADE + i, made[i]);
    for (let i = 0; i < 16; i++) await rnode.writeRom(ROM.ADDR_CHKSUM + i, checksum[i]);
    for (let i = 0; i < 128; i++) await rnode.writeRom(ROM.ADDR_SIGNATURE + i, 0x00);
    await rnode.writeRom(ROM.ADDR_INFO_LOCK, ROM.INFO_LOCK_BYTE);
    await sleep(2000); // EEPROM-Schreibvorgänge abwarten
    const back = (await rnode.getRomAsObject()).parse();
    if (!back || !back.is_provisioned || back.product !== b.product || back.model !== b.model) {
      throw new Error("Beim Zurücklesen stimmen die Werte nicht: " + JSON.stringify(back) + ". Erst Schritt a (EEPROM leeren), dann nochmal b.");
    }
    log("Zurückgelesen: Produkt 0x" + back.product.toString(16) + ", Modell 0x" + back.model.toString(16) + ", Prüfsumme stimmt.");
    // Die Firmware berechnet ihren Hash erst nach einem Neustart: neu starten, denselben Port wieder öffnen, Hash setzen.
    const port = rnode.serialPort;
    const watch = watchReconnect(port);
    try { await withTimeout(rnode.reset(), 3000, "reset"); } catch (_) { /* hat sich vielleicht schon selbst neu gestartet */ }
    await closeQuiet(rnode);
    log("Node startet neu, warte auf ihn …");
    const again = await reopenAfterReset(port, watch);
    try {
      await applyFirmwareHash(again);
    } finally {
      await closeQuiet(again);
    }
  } finally {
    await closeQuiet(rnode);
  }
  log("Fertig.");
}

// Trägt den Hash der laufenden Firmware als erwarteten Wert ein und liest ihn zurück.
// Direkt nach dem Einrichten des EEPROMs meldet die Firmware noch nur Nullen: sie berechnet den Hash erst beim
// nächsten Start. Nullen werden deshalb nie eingetragen, sondern es wird auf den echten Wert gewartet.
const isZeroHash = (h) => h.every((b) => b === 0);

// Befehl mit Zeitgrenze und Wiederholung: eine verlorene Antwort darf den Ablauf nicht für immer blockieren.
async function askRetry(fn, what) {
  for (let i = 0; i < 6; i++) {
    try { return await withTimeout(fn(), 3000, "keine Antwort"); } catch (_) { await sleep(300); }
  }
  throw new Error("Der Node antwortet nicht auf: " + what + ".");
}

async function applyFirmwareHash(rnode) {
  let actual = await askRetry(() => rnode.getFirmwareHash(), "Firmware-Hash lesen");
  for (let i = 0; i < 10 && isZeroHash(actual); i++) {
    await sleep(1000);
    actual = await askRetry(() => rnode.getFirmwareHash(), "Firmware-Hash lesen");
  }
  if (isZeroHash(actual)) throw new Error("Der Node meldet noch keinen Firmware-Hash. Board neu anstecken und Schritt c ausführen.");
  await rnode.setFirmwareHash(actual);
  await sleep(2000);
  const target = await askRetry(() => rnode.getTargetFirmwareHash(), "gespeicherten Hash lesen");
  if (hex(target) !== hex(actual)) {
    throw new Error("Hash nicht übernommen. Erwartet " + hex(actual) + ", gespeichert " + hex(target) + ".");
  }
  log("Firmware-Hash gesetzt und zurückgelesen: " + hex(actual).slice(0, 16) + " …");
}

// Merkt sich, wenn das Board nach einem Neustart als neues USB-Gerät wieder auftaucht.
function watchReconnect(port) {
  const info = port.getInfo();
  const same = (p) => { const pi = p.getInfo(); return pi.usbVendorId === info.usbVendorId && pi.usbProductId === info.usbProductId; };
  const state = { port: null, same };
  const onConnect = (e) => { if (e.target && same(e.target)) state.port = e.target; };
  navigator.serial.addEventListener("connect", onConnect);
  state.stop = () => navigator.serial.removeEventListener("connect", onConnect);
  return state;
}

// Öffnet nach einem Neustart des Boards denselben Port wieder, ohne neue Auswahl (die Erlaubnis bleibt bestehen).
// Nach dem Neustart meldet sich das Board als neues USB-Gerät: das alte Port-Objekt ist dann ungültig.
async function reopenAfterReset(oldPort, watch) {
  const start = Date.now();
  let noted = false, lastErr = "";
  try {
    while (Date.now() - start < 70000) {
      await sleep(1000);
      const ports = await navigator.serial.getPorts();
      const waited = Date.now() - start;
      const cand = watch.port
        || ports.find((p) => p !== oldPort && watch.same(p))
        || (waited > 10000 ? ports.find(watch.same) : null);   // kein Neuanmelden bemerkt: altes Objekt versuchen
      if (!cand) continue;
      if (!noted) { log("Node ist wieder da, öffne die Verbindung …"); noted = true; }
      log("Öffne …");
      try {
        return await withTimeout(openRNode(cand), 40000, "Zeitüberschreitung beim Öffnen.");
      } catch (e) {
        lastErr = e && e.message ? e.message : String(e);
        watch.port = null;
      }
    }
  } finally {
    watch.stop();
  }
  throw new Error("Der Node ist nach dem Neustart nicht wieder erreichbar" + (lastErr ? " (" + lastErr + ")" : "") +
    ". Board neu anstecken und Schritt c ausführen.");
}

async function setFirmwareHash() {
  const rnode = await openRNode();
  try {
    const details = (await rnode.getRomAsObject()).parse();
    if (!details || !details.is_provisioned) throw new Error("Der EEPROM ist nicht eingerichtet. Erst Schritt b.");
    await applyFirmwareHash(rnode);
    try { await rnode.reset(); } catch (_) { /* hat sich vielleicht selbst neu gestartet */ }
  } finally {
    await rnode.close();
  }
}

async function inspectNode() {
  const rnode = await openRNode();
  try {
    const d = (await rnode.getRomAsObject()).parse();
    if (!d) {
      log("EEPROM: nicht eingerichtet (Info-Sperre fehlt). Schritt b.");
    } else {
      log("EEPROM: " + (d.is_provisioned ? "eingerichtet" : "Prüfsumme passt NICHT") +
        ", Produkt 0x" + d.product.toString(16) + ", Modell 0x" + d.model.toString(16) +
        ", Hardware-Rev " + d.hardware_revision + ", Seriennr. " + d.serial_number);
      log("Prüfsumme gespeichert " + d.checksum + ", berechnet " + d.calculated_checksum);
      log("Konfiguriert: " + (d.is_configured ? "ja" : "nein"));
    }
    const target = await rnode.getTargetFirmwareHash();
    const actual = await rnode.getFirmwareHash();
    log("Firmware-Hash gesetzt:   " + hex(target));
    log("Firmware-Hash tatsächlich: " + hex(actual));
    log("Hash " + (hex(target) === hex(actual) ? "passt" : "passt NICHT, Schritt c"), hex(target) === hex(actual) ? "ok" : "err");
  } finally {
    await rnode.close();
  }
}

// ---- Oberfläche -----------------------------------------------------------

function updateView() {
  const b = board();
  $("steps-esp32").classList.toggle("hidden", b.kind !== "esp32");
  $("steps-nrf").classList.toggle("hidden", b.kind !== "nrf52");
  $("btn-uf2").classList.toggle("hidden", !b.uf2);
  $("uf2hint").classList.toggle("hidden", !b.uf2);
}

async function loadManifest() {
  try {
    const m = await (await fetch("firmware/manifest.json", { cache: "no-cache" })).json();
    $("fwinfo").textContent = "Firmware-Stand: Commit " + m.commit.slice(0, 7) + ", gebaut " + m.built.replace("T", " ").replace("Z", " UTC");
  } catch (_) {
    $("fwinfo").textContent = "Firmware-Stand unbekannt (manifest.json fehlt).";
  }
}

if (!("serial" in navigator)) {
  $("nosupport").classList.remove("hidden");
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
} else {
  $("btn-flash-esp32").onclick = () => run("Flashen (ESP32-S3)", flashEsp32);
  $("btn-flash-nrf").onclick = () => run("Flashen (nRF52)", flashNrf);
  $("btn-wipe").onclick = () => run("EEPROM leeren", wipeEeprom);
  $("btn-provision").onclick = () => run("EEPROM einrichten", provisionEeprom);
  $("btn-hash").onclick = () => run("Firmware-Hash setzen", setFirmwareHash);
  $("btn-inspect").onclick = () => run("Status prüfen", inspectNode);
}
document.querySelectorAll('input[name="board"]').forEach((r) => r.addEventListener("change", updateView));
updateView();
loadManifest();
