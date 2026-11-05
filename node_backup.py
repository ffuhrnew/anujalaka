#!/usr/bin/env python3
"""node_backup.py - Einstellungen eines Nodes per USB auslesen und als lesbares JSON sichern.

Aufruf:  node_backup.py PORT [ZIELORDNER]      (Standard: ~/node-backups)

Nutzt denselben Verwaltungskanal wie mikara und die Webconsole, nur seriell:
KISS-Rahmen mit Befehl 0x86 (Anfrage) und 0x87 (Antwort), Inhalt MsgPack [op, seq, body].
Gesichert werden die lesbaren Werte (Name, Funk, Allow-Liste, Transport usw.) mit Namespace- und
Feldnamen sowie ggf. Entwürfe. Geheime Schlüssel gibt der Node nicht heraus; die Transport-Identity
ist damit NICHT gesichert.
"""

import json
import os
import re
import sys
import time

try:
    import serial
except ImportError:
    sys.exit("FEHLER: pyserial fehlt (Python-Umgebung von rnodeconf verwenden)")

try:
    from RNS.vendor import umsgpack as _mp
    packb, unpackb = _mp.packb, _mp.unpackb
except ImportError:
    try:
        import msgpack as _mp
        packb = _mp.packb
        unpackb = lambda b: _mp.unpackb(b, raw=False, strict_map_key=False)  # noqa: E731
    except ImportError:
        sys.exit("FEHLER: weder RNS noch msgpack gefunden (Python-Umgebung von rnodeconf verwenden)")

FEND, FESC, TFEND, TFESC = 0xC0, 0xDB, 0xDC, 0xDD
CMD_REQ, CMD_RSP = 0x86, 0x87
OP_GET_SCHEMA, OP_GET_INFO, OP_GET_CAPABILITIES, OP_GET_STATE, OP_ERROR = 1, 2, 3, 4, 101
KEY_NS_FILTER, KEY_DRAFT = 1, 2   # Anfrage GetSchema: Namespace-Filter; GetState: auch Entwürfe liefern
NS_GENERAL, FIELD_NAME = 100, 5   # "RNode General Config" / "NomadNet Name"
# Schlüssel in der Schema-Antwort
F_NAME, F_TYPE, F_ENUM_VALUES, F_ENUM_LABELS = 2, 3, 10, 11
TYPE_NAMES = {0: "none", 1: "bool", 2: "int", 3: "float", 4: "string", 5: "bytes",
              6: "enum", 7: "byteslist", 8: "void"}

TIMEOUT = 6.0        # Sekunden je Versuch
TRIES = 3
SCHEMA_PAUSE = 0.2   # Pause zwischen den Schema-Anfragen, schont den Speicher des Nodes


class BackupError(Exception):
    pass


def escape(data):
    out = bytearray()
    for b in data:
        if b == FEND:
            out += bytes((FESC, TFEND))
        elif b == FESC:
            out += bytes((FESC, TFESC))
        else:
            out.append(b)
    return bytes(out)


class NodeLink:
    def __init__(self, port):
        ser = serial.Serial()
        ser.port = port
        ser.baudrate = 115200
        ser.timeout = 0.2
        ser.dtr = False   # sonst kann ein ESP32 beim Öffnen des Ports neu starten
        ser.rts = False   # (nRF52 sendet erst mit gesetztem DTR: das holt request() beim 2. Versuch nach)
        try:
            ser.open()
        except (OSError, serial.SerialException) as exc:
            raise BackupError("Port %s nicht zu öffnen: %s" % (port, exc))
        self.ser = ser
        self._seq = 0
        self._reset_parser()

    def close(self):
        try:
            self.ser.close()
        except Exception:
            pass

    def _reset_parser(self):
        self._in_frame = False
        self._esc = False
        self._cmd = None
        self._buf = bytearray()

    def _feed(self, data):
        """KISS-Rahmen aus den empfangenen Bytes; Text und fremde Rahmen (Logs) werden übergangen."""
        frames = []
        for b in data:
            if b == FEND:
                if self._in_frame and self._cmd is not None:
                    frames.append((self._cmd, bytes(self._buf)))
                self._in_frame, self._cmd, self._buf, self._esc = True, None, bytearray(), False
            elif self._in_frame:
                if self._cmd is None:
                    self._cmd = b
                elif self._esc:
                    self._buf.append(FEND if b == TFEND else FESC if b == TFESC else b)
                    self._esc = False
                elif b == FESC:
                    self._esc = True
                else:
                    self._buf.append(b)
        return frames

    def _once(self, op, payload):
        self._seq += 1
        seq = self._seq
        env = [op, seq] if payload is None else [op, seq, payload]
        self.ser.reset_input_buffer()
        self._reset_parser()
        self.ser.write(bytes((FEND, CMD_REQ)) + escape(packb(env)) + bytes((FEND,)))
        self.ser.flush()
        end = time.time() + TIMEOUT
        while time.time() < end:
            for cmd, data in self._feed(self.ser.read(512)):
                if cmd != CMD_RSP:
                    continue
                try:
                    msg = unpackb(data)
                except Exception:
                    continue
                if not isinstance(msg, list) or len(msg) < 2 or int(msg[1]) != seq:
                    continue
                body = msg[2] if len(msg) > 2 else None
                if int(msg[0]) == OP_ERROR:
                    text = body.get(2, "Fehler") if isinstance(body, dict) else "Fehler"
                    raise BackupError("Node meldet Fehler: %s" % text)
                return body
        return None

    def _assert_dtr(self):
        """Der nRF52 (Adafruit TinyUSB) schickt nur Daten, solange der Host DTR gesetzt hat."""
        if self.ser.dtr:
            return
        try:
            self.ser.dtr = True
        except (OSError, serial.SerialException):
            pass

    def request(self, op, payload=None):
        for attempt in range(TRIES):
            if attempt == 1:
                self._assert_dtr()   # erster Versuch ohne DTR (ESP32-sicher), danach mit
            body = self._once(op, payload)
            if body is not None:
                return body
        raise BackupError("Keine Antwort vom Node (Operation %d). Läuft die Firmware mit Provisioning?" % op)


def to_json(value):
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).hex()
    if isinstance(value, dict):
        return {str(k): to_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json(v) for v in value]
    return value


def ns_map(m):
    return {int(ns): {int(f): v for f, v in fields.items()}
            for ns, fields in (m or {}).items() if isinstance(fields, dict)}


def split_state(body):
    """Neue Firmware: {1: Werte, 2: Entwürfe, 3: Hash}; ältere: flach {ns: {feld: wert}}."""
    if not isinstance(body, dict):
        raise BackupError("Unerwartete Antwort auf GetState")
    vals = body.get(1)
    wrapped = all(k in (1, 2, 3) for k in body) and (
        vals is None or (isinstance(vals, dict) and all(isinstance(v, dict) for v in vals.values())))
    if wrapped:
        return ns_map(vals), ns_map(body.get(2))
    return ns_map(body), {}


def parse_fields(raw):
    out = {}
    for f in raw or []:
        if not isinstance(f, dict) or f.get(1) is None:
            continue
        item = {"name": str(f.get(F_NAME) or ""), "typ": TYPE_NAMES.get(int(f.get(F_TYPE, 0)), "none")}
        values, labels = f.get(F_ENUM_VALUES), f.get(F_ENUM_LABELS)
        if values is not None and labels is not None:
            item["auswahl"] = {int(v): str(l) for v, l in zip(values, labels)}
        out[int(f[1])] = item
    return out


def read_schema(link, ns_ids):
    """Feldnamen je Namespace, ein Namespace je Anfrage (wie mikara). Schlägt eine Anfrage fehl, wird der
    Rest übersprungen: die Sicherung der Werte bleibt gültig, nur ohne Feldnamen."""
    out, problem = {}, None
    for ns_id in ns_ids:
        try:
            body = link.request(OP_GET_SCHEMA, {KEY_NS_FILTER: [ns_id]})
        except BackupError as exc:
            problem = str(exc)
            break
        for entry in body or []:
            if isinstance(entry, list) and len(entry) >= 3 and int(entry[0]) == ns_id:
                out[ns_id] = parse_fields(entry[3] if len(entry) >= 4 else entry[2])
        time.sleep(SCHEMA_PAUSE)
    return out, problem


def build_values(values, names, schema):
    out = {}
    for ns, fields in sorted(values.items()):
        sch = schema.get(ns, {})
        felder = {}
        for fid, val in sorted(fields.items()):
            f = sch.get(fid, {})
            item = {"name": f.get("name", ""), "wert": to_json(val)}
            if f.get("typ"):
                item["typ"] = f["typ"]
            labels = f.get("auswahl")
            if labels and isinstance(val, int) and val in labels:
                item["text"] = labels[val]
            felder[str(fid)] = item
        out[str(ns)] = {"name": names.get(ns, ""), "felder": felder}
    return out


def backup(port, outdir):
    link = NodeLink(port)
    try:
        info = link.request(OP_GET_INFO) or {}
        caps = link.request(OP_GET_CAPABILITIES) or []
        values, drafts = split_state(link.request(OP_GET_STATE, {KEY_DRAFT: True}))
        if not values:
            raise BackupError("Der Node hat keine Werte geliefert")
        schema, schema_problem = read_schema(link, sorted(values))
    finally:
        link.close()

    names = {}
    for c in caps:
        if isinstance(c, dict) and c.get(1) is not None:
            names[int(c[1])] = str(c.get(2) or "")

    node_name = str(values.get(NS_GENERAL, {}).get(FIELD_NAME) or "")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", node_name).strip("_")[:60] or "node"
    os.makedirs(outdir, mode=0o700, exist_ok=True)
    path = os.path.join(outdir, "%s-%s.json" % (stamp, safe))

    doc = {
        "gesichert_am": time.strftime("%Y-%m-%d %H:%M:%S"),
        "port": port,
        "name": node_name,
        "info": {"firmware": info.get(1), "schema_version": info.get(2), "schema_hash": info.get(4)},
        "feldnamen": "vollständig" if not schema_problem else "unvollständig: " + schema_problem,
        "werte": build_values(values, names, schema),
        "entwuerfe": build_values(drafts, names, schema),
        "hinweis": "Geheime Schlüssel (u. a. Transport-Identity) sind nicht enthalten.",
    }
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump(doc, fh, indent=2, ensure_ascii=False)

    return {"path": path, "name": node_name, "firmware": info.get(1), "schema_problem": schema_problem,
            "namespaces": len(values), "werte": sum(len(f) for f in values.values())}


def main(argv):
    if len(argv) < 2:
        sys.exit("Aufruf: node_backup.py PORT [ZIELORDNER]")
    outdir = argv[2] if len(argv) > 2 else os.path.expanduser("~/node-backups")
    try:
        r = backup(argv[1], outdir)
    except BackupError as exc:
        print("FEHLER: %s" % exc, file=sys.stderr)
        return 1
    print("Node:       %s" % (r["name"] or "(ohne Namen)"))
    print("Firmware:   %s" % r["firmware"])
    print("Gesichert:  %d Namespaces, %d Werte" % (r["namespaces"], r["werte"]))
    if r["schema_problem"]:
        print("HINWEIS:    Feldnamen unvollständig (%s). Die Werte sind gesichert." % r["schema_problem"])
    print("Datei:      %s" % r["path"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
