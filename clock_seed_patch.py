"""PlatformIO-Vorskript (pre:): Uhr der Micro-Nodes in der Bibliothek microReticulum patchen.

Zweck: Geraete ohne Echtzeituhr starten nie unter der Zeit des Builds (Unix-Zeit, UTC), und die Obergrenze
des gespeicherten Zeit-Offsets (Millisekunden) wird von 49,7 Tagen auf das Jahr 2100 angehoben.
Ohne das beginnt die Uhr nach einem Chip-Erase bei ~0, und Empfaenger (z. B. ein Transport-Node) verwerfen
alle Announces, bis der alte Pfad ablaeuft (Reticulum-Replay-Schutz).

Die Bibliothek (.pio/libdeps/<env>/microReticulum) bleibt unveraendert im Fork; der Patch wird bei jedem
Build frisch angewendet (Sicherung Reticulum.cpp.orig, Seed = Zeit dieses Builds).
Bricht der Build ab, wenn die erwarteten Stellen fehlen, damit nie still eine ungepatchte Firmware entsteht.
"""
import os, shutil, time

SEED = '''        {
                // Devices without a real-time clock: never let the clock start below the build time (Unix time, UTC).
                // After a chip erase (or on first boot) the persisted offset is gone and the clock would
                // restart near 0, so receivers that still hold a newer timestamp for this destination
                // silently drop every announce until their path expires.
                const uint64_t seed_ms = @SEED@ULL * 1000ULL;
                if (OS::getTimeOffset() < seed_ms) {
                        OS::setTimeOffset(seed_ms);
                }
        }
'''
CAP_OLD = "if (offset > 4294967295) {"
CAP_NEW = "if (offset > 4102444800000ULL) {"  # 2100-01-01 in ms
ANCHOR = "// Guarantee monotonically increasing clock on reboot"


def patch_file(p):
    """Gibt den Seed zurueck, oder wirft RuntimeError."""
    if os.path.exists(p + ".orig"):
        shutil.copyfile(p + ".orig", p)  # frisch aus der Sicherung patchen
    s = open(p).read()
    if s.count(CAP_OLD) != 1 or s.count(ANCHOR) != 1:
        raise RuntimeError("%s: erwartete Stellen nicht gefunden (Cap %d, Anker %d) - Bibliothek geaendert?"
                           % (p, s.count(CAP_OLD), s.count(ANCHOR)))
    shutil.copyfile(p, p + ".orig")
    seed = int(time.time())
    s = s.replace(CAP_OLD, CAP_NEW)
    i = s.index(ANCHOR)
    ls = s.rfind("\n", 0, i) + 1
    s = s[:ls] + SEED.replace("@SEED@", str(seed)) + s[ls:]
    open(p, "w").write(s)
    return seed


try:
    Import("env")  # nur innerhalb von PlatformIO vorhanden
except NameError:
    env = None

if env is not None:
    lib = os.path.join(env.subst("$PROJECT_LIBDEPS_DIR"), env.subst("$PIOENV"), "microReticulum",
                       "src", "microReticulum", "Reticulum.cpp")
    if not os.path.exists(lib):
        print("clock_seed_patch: %s fehlt" % lib)
        env.Exit(1)
    try:
        seed = patch_file(lib)
        print("clock_seed_patch: Seed %d (%s)" % (seed, time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(seed))))
    except RuntimeError as e:
        print("clock_seed_patch: " + str(e))
        env.Exit(1)
