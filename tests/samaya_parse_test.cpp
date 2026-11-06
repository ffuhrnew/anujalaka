// Rechnertest fuer SamayaParse.h:  g++ -std=c++11 -Wall -I. tests/samaya_parse_test.cpp -o /tmp/samaya_parse_test && /tmp/samaya_parse_test
#include <cstdio>
#include <cstring>
#include <vector>
#include "SamayaParse.h"

static int fails = 0;
static void check(const char* name, std::vector<uint8_t> d, bool want, uint64_t want_ms = 0) {
  uint64_t ms = 0;
  bool ok = samaya_decode(d.data(), d.size(), ms);
  bool good = (ok == want) && (!want || ms == want_ms);
  printf("%s %s\n", good ? "ok  " : "FAIL", name);
  if (!good) fails++;
}

int main() {
  // 1793861061 = 0x6AEC25C5 (uint32), ms 123, Version 1, synchronisiert 1  (so packt umsgpack)
  check("normal mit ms", {0x84, 0x01, 0xce, 0x6a, 0xec, 0x25, 0xc5, 0x02, 0x7b, 0x03, 0x01, 0x04, 0x01}, true, 1793861061123ULL);
  check("ms als uint16", {0x84, 0x01, 0xce, 0x6a, 0xec, 0x25, 0xc5, 0x02, 0xcd, 0x03, 0x0b, 0x03, 0x01, 0x04, 0x01}, true, 1793861061779ULL);
  check("ohne ms", {0x83, 0x01, 0xce, 0x6a, 0xec, 0x25, 0xc5, 0x03, 0x01, 0x04, 0x01}, true, 1793861061000ULL);
  check("bool fuer Schluessel 4", {0x83, 0x01, 0xce, 0x6a, 0xec, 0x25, 0xc5, 0x03, 0x01, 0x04, 0xc3}, true, 1793861061000ULL);
  check("unbekannter Schluessel 9 wird ignoriert", {0x84, 0x01, 0xce, 0x6a, 0xec, 0x25, 0xc5, 0x03, 0x01, 0x04, 0x01,  0x09, 0x05}, true, 1793861061000ULL);
  check("Server nicht synchronisiert", {0x82, 0x03, 0x01, 0x04, 0x00}, false);
  check("synchronisiert aber ohne Zeit", {0x82, 0x03, 0x01, 0x04, 0x01}, false);
  check("falsche Version", {0x83, 0x01, 0xce, 0x6a, 0xec, 0x25, 0xc5, 0x03, 0x02, 0x04, 0x01}, false);
  check("Zeit vor 2026", {0x83, 0x01, 0xce, 0x65, 0x00, 0x00, 0x00, 0x03, 0x01, 0x04, 0x01}, false);
  check("Zeit ab 2100", {0x83, 0x01, 0xcf, 0x00, 0x00, 0x00, 0x01, 0xf4, 0x00, 0x00, 0x00, 0x03, 0x01, 0x04, 0x01}, false);
  check("ms ueber 999", {0x84, 0x01, 0xce, 0x6a, 0xec, 0x25, 0xc5, 0x02, 0xcd, 0x03, 0xe8, 0x03, 0x01, 0x04, 0x01}, false);
  check("abgeschnitten", {0x84, 0x01, 0xce, 0x6a, 0xec}, false);
  check("kein Map-Kopf", {0x91, 0x01}, false);
  check("leer", {}, false);
  check("String als Wert", {0x82, 0x01, 0xa2, 'a', 'b', 0x03, 0x01}, false);
  // Formatierung (Health-Seite): Werte gegen `date -u -d @<s>` geprueft
  auto utc = [](const char* name, uint64_t s, const char* want) {
    char b[32]; samaya_format_utc(s, b, sizeof(b));
    bool good = strcmp(b, want) == 0;
    printf("%s %s -> %s\n", good ? "ok  " : "FAIL", name, b);
    if (!good) fails++;
  };
  utc("Unix 0", 0, "1970-01-01 00:00:00");
  utc("Schaltjahr 29.02.2028", 1835395200ULL + 3661, "2028-02-29 01:01:01");
  utc("Jahreswechsel", 1767225599ULL, "2025-12-31 23:59:59");
  utc("MIN_VALID", SAMAYA_MIN_VALID, "2026-01-01 00:00:00");
  utc("Beispielzeit", 1793861061ULL, "2026-11-05 06:44:21");
  utc("MAX_VALID", SAMAYA_MAX_VALID - 1, "2099-12-31 23:59:59");
  auto dl = [](const char* name, uint64_t s, const char* want) {
    char b[16]; samaya_format_delta(s, b, sizeof(b));
    bool good = strcmp(b, want) == 0;
    printf("%s %s -> %s\n", good ? "ok  " : "FAIL", name, b);
    if (!good) fails++;
  };
  dl("Delta 0 s", 0, "+0s");
  dl("Delta 119 s", 119, "+119s");
  dl("Delta 120 s", 120, "+2m");
  dl("Delta 7199 s", 7199, "+119m");
  dl("Delta 2 h", 7200, "+2h");
  dl("Delta 2 d", 172800, "+2d");
  dl("Delta nach Flashen", 1793861061ULL, "+20762d");
  printf(fails ? "%d FEHLER\n" : "alle Tests bestanden\n", fails);
  return fails ? 1 : 0;
}
