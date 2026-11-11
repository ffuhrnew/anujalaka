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

async function flashEsp32() {
  const b = board();
  const full = mode() === "full";
  const password = $("ota-pw").value;
  if (password) {
    const problem = checkPassword(password);
    if (problem) throw new Error(problem);
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
  if (full && !confirm("„Neu einrichten“ löscht den ganzen Flash des Nodes (Einstellungen, Identität, Zugriffsliste). Fortfahren?")) {
    throw new Error("abgebrochen");
  }
  const port = await pickPort();
  const transport = new Transport(port, true);
  const loader = new ESPLoader({
    transport,
    baudrate: 921600,
    terminal: { clean() {}, writeLine: (t) => log(t), write: (t) => log(t) },
  });
  await loader.main();
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
  // Neustart über DTR, wie im rnode-flasher
  await transport.setDTR(false);
  await sleep(100);
  await transport.setDTR(true);
  try { await transport.disconnect(); } catch (_) { /* Port war schon zu */ }
  log("Danach: Schritt 3 (Firmware-Hash setzen" + (full ? ", vorher EEPROM einrichten" : "") + ").");
}

async function enterDfu() {
  const port = await pickPort();
  await new Nrf52DfuFlasher(port).enterDfuMode();
  log("Board sollte jetzt im DFU-Modus sein. Als Nächstes „Flashen“.");
}

async function flashNrf() {
  const b = board();
  const bytes = await fetchBytes(b.zip);
  log(b.zip.split("/").pop() + ": " + bytes.length + " Bytes");
  const port = await pickPort();
  const flasher = new Nrf52DfuFlasher(port);
  await flasher.flash(new Blob([bytes]), (pct) => setProgress(Math.floor(pct)));
  try { await port.close(); } catch (_) { /* schon zu */ }
  log("Danach: Schritt 3 (Firmware-Hash setzen" + (mode() === "full" ? ", vorher EEPROM einrichten" : "") + ").");
}

// ---- Nach dem Flashen ------------------------------------------------------

async function openRNode() {
  const port = await pickPort();
  const rnode = await RNode.fromSerialPort(port);
  if (!(await rnode.detect())) {
    await rnode.close();
    throw new Error("Das gewählte Gerät meldet sich nicht als RNode. Nach dem Flashen kurz warten, dann nochmal.");
  }
  return rnode;
}

async function wipeEeprom() {
  if (!confirm("Das löscht den EEPROM des Nodes (Gerätedaten und Funk-Einstellungen). Fortfahren?")) throw new Error("abgebrochen");
  const rnode = await openRNode();
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
    await sleep(5000); // EEPROM-Schreibvorgänge abwarten
    await rnode.reset();
  } finally {
    await rnode.close();
  }
  log("Danach Board kurz neu anstecken, dann Schritt c.");
}

async function setFirmwareHash() {
  const rnode = await openRNode();
  try {
    const details = (await rnode.getRomAsObject()).parse();
    if (!details || !details.is_provisioned) throw new Error("Der EEPROM ist nicht eingerichtet. Erst Schritt b.");
    // Der Node kennt den Hash seiner eigenen Firmware und bekommt ihn hier als erwarteten Wert eingetragen.
    await rnode.setFirmwareHash(await rnode.getFirmwareHash());
    await sleep(5000);
    try { await rnode.reset(); } catch (_) { /* hat sich vielleicht selbst neu gestartet */ }
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
  $("btn-dfu").onclick = () => run("DFU-Modus", enterDfu);
  $("btn-flash-nrf").onclick = () => run("Flashen (nRF52)", flashNrf);
  $("btn-wipe").onclick = () => run("EEPROM leeren", wipeEeprom);
  $("btn-provision").onclick = () => run("EEPROM einrichten", provisionEeprom);
  $("btn-hash").onclick = () => run("Firmware-Hash setzen", setFirmwareHash);
}
document.querySelectorAll('input[name="board"]').forEach((r) => r.addEventListener("change", updateView));
updateView();
loadManifest();
