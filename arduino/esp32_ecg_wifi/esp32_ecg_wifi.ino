/*
  ESP32 ECG Simulator — WiFi AP + WebSocket + Bluetooth + USB Serial
  Передаёт симулированный ЭКГ-сигнал тремя способами одновременно:
    1. USB Serial    (115200)             — Serial Monitor в приложении
    2. Bluetooth SPP (ESP32_ECG_Sim)      — BT режим в приложении
    3. WiFi AP + WebSocket порт 81        — WiFi режим в приложении
       SSID: CardioScan_ECG  Pass: cardio123
       ESP32 IP: 192.168.4.1
*/

#include <BluetoothSerial.h>
#include <WiFi.h>
#include <WebSocketsServer.h>
#include <cmath>

// ── WiFi AP настройки ────────────────────────────────────────────
const char* AP_SSID = "CardioScan_ECG";
const char* AP_PASS = "cardio123";

// ── Параметры генерации ЭКГ ──────────────────────────────────────
const float SAMPLE_RATE = 100.0;
const float HEART_RATE  = 1.1;   // ~66 bpm

BluetoothSerial SerialBT;
WebSocketsServer wsServer(81);

float phase = 0;

float gaussian(float x, float a, float b, float c) {
  return a * exp(-pow(x - b, 2) / (2 * pow(c, 2)));
}

int nextEcgValue() {
  float x = fmod(phase, 1.0);
  float v = 0;
  v += gaussian(x,  0.15, 0.20, 0.02);   // P
  v += gaussian(x,  1.00, 0.40, 0.01);   // R
  v += gaussian(x, -0.20, 0.38, 0.01);   // Q
  v += gaussian(x, -0.20, 0.42, 0.01);   // S
  v += gaussian(x,  0.25, 0.60, 0.04);   // T
  v += (float)(random(-50, 50)) / 2000.0;
  phase += HEART_RATE / SAMPLE_RATE;
  return (int)((v + 0.5) * 2000);
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_CONNECTED) {
    Serial.printf("[WS] Client #%u connected\n", num);
  } else if (type == WStype_DISCONNECTED) {
    Serial.printf("[WS] Client #%u disconnected\n", num);
  }
}

void setup() {
  Serial.begin(115200);

  // Bluetooth
  SerialBT.begin("ESP32_ECG_Sim");
  Serial.println("[BT] Started: ESP32_ECG_Sim");

  // WiFi AP
  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.printf("[WiFi] AP started: %s | IP: %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());

  // WebSocket
  wsServer.begin();
  wsServer.onEvent(webSocketEvent);
  Serial.println("[WS] WebSocket server started on port 81");
}

void loop() {
  wsServer.loop();

  int val = nextEcgValue();
  String line = String(val);

  // 1. USB Serial
  Serial.println(line);

  // 2. Bluetooth
  if (SerialBT.hasClient()) {
    SerialBT.println(line);
  }

  // 3. WiFi WebSocket — broadcast всем подключённым клиентам
  wsServer.broadcastTXT(line);

  delay(10);  // 100 Hz
}
