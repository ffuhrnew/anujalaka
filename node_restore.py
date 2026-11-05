#!/usr/bin/env python3
"""node_restore.py - Einstellungen aus einer node_backup.py-Sicherung per USB auf einen Node zurückspielen.

Aufruf:  node_restore.py SICHERUNG.json PORT [--apply]

Ohne --apply wird nur angezeigt, was geschrieben würde (Probelauf, am Node ändert sich nichts).
Mit --apply werden die Werte als Entwurf gesetzt und danach übernommen (Commit).

Zurückgespielt werden nur beschreibbare Felder, die im Schema des Nodes vorhanden sind (Name, Funk,
Allow-Liste, Transport-Optionen, Grenzen ...). Messwerte (nur lesbar) und geheime Felder fehlen in der
Sicherung bzw. werden übersprungen: die Transport-Identity wird NICHT zurückgespielt, der Node behält
seine (neue) Identity. Felder mit "Neustart nötig" wirken erst nach einem Neustart des Nodes.
"""

import json
import sys

import node_backup as nb

OP_SET_STATE, OP_COMMIT = 5, 6
KEY_STATE, KEY_INCLUDE_STATE = 3, 5
F_FLAGS = 4
FLAG_READ_ONLY, FLAG_SECRET, FLAG_WRITE_ONLY = 1 << 2, 1 << 3, 1 << 4
T_BYTES, T_BYTESLIST = 5, 7


def fields_from_schema(raw):
    out = {}
    for f in raw or []:
        if isinstance(f, dict) and f.get(1) is not None:
            out[int(f[1])] = {"type": int(f.get(nb.F_TYPE, 0)), "flags": int(f.get(F_FLAGS, 0))}
    return out


def convert(value, ftype):
    """JSON-Wert der Sicherung (Bytes als Hex) -> Wert für die Anfrage."""
    if ftype == T_BYTES:
        return bytes.fromhex(value) if isinstance(value, str) else None
    if ftype == T_BYTESLIST:
        return [bytes.fromhex(v) for v in value] if isinstance(value, list) else None
    return value


def plan(backup, link):
    """-> (state {ns: {fid: wert}}, Liste lesbarer Zeilen, Liste übersprungener Felder)"""
    state, lines, skipped = {}, [], []
    for ns_text, ns in sorted(backup.get("werte", {}).items(), key=lambda kv: int(kv[0])):
        ns_id = int(ns_text)
        try:
            body = link.request(nb.OP_GET_SCHEMA, {nb.KEY_NS_FILTER: [ns_id]})
        except nb.BackupError as exc:
            raise nb.BackupError("Schema von Namespace %d nicht lesbar: %s" % (ns_id, exc))
        schema = {}
        for entry in body or []:
            if isinstance(entry, list) and len(entry) >= 3 and int(entry[0]) == ns_id:
                schema = fields_from_schema(entry[3] if len(entry) >= 4 else entry[2])
        for fid_text, item in sorted(ns.get("felder", {}).items(), key=lambda kv: int(kv[0])):
            fid = int(fid_text)
            label = "%s / %s" % (ns.get("name") or ns_id, item.get("name") or fid)
            meta = schema.get(fid)
            if meta is None:
                skipped.append("%s (Feld gibt es auf dem Node nicht)" % label); continue
            if meta["flags"] & (FLAG_READ_ONLY | FLAG_SECRET | FLAG_WRITE_ONLY):
                continue   # Messwert oder geheim: nichts zurückzuspielen
            value = convert(item.get("wert"), meta["type"])
            if value is None:
                skipped.append("%s (Wert unlesbar)" % label); continue
            state.setdefault(ns_id, {})[fid] = value
            shown = item.get("wert")
            lines.append("%s = %s" % (label, json.dumps(shown, ensure_ascii=False)))
    return state, lines, skipped


def main(argv):
    args = [a for a in argv[1:] if a != "--apply"]
    apply = "--apply" in argv[1:]
    if len(args) != 2:
        sys.exit("Aufruf: node_restore.py SICHERUNG.json PORT [--apply]")
    try:
        with open(args[0], encoding="utf-8") as fh:
            backup = json.load(fh)
    except (OSError, ValueError) as exc:
        print("FEHLER: Sicherung nicht lesbar: %s" % exc, file=sys.stderr)
        return 1
    try:
        link = nb.NodeLink(args[1])
    except nb.BackupError as exc:
        print("FEHLER: %s" % exc, file=sys.stderr)
        return 1
    try:
        state, lines, skipped = plan(backup, link)
        print("Sicherung von: %s (%s)" % (backup.get("name") or "(ohne Namen)", backup.get("gesichert_am", "?")))
        for line in lines:
            print("  " + line)
        for s in skipped:
            print("  übersprungen: " + s)
        if not state:
            print("FEHLER: nichts zum Zurückspielen gefunden", file=sys.stderr)
            return 1
        if not apply:
            print("Probelauf: %d Felder würden geschrieben. Mit --apply wirklich schreiben." % sum(len(f) for f in state.values()))
            return 0
        res = link.request(OP_SET_STATE, {KEY_STATE: state})
        errors = res.get(3) if isinstance(res, dict) else None
        res2 = link.request(OP_COMMIT, None)
        needs_reboot = bool(res2.get(2)) if isinstance(res2, dict) else False
        applied = res2.get(1) if isinstance(res2, dict) else None
        if errors:
            print("HINWEIS: der Node hat einzelne Felder abgelehnt: %s" % errors)
        print("Zurückgespielt: %s Felder übernommen%s." % (applied, ", Neustart nötig" if needs_reboot else ""))
        return 1 if errors else 0
    except nb.BackupError as exc:
        print("FEHLER: %s" % exc, file=sys.stderr)
        return 1
    finally:
        link.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
