// patch_cli.mjs <eingabe.bin> <ausgabe.bin> <passwort>
// Trägt ein Passwort wie die Flasher-Seite (site/espimage.js) in ein ESP32-Abbild ein. Für die Prüfung im CI.
import { readFileSync, writeFileSync } from "node:fs";
import { patchOtaPassword } from "../site/espimage.js";

const [inFile, outFile, password] = process.argv.slice(2);
const image = new Uint8Array(readFileSync(inFile));
const patched = await patchOtaPassword(image, password);
writeFileSync(outFile, patched);
let changed = 0;
for (let i = 0; i < image.length; i++) if (image[i] !== patched[i]) changed++;
console.log(`Passwort eingetragen: ${image.length} Bytes, ${changed} Bytes geändert`);
