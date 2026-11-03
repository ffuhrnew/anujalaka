// Bootloader / SoftDevice info for nRF52 boards (read from flash, no extra hardware needed)
#ifndef BOOT_INFO_H
#define BOOT_INFO_H
#if defined(NRF52840_XXAA)
#include <stdint.h>
#include <stdio.h>
#include <string.h>

// e.g. "UF2 Bootloader 0.6.1, SD 0xB6"; "n/a" if the bootloader string is not found
static inline const char* bootloader_info() {
  static char out[48];
  char bl[28] = "n/a";
  const char* p = (const char*)0xF4000;
  const char* e = (const char*)0xFE000 - 16;
  for (; p < e; p++) {
    if (p[0] == 'U' && memcmp(p, "UF2 Bootloader ", 15) == 0) {
      size_t n = 0;
      while (n < 24 && p[n] >= 32 && p[n] < 127) { bl[n] = p[n]; n++; }
      bl[n] = 0;
      break;
    }
  }
  snprintf(out, sizeof(out), "%s, SD 0x%X", bl, (unsigned)(*(volatile const uint16_t*)0x100C));
  return out;
}
#endif
#endif
