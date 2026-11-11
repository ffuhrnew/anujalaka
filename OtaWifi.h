// Update window over WiFi (ESP32). Opened by the admin command "Open Update Window":
// the node reboots into window mode, starts its own access point "<name> UPDATE"
// (WPA2) and serves an upload page at http://10.0.0.1/ . After a successful upload
// the new image is accepted once (hash) and the node restarts. The window closes
// by itself after OTA_WINDOW_MS.
#ifndef OTA_WIFI_H
#define OTA_WIFI_H

#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>

// There is no default password. It comes from one of two places:
//  - build time: -DOTA_WIFI_PASSWORD=\"...\" (min. 8 characters), or
//  - flash time: the web flasher writes the password the user typed into the slot below
//    (marker + state byte + 64 bytes) and fixes the image checksum and hash. A firmware
//    that still has the slot unfilled cannot open the update window.
#ifdef OTA_WIFI_PASSWORD
  static_assert(sizeof(OTA_WIFI_PASSWORD) >= 9, "OTA_WIFI_PASSWORD needs at least 8 characters (WPA2)");
  static const char* ota_wifi_password() { return OTA_WIFI_PASSWORD; }
#else
  #define OTA_PW_MARKER "@@OTA-PW-v1@@"   // site/espimage.js looks for exactly this text
  // state byte: '-' = not set, 'P' = password follows (NUL terminated)
  static const char ota_pw_slot[sizeof(OTA_PW_MARKER) - 1 + 1 + 64] __attribute__((used)) = OTA_PW_MARKER "-";
  static const char* ota_wifi_password_slot() {
    const char* p = ota_pw_slot + (sizeof(OTA_PW_MARKER) - 1);
    __asm__ volatile("" : "+r"(p));   // keep the compiler from folding the slot, it is patched in the binary
    return p;
  }
  static const char* ota_wifi_password() { return ota_wifi_password_slot()[0] == 'P' ? ota_wifi_password_slot() + 1 : ""; }
#endif
static bool ota_wifi_password_ok() {
  size_t n = strlen(ota_wifi_password());
  return n >= 8 && n <= 63;   // WPA2
}

extern char bt_devname[];
extern void ota_wifi_done(bool ok);

static WebServer ota_server(80);
static bool ota_upload_ok = false;
static size_t ota_upload_bytes = 0;

static const char OTA_PAGE[] PROGMEM =
  "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
  "<title>Update</title></head><body style='font-family:sans-serif;max-width:30em;margin:2em auto'>"
  "<h2>Firmware-Update</h2><p>Datei <b>firmware.bin</b> w&auml;hlen und hochladen. "
  "Der Node startet danach selbst neu.</p>"
  "<form method=POST action=/update enctype=multipart/form-data>"
  "<input type=file name=firmware accept='.bin' required> "
  "<input type=submit value='Hochladen'></form></body></html>";

static void ota_wifi_start() {
  if (!ota_wifi_password_ok()) { ota_wifi_done(false); return; }   // no password: no window, back to normal operation
  WiFi.mode(WIFI_AP);
  char ssid[40];
  snprintf(ssid, sizeof(ssid), "%s UPDATE", bt_devname);
  WiFi.softAP(ssid, ota_wifi_password());
  delay(150);
  IPAddress ip(10, 0, 0, 1), nm(255, 255, 255, 0);
  WiFi.softAPConfig(ip, ip, nm);

  ota_server.on("/", HTTP_GET, []() { ota_server.send_P(200, "text/html", OTA_PAGE); });
  ota_server.on("/update", HTTP_POST,
    []() {   // after the upload finished
      ota_server.sendHeader("Connection", "close");
      if (ota_upload_ok) {
        ota_server.send(200, "text/plain", "OK - Node startet neu");
        delay(500);
        ota_wifi_done(true);
      } else {
        ota_server.send(500, "text/plain", "FEHLER - Update nicht uebernommen");
      }
    },
    []() {   // upload chunks
      HTTPUpload& up = ota_server.upload();
      if (up.status == UPLOAD_FILE_START) {
        ota_upload_ok = false; ota_upload_bytes = 0;
        if (!Update.begin(UPDATE_SIZE_UNKNOWN)) Update.printError(Serial);
      } else if (up.status == UPLOAD_FILE_WRITE) {
        if (Update.write(up.buf, up.currentSize) != up.currentSize) Update.printError(Serial);
        ota_upload_bytes += up.currentSize;
      } else if (up.status == UPLOAD_FILE_END) {
        // end(true): finalize even though the size was unknown; fails on a bad image
        ota_upload_ok = Update.end(true) && ota_upload_bytes > 100000;
        if (!ota_upload_ok) Update.printError(Serial);
      } else if (up.status == UPLOAD_FILE_ABORTED) {
        Update.abort();
      }
    });
  ota_server.begin();
}

static void ota_wifi_service() { ota_server.handleClient(); }

#endif
