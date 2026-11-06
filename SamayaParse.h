// Samaya (Zeitdienst fuer Reticulum): Auswertung der MsgPack-Map des Servers.
// Reine Funktion ohne RNS-Abhaengigkeit, damit sie auf dem Rechner getestet werden kann
// (tests/samaya_parse_test.cpp). Protokoll: PROTOKOLL.md im Samaya-Repo.
//
// Map mit Ganzzahl-Schluesseln:  1 = Unix-Zeit (s, UTC), 2 = Millisekunden 0..999 (optional),
//                                3 = Protokollversion (1), 4 = 1 Server-Uhr synchronisiert / 0 nicht.
#ifndef SAMAYA_PARSE_H
#define SAMAYA_PARSE_H

#include <stdint.h>
#include <stddef.h>
#include <stdio.h>

#define SAMAYA_PROTOCOL_VERSION 1
#define SAMAYA_MIN_VALID 1767225600ULL   // 2026-01-01 00:00:00 UTC
#define SAMAYA_MAX_VALID 4102444800ULL   // 2100-01-01 00:00:00 UTC

// Liest eine MsgPack-Ganzzahl (positive fixint, uint8/16/32/64) oder Bool. Gibt false bei allem anderen.
static inline bool samaya_read_uint(const uint8_t* p, size_t n, size_t& i, uint64_t& v) {
  if (i >= n) return false;
  uint8_t t = p[i++];
  size_t len = 0;
  if (t <= 0x7f) { v = t; return true; }
  if (t == 0xc2) { v = 0; return true; }
  if (t == 0xc3) { v = 1; return true; }
  if (t == 0xcc) len = 1; else if (t == 0xcd) len = 2; else if (t == 0xce) len = 4; else if (t == 0xcf) len = 8; else return false;
  if (i + len > n) return false;
  v = 0;
  for (size_t k = 0; k < len; k++) v = (v << 8) | p[i++];
  return true;
}

// Wertet die Antwort aus. true nur, wenn Version 1, Server synchronisiert und die Zeit im Bereich
// MIN_VALID..MAX_VALID liegt. Bei Erfolg steht die Zeit in Millisekunden in server_ms.
static inline bool samaya_decode(const uint8_t* p, size_t n, uint64_t& server_ms) {
  if (p == nullptr || n < 1) return false;
  size_t i = 0;
  size_t count;
  uint8_t h = p[i++];
  if ((h & 0xf0) == 0x80) count = h & 0x0f;
  else if (h == 0xde && n >= 3) { count = ((size_t)p[1] << 8) | p[2]; i = 3; }
  else return false;
  if (count > 16) return false;

  uint64_t secs = 0, ms = 0, version = 0, synced = 0;
  bool have_secs = false, have_ver = false, have_sync = false;
  for (size_t e = 0; e < count; e++) {
    uint64_t key, val;
    if (!samaya_read_uint(p, n, i, key)) return false;
    if (!samaya_read_uint(p, n, i, val)) return false;   // unbekannte Wertetypen: Antwort verwerfen
    switch (key) {
      case 1: secs = val; have_secs = true; break;
      case 2: ms = val; break;
      case 3: version = val; have_ver = true; break;
      case 4: synced = val; have_sync = true; break;
      default: break;                                    // unbekannte Schluessel ignorieren
    }
  }
  if (!have_ver || version != SAMAYA_PROTOCOL_VERSION) return false;
  if (!have_sync || synced != 1) return false;
  if (!have_secs || secs < SAMAYA_MIN_VALID || secs >= SAMAYA_MAX_VALID) return false;
  if (ms > 999) return false;
  server_ms = secs * 1000ULL + ms;
  return true;
}

// Unix-Sekunden als "JJJJ-MM-TT hh:mm:ss" (UTC) in buf. Ohne gmtime(), damit es auf dem Rechner testbar ist.
// Gueltig fuer Zeiten ab 1970.
static inline void samaya_format_utc(uint64_t unix_s, char* buf, size_t n) {
  uint64_t days = unix_s / 86400ULL;
  uint32_t rem = (uint32_t)(unix_s % 86400ULL);
  // Tage seit 1970-01-01 in Datum (Algorithmus nach Howard Hinnant, civil_from_days)
  int64_t z = (int64_t)days + 719468;
  int64_t era = z / 146097;
  int64_t doe = z - era * 146097;
  int64_t yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  int64_t y = yoe + era * 400;
  int64_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  int64_t mp = (5 * doy + 2) / 153;
  int64_t d = doy - (153 * mp + 2) / 5 + 1;
  int64_t m = mp < 10 ? mp + 3 : mp - 9;
  if (m <= 2) y += 1;
  snprintf(buf, n, "%04d-%02d-%02d %02u:%02u:%02u", (int)y, (int)m, (int)d,
           (unsigned)(rem / 3600U), (unsigned)((rem / 60U) % 60U), (unsigned)(rem % 60U));
}

// Zeitsprung kurz lesbar: "+37s", "+5m", "+3h", "+120d". Nach dem Flashen ohne Uhr ist der Sprung
// Jahrzehnte gross, deshalb wird gerundet auf die groesste passende Einheit.
static inline void samaya_format_delta(uint64_t delta_s, char* buf, size_t n) {
  if (delta_s < 120ULL)         snprintf(buf, n, "+%lus", (unsigned long)delta_s);
  else if (delta_s < 7200ULL)   snprintf(buf, n, "+%lum", (unsigned long)(delta_s / 60ULL));
  else if (delta_s < 172800ULL) snprintf(buf, n, "+%luh", (unsigned long)(delta_s / 3600ULL));
  else                          snprintf(buf, n, "+%lud", (unsigned long)(delta_s / 86400ULL));
}

#endif // SAMAYA_PARSE_H
