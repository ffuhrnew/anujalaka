#!/usr/bin/env python3
"""node_reset.py - Provisioning eines Nodes per USB auf Werkseinstellungen setzen (Operation FactoryReset).

Aufruf:  node_reset.py PORT

Löscht die gespeicherte Konfiguration des Nodes (Name, Funk, Transport-Identity, Allow-Liste usw.).
Der Node vergibt beim nächsten Start eine neue Identity. Die Sicherung vorher macht node_backup.py.
Nutzt denselben Verwaltungskanal wie mikara und die Webconsole ("Werksreset"), nur seriell.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import node_backup as nb  # noqa: E402

OP_FACTORY_RESET = 8


def main(argv):
    if len(argv) != 2:
        sys.exit("Aufruf: node_reset.py PORT")
    try:
        link = nb.NodeLink(argv[1])
    except nb.BackupError as exc:
        print("FEHLER: %s" % exc, file=sys.stderr)
        return 1
    try:
        body = link.request(OP_FACTORY_RESET)
    except nb.BackupError as exc:
        print("FEHLER: %s" % exc, file=sys.stderr)
        return 1
    finally:
        link.close()
    needs_reboot = bool(body.get(2)) if isinstance(body, dict) else False
    print("Werkseinstellungen des Nodes gesetzt%s." % (" (Neustart nötig)" if needs_reboot else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
