// Samaya-Client (Zeitdienst fuer Reticulum), Announce-Modus: holt die Unix-Zeit (UTC) vom Samaya-Server
// und setzt die Node-Uhr nach vorn, damit Announces des Nodes nach Flashen oder Verlust von time_offset
// nicht bis zum Ablauf des Pfads (7 Tage) von Transportknoten verworfen werden.
//
// Ablauf: Pfadanfrage fuer die Destination samaya.time senden. Die Antwort ist ein Announce mit
// Kontext PATH_RESPONSE; dafuer ruft Transport keine Announce-Handler auf, Identity::validate_announce()
// legt die App-Daten aber im Identity-Cache ab (Identity::recall_app_data). Der Client liest sie dort aus.
// Die Zeit wird nur vorwaerts uebernommen, danach sofort gespeichert und genau einmal neu announced.
//
// Der Server-Schluessel (64 Byte oeffentlicher Schluessel) steht im Provisioning-Feld "Time Server Key"
// (Namespace PROV_NS_GENERAL, Feld PROV_GENERAL_TIME_SERVER_KEY). Leer = Client aus.
#ifndef SAMAYA_H
#define SAMAYA_H

#if defined(HAS_RNS) && defined(ARDUINO)

#include <microReticulum.h>
#include "SamayaParse.h"

extern RNS::Bytes samaya_time_key;
extern bool nomadnet_enabled;
extern RNS::Destination nomadnet_destination;
extern char nomadnet_name[64];

// Die Bibliothek haelt writeTimeOffset() protected. Zugriff ueber eine Ableitung, die nie angelegt wird,
// damit die Bibliothek unveraendert bleibt.
struct SamayaReticulumAccess : public RNS::Reticulum {
  static bool save_time() { return writeTimeOffset(); }
};

namespace samaya {
  static const uint32_t FIRST_DELAY_MS  = 30UL * 1000UL;   // dem Start Zeit lassen (Interface, Pfade)
  static const uint32_t BACKOFF_MIN_S   = 30;
  static const uint32_t BACKOFF_MAX_S   = 900;             // auf LoRa sparsam: hoechstens alle 15 Minuten

  static bool     done = false;        // einmal pro Boot synchronisiert
  static bool     armed = false;
  static bool     prepared = false;
  static uint32_t next_ms = 0;
  static uint32_t backoff_s = BACKOFF_MIN_S;
  static RNS::Bytes used_key;          // Schluessel, fuer den dest_hash und baseline gelten
  static RNS::Bytes dest_hash;
  static RNS::Bytes baseline;          // App-Daten vor der ersten Anfrage: nur Neueres zaehlt (kein alter Cache)

  static void announce_once() {
#ifdef URTN_STATS_PAGES
    if (nomadnet_enabled && nomadnet_destination) {
      nomadnet_destination.announce(nomadnet_name);
      if (RNS::Reticulum::remote_management_enabled()) {
        RNS::Destination mgmt = RNS::Transport::remote_management_destination();
        if (mgmt) mgmt.announce();
      }
    }
#endif
  }

  static bool same_key(const RNS::Bytes& a, const RNS::Bytes& b) {
    return a.size() == b.size() && a.size() > 0 && memcmp(a.data(), b.data(), a.size()) == 0;
  }

  // Zeit nur vorwaerts. true, wenn die Uhr verstellt wurde.
  static bool apply(uint64_t server_ms) {
    uint64_t now_ms = RNS::Utilities::OS::ltime();
    if (server_ms <= now_ms) return false;
    RNS::Utilities::OS::setTimeOffset(RNS::Utilities::OS::getTimeOffset() + (server_ms - now_ms));
    SamayaReticulumAccess::save_time();
    return true;
  }
}

// Aus loop() aufrufen, nach reticulum.loop(). Ohne Schluessel oder nach erfolgreichem Sync sofort zurueck.
static inline void samaya_loop() {
  using namespace samaya;
  if (done || samaya_time_key.size() != 64) return;
  uint32_t now = millis();
  if (!armed) { armed = true; next_ms = now + FIRST_DELAY_MS; return; }
  if ((int32_t)(now - next_ms) < 0) return;

  try {
    if (!prepared || !same_key(used_key, samaya_time_key)) {
      RNS::Identity server(false);
      server.load_public_key(samaya_time_key);
      dest_hash = RNS::Destination::hash(server, "samaya", "time");
      baseline = RNS::Identity::recall_app_data(dest_hash);
      used_key = samaya_time_key;
      prepared = true;
      backoff_s = BACKOFF_MIN_S;
    }

    RNS::Bytes cur = RNS::Identity::recall_app_data(dest_hash);
    if (cur.size() > 0 && !(cur.size() == baseline.size() && memcmp(cur.data(), baseline.data(), cur.size()) == 0)) {
      baseline = cur;                                   // neue App-Daten gesehen, egal ob brauchbar
      uint64_t server_ms = 0;
      if (samaya_decode(cur.data(), cur.size(), server_ms)) {
        done = true;
        if (apply(server_ms)) {
          NOTICEF("Samaya: clock set forward to %llu ms (Unix, UTC)", (unsigned long long)server_ms);
          announce_once();
        }
        else {
          NOTICE("Samaya: server time seen, node clock already ahead");
        }
        return;
      }
    }
    RNS::Transport::request_path(dest_hash);
  }
  catch (const std::bad_alloc&) {
    ERROR("Samaya: out of memory");
  }
  catch (const std::exception& e) {
    ERRORF("Samaya: %s", e.what());
  }
  next_ms = millis() + backoff_s * 1000UL;
  if (backoff_s < BACKOFF_MAX_S) backoff_s = (backoff_s * 2 > BACKOFF_MAX_S) ? BACKOFF_MAX_S : backoff_s * 2;
}

#else
static inline void samaya_loop() {}
#endif // HAS_RNS && ARDUINO

#endif // SAMAYA_H
