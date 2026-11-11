// Trägt das WLAN-Passwort für das Update-Fenster in ein ESP32-Firmware-Abbild ein.
//
// Die Firmware (OtaWifi.h) hat einen Platz: MARKER + Statusbyte ('-' leer, 'P' gesetzt) + 64 Byte Passwort.
// Nach dem Ändern müssen die Prüfsumme (letztes Byte der 16er-Ausrichtung nach dem letzten Segment) und der
// angehängte SHA-256 neu berechnet werden, sonst lehnt der Bootloader das Abbild ab. Vorher wird geprüft, dass
// das Original beides schon korrekt hat. Passt das nicht, wird nichts verändert.

const MARKER = "@@OTA-PW-v1@@";
const PW_LEN = 64;
const ESP_MAGIC = 0xe9;
const CHECKSUM_INIT = 0xef;

const enc = new TextEncoder();

function findAll(bytes, needle) {
  const hits = [];
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    hits.push(i);
  }
  return hits;
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

// Liest den Aufbau des Abbilds: Segmente, Position des Prüfsummenbytes, angehängter Hash.
function readLayout(img) {
  if (img[0] !== ESP_MAGIC) throw new Error("Das ist kein ESP32-Firmware-Abbild.");
  const segments = img[1];
  const hashAppended = img[23] === 1;
  const view = new DataView(img.buffer, img.byteOffset, img.byteLength);
  let pos = 24;
  let checksum = CHECKSUM_INIT;
  for (let s = 0; s < segments; s++) {
    const len = view.getUint32(pos + 4, true);
    const start = pos + 8;
    if (start + len > img.length) throw new Error("Abbild ist abgeschnitten.");
    for (let i = start; i < start + len; i++) checksum ^= img[i];
    pos = start + len;
  }
  const checksumIndex = ((pos + 16) & ~15) - 1;
  return { checksum, checksumIndex, hashAppended };
}

async function verified(img) {
  const { checksum, checksumIndex, hashAppended } = readLayout(img);
  if (img[checksumIndex] !== checksum) throw new Error("Prüfsumme des Original-Abbilds stimmt nicht, nichts verändert.");
  if (hashAppended) {
    if (img.length !== checksumIndex + 1 + 32) throw new Error("Unerwartete Länge des Abbilds, nichts verändert.");
    const want = await sha256(img.subarray(0, checksumIndex + 1));
    for (let i = 0; i < 32; i++) if (img[checksumIndex + 1 + i] !== want[i]) throw new Error("Hash des Original-Abbilds stimmt nicht, nichts verändert.");
  }
  return { checksumIndex, hashAppended };
}

export function checkPassword(password) {
  if (password.length < 8 || password.length > 63) return "Das Passwort braucht 8 bis 63 Zeichen.";
  if (!/^[\x20-\x7e]+$/.test(password)) return "Nur einfache Zeichen ohne Umlaute und Sonderzeichen (ASCII).";
  return null;
}

// Gibt ein neues Abbild zurück, das Original bleibt unverändert.
export async function patchOtaPassword(image, password) {
  const problem = checkPassword(password);
  if (problem) throw new Error(problem);

  const marker = enc.encode(MARKER);
  const hits = findAll(image, marker);
  if (hits.length !== 1) throw new Error("In der Firmware wurde der Passwort-Platz " + (hits.length ? "mehrfach" : "nicht") + " gefunden. Ist sie neu genug gebaut?");
  const state = hits[0] + marker.length;
  if (image[state] !== "-".charCodeAt(0) && image[state] !== "P".charCodeAt(0)) throw new Error("Passwort-Platz hat einen unbekannten Zustand.");

  await verified(image);

  const out = image.slice();
  out[state] = "P".charCodeAt(0);
  out.fill(0, state + 1, state + 1 + PW_LEN);
  out.set(enc.encode(password), state + 1);

  const { checksum, checksumIndex, hashAppended } = readLayout(out);
  out[checksumIndex] = checksum;
  if (hashAppended) out.set(await sha256(out.subarray(0, checksumIndex + 1)), checksumIndex + 1);
  await verified(out);   // eigene Gegenprobe
  return out;
}
