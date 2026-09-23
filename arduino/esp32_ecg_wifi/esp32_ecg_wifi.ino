/*
  ESP32 ECG — WiFi AP + WebSocket + USB Serial
  SSID: ESP32-ECG-WIFI  Password: 12345678
  WebSocket: ws://192.168.4.1:81
*/

#include <WiFi.h>
#include <WebSocketsServer.h>

const char* AP_SSID     = "ESP32-ECG-WIFI";
const char* AP_PASSWORD = "12345678";

WebSocketsServer wsServer(81);

const int SAMPLE_RATE_HZ = 250;
float phase = 0;
unsigned long lastMicros = 0;
const unsigned long intervalMicros = 1000000 / SAMPLE_RATE_HZ;

void setup() {
  Serial.begin(115200);
  delay(1000);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);

  Serial.println("--- Система запущена ---");
  Serial.print("Сеть: ");     Serial.println(AP_SSID);
  Serial.print("IP адрес: "); Serial.println(WiFi.softAPIP());

  wsServer.begin();
  Serial.println("WebSocket сервер запущен на порту 81");
}

void loop() {
  wsServer.loop();

  if (micros() - lastMicros >= intervalMicros) {
    lastMicros = micros();

    float val = sin(phase) * 0.15;
    if (phase > 1.5 && phase < 1.62)  val = 1.3 + (float)(random(-5, 5)) / 100.0;
    if (phase > 2.0 && phase < 2.5)   val = 0.25;
    val += (float)(random(-15, 15)) / 400.0;

    int16_t ecg_raw = (int16_t)(val * 1000);

    Serial.println(ecg_raw);
    wsServer.broadcastTXT(String(ecg_raw));

    phase += 0.03;
    if (phase > 2.0 * PI) phase -= 2.0 * PI;
  }
}
