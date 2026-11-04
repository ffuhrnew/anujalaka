// Bootloader / SoftDevice info for nRF52 boards (read from flash, no extra hardware needed)
#ifndef BOOT_INFO_H
#define BOOT_INFO_H
#if defined(NRF52840_XXAA)
#include <stdint.h>
#include <stdio.h>
#include <string.h>

// SoftDevice information structure (Nordic nrf_sdm.h): magic 0x51B1E5DB at +0x04,
// size byte at +0x00, FWID (u16) at +0x0C, version (u32, major*1000000+minor*1000+bugfix) at +0x14.
// Its base is 0x3000 on S132 v4+/S140; 0x1000 is tried as a fallback.
static inline bool bootinfo_sd(uint32_t* version, uint16_t* fwid) {
  static const uint32_t bases[2] = { 0x3000, 0x1000 };
  for (int i = 0; i < 2; i++) {
    uint32_t b = bases[i];
    if (*(volatile const uint32_t*)(b + 0x04) == 0x51B1E5DBUL) {
      uint8_t size = *(volatile const uint8_t*)(b + 0x00);
      *fwid = *(volatile const uint16_t*)(b + 0x0C);
      *version = (size > 0x14) ? *(volatile const uint32_t*)(b + 0x14) : 0;
      return true;
    }
  }
  return false;
}

// e.g. "UF2 Bootloader 0.9.2-OTA, S140 7.3.0 (0x123)"; "n/a" / "SD ?" if not found
static inline const char* bootloader_info() {
  static char out[64];
  char bl[32] = "n/a";
  const char* p = (const char*)0xF4000;
  const char* e = (const char*)0xFE000 - 16;
  for (; p < e; p++) {
    if (p[0] == 'U' && memcmp(p, "UF2 Bootloader ", 15) == 0) {
      size_t n = 0;
      while (n < 28 && p[n] >= 32 && p[n] < 127) { bl[n] = p[n]; n++; }
      bl[n] = 0;
      break;
    }
  }
  uint32_t ver = 0; uint16_t fwid = 0;
  if (bootinfo_sd(&ver, &fwid) && ver) {
    snprintf(out, sizeof(out), "%s, S140 %u.%u.%u (0x%X)", bl,
             (unsigned)(ver / 1000000UL), (unsigned)((ver / 1000UL) % 1000UL), (unsigned)(ver % 1000UL), (unsigned)fwid);
  } else if (bootinfo_sd(&ver, &fwid)) {
    snprintf(out, sizeof(out), "%s, SD 0x%X", bl, (unsigned)fwid);
  } else {
    snprintf(out, sizeof(out), "%s, SD ?", bl);
  }
  return out;
}
#endif
#endif
