#!/usr/bin/env python3
"""make_manifest.py <firmware-ordner> <commit>

Schreibt <firmware-ordner>/manifest.json mit Commit, Bauzeit und SHA-256 jeder Datei.
Bricht ab, wenn eine von der Flasher-Seite erwartete Datei fehlt."""
import hashlib, json, os, sys, datetime

EXPECTED = [
    "rak4631.zip",
    "xiao_nrf52840.zip",
    "xiao_nrf52840.uf2",
    "xiao_esp32s3/bootloader.bin",
    "xiao_esp32s3/partitions.bin",
    "xiao_esp32s3/boot_app0.bin",
    "xiao_esp32s3/firmware.bin",
]

# Optionale Boards: nur aufnehmen, wenn ihr Bau gelungen ist. Fehlen sie, fehlt das Board im Flasher, der Rest bleibt.
OPTIONAL = [
    "heltec_v3/bootloader.bin",
    "heltec_v3/partitions.bin",
    "heltec_v3/boot_app0.bin",
    "heltec_v3/firmware.bin",
]

def main():
    root, commit = sys.argv[1], sys.argv[2]
    files = {}
    for rel in EXPECTED:
        path = os.path.join(root, rel)
        if not os.path.isfile(path):
            sys.exit("FEHLER: %s fehlt" % rel)
        data = open(path, "rb").read()
        files[rel] = {"size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    optional = [r for r in OPTIONAL if os.path.isfile(os.path.join(root, r))]
    if 0 < len(optional) < len(OPTIONAL):   # halbes Board: gar nicht anbieten
        optional = []
    for rel in optional:
        data = open(os.path.join(root, rel), "rb").read()
        files[rel] = {"size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    manifest = {
        "commit": commit,
        "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": files,
    }
    with open(os.path.join(root, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(json.dumps(manifest, indent=2))

main()
