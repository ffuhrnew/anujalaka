// Samaya-Client (Zeitdienst fuer Reticulum), Announce-Modus: holt die Unix-Zeit (UTC) vom Samaya-Server
// und setzt die Node-Uhr nach vorn, damit Announces des Nodes nach Flashen oder Verlust von time_offset
// nicht bis zum Ablauf des Pfads (7 Tage) von Transportknoten verworfen werden.
//
// Ablauf: Pfadanfrage fuer die Destination samaya.time senden. Die Antwort ist ein Announce mit
// Kontext PATH_RESPONSE; dafuer ruft Transport keine Announce-Handler auf und der Identity-Cache
// wird nur beim ersten Mal beschrieben. Der Client liest das rohe Paket im Receive-Callback
// (samaya_on_packet), prueft die Signatur gegen den konfigurierten Schluessel und dekodiert die App-Daten.
// Die Zeit wird nur vorwaerts uebernommen, danach sofort gespeichert und genau einmal neu announced.
//
// Der Server-Schluessel (64 Byte oeffentlicher Schluessel) steht im Provisioning-Feld "Time Server Key"
// (Namespace PROV_NS_GENERAL, Feld PROV_GENERAL_TIME_SERVER_KEY). Leer = Client aus.
#ifndef SAMAYA_H
#define SAMAYA_H

#include <stdio.h>
#include <stddef.h>
#include <stdint.h>

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

  // Ergebnis fuer die Health-Seite. Nur Anzeige, steuert den Ablauf nicht.
  enum State : uint8_t { ST_OFF = 0, ST_WAITING, ST_AHEAD, ST_SET, ST_INVALID };
  static uint8_t  sync_state = ST_OFF;      // OFF = kein Schluessel gesetzt
  static uint64_t last_delta_s = 0;    // Groesse des letzten Zeitsprungs (nur bei ST_SET)
  static volatile bool sync_request = false;   // von der Steuerungsseite gesetzt, in samaya_loop() bearbeitet
  static uint32_t requests_sent = 0;   // gesendete Pfadanfragen seit Start bzw. letztem manuellen Abgleich (nur Anzeige)

  static bool     done = false;        // einmal pro Boot synchronisiert
  static bool     armed = false;
  static bool     prepared = false;
  static uint32_t next_ms = 0;
  static uint32_t backoff_s = BACKOFF_MIN_S;
  static RNS::Bytes used_key;          // Schluessel, fuer den dest_hash und baseline gelten
  static RNS::Bytes dest_hash;
  static RNS::Identity server_id(false);
  // Ergebnis aus dem Receive-Callback, wird in samaya_loop() verarbeitet
  static volatile bool pending = false;
  static volatile bool pending_invalid = false;
  static volatile uint64_t pending_ms = 0;

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

  // Zeit nur vorwaerts. true, wenn die Uhr verstellt wurde; delta_ms ist dann die Groesse des Sprungs.
  static bool apply(uint64_t server_ms, uint64_t& delta_ms) {
    uint64_t now_ms = RNS::Utilities::OS::ltime();
    if (server_ms <= now_ms) return false;
    delta_ms = server_ms - now_ms;
    RNS::Utilities::OS::setTimeOffset(RNS::Utilities::OS::getTimeOffset() + delta_ms);
    SamayaReticulumAccess::save_time();
    return true;
  }
}

// Fuer die Seiten (Pages.h). Beide Zeilen enden mit Zeilenumbruch.
static inline void samaya_time_line(char* buf, size_t n) {
  uint64_t s = RNS::Utilities::OS::ltime() / 1000ULL;
  if (s < SAMAYA_MIN_VALID) { snprintf(buf, n, "Zeit: nicht gesetzt\n"); return; }   // Uhr zaehlt nur die Laufzeit
  char t[24];
  samaya_format_utc(s, t, sizeof(t));
  snprintf(buf, n, "Zeit: %s UTC\n", t);
}

static inline void samaya_status_line(char* buf, size_t n) {
  using namespace samaya;
  switch (sync_state) {
    case ST_WAITING: {
      // Zeigt, ob der Node ueberhaupt fragt und ob schon irgendwelche App-Daten des Servers im Cache liegen.
      bool data = prepared && RNS::Identity::recall_app_data(dest_hash).size() > 0;
      snprintf(buf, n, "Samaya: wartet (Anfragen %lu, Daten %s)\n", (unsigned long)requests_sent, data ? "ja" : "nein");
      break;
    }
    case ST_AHEAD:   snprintf(buf, n, "Samaya: Zeit gesehen, Uhr schon voraus\n"); break;
    case ST_SET: {
      char d[16];
      samaya_format_delta(last_delta_s, d, sizeof(d));
      snprintf(buf, n, "Samaya: Uhr gesetzt %s\n", d);
      break;
    }
    case ST_INVALID: snprintf(buf, n, "Samaya: ungültige Daten\n"); break;
    default:         snprintf(buf, n, "Samaya: aus (kein Schlüssel)\n"); break;
  }
}

// true, wenn ein Zeitserver-Schluessel gesetzt ist (nur dann ist ein Abgleich moeglich).
static inline bool samaya_enabled() { return samaya_time_key.size() == 64; }

// Manueller Abgleich (Steuerungsseite): nur ein Merker, die Arbeit macht samaya_loop().
static inline void samaya_request_sync() { samaya::sync_request = true; }

// Aus dem Receive-Callback aufrufen (jedes rohe Paket). Nur Announces fuer samaya.time werden angefasst.
static inline void samaya_on_packet(const RNS::Bytes& raw) {
  using namespace samaya;
  if (!prepared || pending || raw.size() < 2 + 16 + 1 + 64 + 10 + 10 + 64) return;
  const uint8_t* p = raw.data();
  uint8_t flags = p[0];
  if ((flags & 0x03) != 0x01) return;                       // nur ANNOUNCE
  size_t dpos = (((flags >> 6) & 1) ? 18 : 2);              // HEADER_2: erst transport_id
  size_t ctx_flag = (flags >> 5) & 1;
  if (raw.size() < dpos + 16 + 1) return;
  if (dest_hash.size() != 16 || memcmp(p + dpos, dest_hash.data(), 16) != 0) return;
  size_t d = dpos + 16 + 1;                                  // hinter dest_hash und Kontextbyte
  size_t fixed = 64 + 10 + 10 + (ctx_flag ? 32 : 0) + 64;
  if (raw.size() < d + fixed) return;
  const uint8_t* pub = p + d;
  if (memcmp(pub, samaya_time_key.data(), 64) != 0) return;
  const uint8_t* rnd = pub + 64 + 10;
  const uint8_t* sig = rnd + 10 + (ctx_flag ? 32 : 0);
  const uint8_t* app = sig + 64;
  size_t app_len = raw.size() - (size_t)(app - p);
  try {
    // signiert: dest_hash + public_key + name_hash + random_hash + [ratchet] + app_data
    RNS::Bytes msg(p + dpos, 16);
    msg.append(pub, (size_t)(sig - pub));
    msg.append(app, app_len);
    RNS::Bytes sigb(sig, 64);
    if (!server_id.validate(sigb, msg)) return;              // Signatur passt nicht: ignorieren
    uint64_t ms = 0;
    if (samaya_decode(app, app_len, ms)) { pending_ms = ms; pending = true; }
    else pending_invalid = true;
  }
  catch (...) {}
}

// Aus loop() aufrufen, nach reticulum.loop(). Ohne Schluessel oder nach erfolgreichem Sync sofort zurueck.
static inline void samaya_loop() {
  using namespace samaya;
  if (samaya_time_key.size() != 64) { sync_state = ST_OFF; sync_request = false; return; }
  if (sync_state == ST_OFF) { sync_state = ST_WAITING; done = false; prepared = false; requests_sent = 0; }   // Schluessel ist (neu) gesetzt
  if (sync_request) {
    // Manueller Abgleich: noch einmal von vorn.
    sync_request = false;
    pending = false;
    done = false;
    armed = true;
    next_ms = millis();
    backoff_s = BACKOFF_MIN_S;
    requests_sent = 0;
    sync_state = ST_WAITING;
  }
  try {
    if (!prepared || !same_key(used_key, samaya_time_key)) {
      pending = false; pending_invalid = false;
      server_id = RNS::Identity(false);
      server_id.load_public_key(samaya_time_key);
      dest_hash = RNS::Destination::hash(server_id, "samaya", "time");
      used_key = samaya_time_key;
      prepared = true;
      backoff_s = BACKOFF_MIN_S;
    }
    if (done) return;
    if (pending) {
      pending = false;
      uint64_t server_ms = pending_ms;
      done = true;
      uint64_t delta_ms = 0;
      if (apply(server_ms, delta_ms)) {
        last_delta_s = delta_ms / 1000ULL;
        sync_state = ST_SET;
        NOTICEF("Samaya: clock set forward to %llu ms (Unix, UTC)", (unsigned long long)server_ms);
        announce_once();
      }
      else {
        sync_state = ST_AHEAD;
        NOTICE("Samaya: server time seen, node clock already ahead");
      }
      return;
    }
    if (pending_invalid) { pending_invalid = false; sync_state = ST_INVALID; }
    uint32_t now = millis();
    if (!armed) { armed = true; next_ms = now + FIRST_DELAY_MS; return; }
    if ((int32_t)(now - next_ms) < 0) return;
    RNS::Transport::request_path(dest_hash);
    requests_sent++;
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
static inline void samaya_on_packet(const RNS::Bytes&) {}
static inline void samaya_time_line(char* buf, size_t n) { snprintf(buf, n, "Zeit: -\n"); }
static inline void samaya_status_line(char* buf, size_t n) { snprintf(buf, n, "Samaya: aus\n"); }
static inline bool samaya_enabled() { return false; }
static inline void samaya_request_sync() {}
#endif // HAS_RNS && ARDUINO

#endif // SAMAYA_H
