// Build-Stand der Firmware (Git-Commit), gesetzt von extra_script.py per -DFW_BUILD_ID
#ifndef BUILD_INFO_H
#define BUILD_INFO_H

#ifndef FW_BUILD_ID
  #define FW_BUILD_ID "unknown"
#endif

static inline const char* fw_build_id() { return FW_BUILD_ID; }

#endif
