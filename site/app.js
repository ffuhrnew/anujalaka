// Aṇujālaka Flasher: Logik der Seite.
// Nutzt vendor/rnode.js (RNode, ROM, Utils), vendor/nrf52_dfu_flasher.js (Nrf52DfuFlasher),
// vendor/esptool-js und zip.js aus liamcottle/rnode-flasher (MIT).
import { ESPLoader, Transport } from "./vendor/esptool-js/bundle.js";
import { patchOtaPassword, checkPassword } from "./espimage.js";
import { t, getLang, initLang, setLang, applyStatic } from "./i18n.js";

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
let btSession = null;   // offene USB-Verbindung zum Board, solange die Bluetooth-Karte benutzt wird
let btTimer = null;
let logPristine = true;                         // noch nichts protokolliert: "Bereit." folgt der Sprache
let btStatusState = { key: "bt.status.idle" };  // letzter Bluetooth-Status, wird bei Sprachwechsel neu gesetzt
let fwState = { key: "fw.loading" };
const BT_PIN_WAIT_MS = 5000;      // so lange wartet die Seite auf den PIN
const BT_PAIRING_WINDOW_S = 35;   // BT_PAIRING_TIMEOUT der Firmware (Bluetooth.h)

function log(text, cls) {
  const line = document.createElement("div");
  logPristine = false;
  line.textContent = new Date().toLocaleTimeString(getLang() === "de" ? "de-DE" : "en-GB") + "  " + text;
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

function updateButtons() {
  document.querySelectorAll("button").forEach((b) => {
    if (b.id.startsWith("lang-")) return;   // Sprachwahl bleibt immer bedienbar
    let off = false;
    if (b.id === "btn-bt-close") off = !btSession;
    else if (!b.id.startsWith("btn-bt-")) off = !!btSession;   // Flashen und Einrichten brauchen denselben Port
    b.disabled = busy || off;
  });
}

function setBusy(on) {
  busy = on;
  updateButtons();
}

// Jede Aktion läuft über run(): ein Vorgang gleichzeitig, Fehler landen im Protokoll.
async function run(titleKey, fn) {
  if (busy) return;
  const title = t(titleKey);
  setBusy(true);
  log("→ " + title);
  try {
    await fn();
    log("✓ " + t("log.done", { title }), "ok");
  } catch (e) {
    if (e && e.name === "NotFoundError") log(t("log.noport"));
    else log("✗ " + t("log.failed", { title, msg: e && e.message ? e.message : e }), "err");
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
  if (!res.ok) throw new Error(t("err.notfound", { path, status: res.status }));
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
    ["default_reset", "log.attempt"],
  ];
  for (const [resetMode, label] of attempts) {
    const terminal = espTerminal();
    const transport = new Transport(port, false);
    const loader = new ESPLoader({ transport, baudrate, terminal });
    log(t(label) + " …");
    try {
      await loader.main(resetMode);
      terminal.flush();
      return { transport, loader };
    } catch (e) {
      terminal.flush();
      log(t("log.notconn", { msg: e && e.message ? e.message : e }));
      try { await transport.disconnect(); } catch (_) { /* schon zu */ }
    }
  }
  throw new Error(t("err.noconn"));
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
  if (full && !confirm(t("confirm.full"))) {
    throw new Error(t("err.cancelled"));
  }
  const fileArray = [];
  for (const f of b.files) {
    let bytes = await fetchBytes(f.path);
    if (password && f.path.endsWith("/firmware.bin")) {
      // Passwort in die Firmware eintragen, Prüfsumme und Hash werden dabei neu berechnet
      bytes = await patchOtaPassword(bytes, password);
      log(t("log.pwset"));
    }
    log(t("log.bytes", { name: f.path.split("/").pop(), n: bytes.length }));
    fileArray.push({ address: f.address, data: toBinaryString(bytes) });
  }
  if (!password) log(t("log.nopw"));
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
    log(t("log.nostart"));
  } finally {
    if (transport) { try { await transport.disconnect(); } catch (_) { /* Port war schon zu */ } }
    await releasePort(port);
  }
  log(t("log.next", { full: full ? t("log.next.full") : "" }));
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
    log(t("log.dfu"));
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
  log(t("log.bytes", { name: b.zip.split("/").pop(), n: bytes.length }));
  let target = null;
  try {
    target = await toDfuPort(port);
    if (!target) {
      throw new Error(t("err.newid"));
    }
    log(t("log.flashing"));
    await new Nrf52DfuFlasher(target).flash(new Blob([bytes]), (pct) => setProgress(Math.floor(pct)));
  } finally {
    if (target && target !== port) await releasePort(target);
    await releasePort(port);
  }
  log(t("log.next", { full: mode() === "full" ? t("log.next.full") : "" }));
}

// ---- Nach dem Flashen ------------------------------------------------------


const withTimeout = (promise, ms, msg) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))]);
const closeQuiet = (rnode) => withTimeout(rnode.close(), 3000, "close").catch(() => {});

// nRF52 (RAK4631, XIAO nRF52840): eigener Weg. Die Firmware sendet über USB nur, solange DTR gesetzt ist.
async function openRNodeNrf(port) {
  const rnode = await withTimeout(RNode.fromSerialPort(port), 8000, t("err.portopen"));
  await port.setSignals({ dataTerminalReady: true, requestToSend: false }).catch(() => {});
  try {
    const start = Date.now();
    while (Date.now() - start < 20000) {
      if (await rnode.detect()) return rnode;
      const rom = await Promise.race([rnode.getRom().catch(() => null), sleep(1500).then(() => null)]);
      if (rom && rom.length >= 0x9c) return rnode;
      await sleep(500);
    }
    throw new Error(t("err.noanswer"));
  } catch (e) {
    await closeQuiet(rnode);
    throw e;
  }
}

async function openRNode(port) {
  port = port || await pickPort();
  if (port.getInfo().usbVendorId !== 0x303a) return openRNodeNrf(port);   // nicht Espressif: nRF-Weg
  // Rohdaten mitschreiben: Die Firmware gibt beim Start Textzeilen aus, die zeigen, wo sie gerade steht.
  let raw = [], rawCount = 0;
  RNode.rawTap = (chunk) => { rawCount += chunk.length; raw.push(...chunk); if (raw.length > 4000) raw = raw.slice(-4000); };
  const rnode = await withTimeout(RNode.fromSerialPort(port), 8000, t("err.portopen"));
  // Der Browser setzt beim Öffnen DTR und RTS. Auf dem ESP32-S3 (USB-Serial-JTAG) führt das beim nächsten Neustart
  // in den Download-Modus: das Board schweigt dann, die Firmware läuft nicht. Deshalb gleich beide loslassen.
  const setLines = (dtr, rts) => port.setSignals({ dataTerminalReady: dtr, requestToSend: rts }).catch(() => {});
  await setLines(false, false);
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
      if (!resetTried && Date.now() - start >= 6000) {
        // Keine Antwort: vermutlich steckt der Chip im Download-Modus. Einmal sauber in die Firmware neu starten.
        resetTried = true;
        log(t("log.noanswer.reset"));
        await setLines(false, true);
        await sleep(200);
        await setLines(false, false);
        await sleep(1500);
      }
      if (Date.now() - start >= nextNote) {
        log(t("log.waiting", { s: Math.round((Date.now() - start) / 1000), n: rawCount }));
        nextNote += 10000;
      }
      await sleep(500);
    }
    const text = new TextDecoder().decode(new Uint8Array(raw)).replace(/[^\x20-\x7e\r\n]/g, "·").trim();
    log(t("log.received", { n: rawCount, text: text.slice(-800) || t("log.nothing") }));
    throw new Error(t("err.noanswer"));
  } catch (e) {
    await closeQuiet(rnode);
    throw e;
  } finally {
    RNode.rawTap = null;
  }
}

// ---- Bluetooth -------------------------------------------------------------
// Die Firmware erzeugt den PIN beim Befehl "Pairing starten" (nicht erst, wenn das Smartphone fragt) und hält das
// Pairing-Fenster 35 Sekunden offen. Die USB-Verbindung bleibt offen, bis sie getrennt wird.

const renderBtStatus = () => { $("bt-status").textContent = t(btStatusState.key, btStatusState.params); };
const btStatus = (key, params) => { btStatusState = { key, params }; renderBtStatus(); };

function btHidePin() {
  clearInterval(btTimer);
  $("bt-pin-wrap").classList.add("hidden");
  $("bt-pin").textContent = "------";
}

function btOnDisconnect(e) {
  if (!btSession || e.target !== btSession.serialPort) return;
  const rnode = btSession;
  btEnd("bt.lost");
  btClose(rnode);   // Leser und Port freigeben, sonst bleibt der alte Port belegt
}

function btEnd(key, params) {
  btSession = null;
  navigator.serial.removeEventListener("disconnect", btOnDisconnect);
  btHidePin();
  btStatus(key, params);
  updateButtons();
}

async function btOpen() {
  if (btSession) return btSession;
  const port = await pickPort();   // zuerst, solange die Klick-Erlaubnis gilt
  btSession = await openRNode(port);
  navigator.serial.addEventListener("disconnect", btOnDisconnect);
  updateButtons();
  return btSession;
}

async function btClose(rnode) {
  delete rnode.callbacks[rnode.CMD_BT_PIN];
  await closeQuiet(rnode);
}

async function bluetoothPair() {
  const rnode = await btOpen();
  btHidePin();
  btStatus("bt.starting");
  let gotPin;
  const pinPromise = new Promise((resolve) => { gotPin = resolve; });
  await rnode.startBluetoothPairing(gotPin);
  let pin;
  try {
    pin = await withTimeout(pinPromise, BT_PIN_WAIT_MS, t("err.nopin"));
  } catch (e) {
    delete rnode.callbacks[rnode.CMD_BT_PIN];
    btStatus("bt.nopin");
    throw e;
  }
  $("bt-pin").textContent = String(pin).padStart(6, "0");
  $("bt-pin-wrap").classList.remove("hidden");
  log(t("log.pin", { pin }), "ok");
  let left = BT_PAIRING_WINDOW_S;
  const tick = () => {
    if (left <= 0) {
      btHidePin();
      btStatus("bt.window.expired");
      return;
    }
    btStatus("bt.window.left", { n: left });
    left--;
  };
  tick();
  btTimer = setInterval(tick, 1000);
}

async function bluetoothClose() {
  if (!btSession) return;
  await btClose(btSession);
  btEnd("bt.closed");
}

// Schaltet Bluetooth am Board ein und speichert "an" (die Firmware sendet sofort).
async function bluetoothOn() {
  const rnode = await btOpen();
  try {
    await rnode.enableBluetooth();
    await sleep(1500);   // Zustand ins Board schreiben lassen
  } finally {
    await btClose(rnode);
    btEnd("bt.on.done");
  }
}

// Schaltet Bluetooth am Board aus und speichert "aus". Die nRF52-Firmware hört danach nicht sofort auf zu senden,
// erst ein Neustart beendet es: deshalb startet die Seite das Board nach dem Speichern neu.
async function bluetoothOff() {
  const rnode = await btOpen();
  try {
    await rnode.disableBluetooth();
    await sleep(1500);   // Zustand ins Board schreiben lassen, bevor es neu startet
    navigator.serial.removeEventListener("disconnect", btOnDisconnect);   // der Neustart trennt USB absichtlich
    log(t("log.btrestart"));
    try { await withTimeout(rnode.reset(), 3000, "reset"); } catch (_) { /* hat sich vielleicht schon selbst neu gestartet */ }
  } finally {
    await btClose(rnode);
    btEnd("bt.off.done");
  }
}

async function wipeEeprom() {
  const port = await pickPort();   // zuerst, solange die Klick-Erlaubnis gilt
  if (!confirm(t("confirm.wipe"))) throw new Error(t("err.cancelled"));
  const rnode = await openRNode(port);
  log(t("log.wiping"));
  await rnode.wipeRom();
  await rnode.close();
  log(t("log.wiped"));
}

async function provisionEeprom() {
  const b = board();
  const rnode = await openRNode();
  try {
    const rom = await rnode.getRomAsObject();
    if (rom.parse()) throw new Error(t("err.eeprom.done"));
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
      throw new Error(t("err.readback", { info: JSON.stringify(back) }));
    }
    log(t("log.readback", { product: back.product.toString(16), model: back.model.toString(16) }));
    // Die Firmware berechnet ihren Hash erst nach einem Neustart: neu starten, denselben Port wieder öffnen, Hash setzen.
    const port = rnode.serialPort;
    const watch = watchReconnect(port);
    try { await withTimeout(rnode.reset(), 3000, "reset"); } catch (_) { /* hat sich vielleicht schon selbst neu gestartet */ }
    await closeQuiet(rnode);
    log(t("log.restart"));
    const again = await reopenAfterReset(port, watch);
    try {
      await applyFirmwareHash(again);
    } finally {
      await closeQuiet(again);
    }
  } finally {
    await closeQuiet(rnode);
  }
  log(t("log.finished"));
}

// Trägt den Hash der laufenden Firmware als erwarteten Wert ein und liest ihn zurück.
// Direkt nach dem Einrichten des EEPROMs meldet die Firmware noch nur Nullen: sie berechnet den Hash erst beim
// nächsten Start. Nullen werden deshalb nie eingetragen, sondern es wird auf den echten Wert gewartet.
const isZeroHash = (h) => h.every((b) => b === 0);

// Befehl mit Zeitgrenze und Wiederholung: eine verlorene Antwort darf den Ablauf nicht für immer blockieren.
async function askRetry(fn, what) {
  for (let i = 0; i < 6; i++) {
    try { return await withTimeout(fn(), 3000, t("err.timeout.noanswer")); } catch (_) { await sleep(300); }
  }
  throw new Error(t("err.noreply", { what }));
}

async function applyFirmwareHash(rnode) {
  let actual = await askRetry(() => rnode.getFirmwareHash(), t("what.hashread"));
  for (let i = 0; i < 10 && isZeroHash(actual); i++) {
    await sleep(1000);
    actual = await askRetry(() => rnode.getFirmwareHash(), t("what.hashread"));
  }
  if (isZeroHash(actual)) throw new Error(t("err.nohash"));
  await rnode.setFirmwareHash(actual);
  await sleep(2000);
  const target = await askRetry(() => rnode.getTargetFirmwareHash(), t("what.savedhash"));
  if (hex(target) !== hex(actual)) {
    throw new Error(t("err.hashmismatch", { want: hex(actual), got: hex(target) }));
  }
  log(t("log.hashset", { hash: hex(actual).slice(0, 16) }));
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
      if (!noted) { log(t("log.back")); noted = true; }
      log(t("log.open"));
      try {
        return await withTimeout(openRNode(cand), 40000, t("err.opentimeout"));
      } catch (e) {
        lastErr = e && e.message ? e.message : String(e);
        watch.port = null;
      }
    }
  } finally {
    watch.stop();
  }
  throw new Error(t("err.noreturn", { detail: lastErr ? " (" + lastErr + ")" : "" }));
}

async function setFirmwareHash() {
  const rnode = await openRNode();
  try {
    const details = (await rnode.getRomAsObject()).parse();
    if (!details || !details.is_provisioned) throw new Error(t("err.notprov"));
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
      log(t("log.eeprom.none"));
    } else {
      log(t("log.eeprom", { state: d.is_provisioned ? t("state.ok") : t("state.bad"),
        product: d.product.toString(16), model: d.model.toString(16), hw: d.hardware_revision, serial: d.serial_number }));
      log(t("log.checksum", { a: d.checksum, b: d.calculated_checksum }));
      log(t("log.configured", { v: d.is_configured ? t("yes") : t("no") }));
    }
    const target = await rnode.getTargetFirmwareHash();
    const actual = await rnode.getFirmwareHash();
    log(t("log.hash.set", { h: hex(target) }));
    log(t("log.hash.actual", { h: hex(actual) }));
    log(hex(target) === hex(actual) ? t("log.hash.ok") : t("log.hash.bad"), hex(target) === hex(actual) ? "ok" : "err");
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

const renderFwInfo = () => { $("fwinfo").textContent = t(fwState.key, fwState.params); };

async function loadManifest() {
  try {
    const m = await (await fetch("firmware/manifest.json", { cache: "no-cache" })).json();
    fwState = { key: "fw.info", params: { commit: m.commit.slice(0, 7), built: m.built.replace("T", " ").replace("Z", "") } };
  } catch (_) {
    fwState = { key: "fw.unknown" };
  }
  renderFwInfo();
}

// Texte nach dem Sprachwechsel neu setzen, die aus dem Programm kommen (Status, Firmware-Stand, "Bereit.").
function renderDynamic() {
  renderBtStatus();
  renderFwInfo();
  if (logPristine) logEl.textContent = t("log.ready");
}

function chooseLang(l) {
  setLang(l);
  applyStatic();
  renderDynamic();
}

initLang();
applyStatic();
renderDynamic();
document.querySelectorAll("[data-lang]").forEach((b) => { b.onclick = () => chooseLang(b.dataset.lang); });

if (!("serial" in navigator)) {
  $("nosupport").classList.remove("hidden");
  document.querySelectorAll("button").forEach((b) => { if (!b.id.startsWith("lang-")) b.disabled = true; });
} else {
  $("btn-flash-esp32").onclick = () => run("act.flash.esp", flashEsp32);
  $("btn-flash-nrf").onclick = () => run("act.flash.nrf", flashNrf);
  $("btn-wipe").onclick = () => run("act.wipe", wipeEeprom);
  $("btn-provision").onclick = () => run("act.provision", provisionEeprom);
  $("btn-hash").onclick = () => run("act.hash", setFirmwareHash);
  $("btn-inspect").onclick = () => run("act.inspect", inspectNode);
  $("btn-bt-on").onclick = () => run("act.bton", bluetoothOn);
  $("btn-bt-off").onclick = () => run("act.btoff", bluetoothOff);
  $("btn-bt-pair").onclick = () => run("act.btpair", bluetoothPair);
  $("btn-bt-close").onclick = () => run("act.btclose", bluetoothClose);
  updateButtons();
}
document.querySelectorAll('input[name="board"]').forEach((r) => r.addEventListener("change", updateView));
updateView();
loadManifest();
