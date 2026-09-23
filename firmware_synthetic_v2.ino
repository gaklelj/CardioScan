/*
  ESP32 ECG — Ultra-Realistic Synthetic Normal ECG
  ─────────────────────────────────────────────────────────────────────────────
  SSID: ESP32-ECG-WIFI  |  Password: 12345678
  WebSocket: ws://192.168.4.1:81
  250 Hz, ~68-74 BPM с реалистичной вариабельностью

  Улучшения по сравнению с оригиналом:
    • HRV (вариабельность сердечного ритма): дыхательная синусовая аритмия
      + случайный beat-to-beat jitter → как у живого человека
    • Baseline wander: дрейф из-за дыхания (~0.25 Hz) + медленный дрейф
    • Реалистичный шум: белый (электродный) + мышечный EMG (высокочастотный)
      + редкие артефакты движения
    • U-волна после T-волны (видна у ~50% людей)
    • Асимметричная T-волна (правое колено круче левого — как в норме)
    • Вариация амплитуды между ударами ±5%
    • Правильные изоэлектрические сегменты PR и ST
*/

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <math.h>

const char* AP_SSID     = "ESP32-ECG-WIFI";
const char* AP_PASSWORD = "12345678";

WebSocketsServer wsServer(81);

const int   SAMPLE_RATE     = 250;
const unsigned long intervalMicros = 1000000UL / SAMPLE_RATE;
unsigned long lastMicros    = 0;

float globalTime    = 0.0f;
float beatStart     = 0.0f;
float beatPeriod    = 214.0f;

const float RESP_PERIOD  = 1000.0f;
const float RESP_HRV_AMP = 12.0f;
const float BASE_PERIOD  = 214.0f;

const float BW_FREQ_1    = 0.25f / SAMPLE_RATE;
const float BW_FREQ_2    = 0.12f / SAMPLE_RATE;
float bwPhase1           = 0.0f;
float bwPhase2           = 1.23f;

float emgState = 0.0f;
float beatAmp  = 1.0f;

inline float gauss(float t, float mu, float sigma) {
  float d = (t - mu) / sigma;
  return expf(-0.5f * d * d);
}

inline float asymGauss(float t, float mu, float sigmaL, float sigmaR) {
  float d = t - mu;
  float sigma = (d < 0) ? sigmaL : sigmaR;
  return expf(-0.5f * (d / sigma) * (d / sigma));
}

float ecgSample(float pos, float amp) {
  float v = 0.0f;

  // P-волна двугорбая
  v += amp * (0.09f * gauss(pos, 38.0f, 5.5f)
            + 0.07f * gauss(pos, 46.0f, 4.5f));

  // Q-зубец
  v -= amp * 0.055f * gauss(pos, 74.5f, 2.8f);

  // R-зубец
  v += amp * 1.15f  * gauss(pos, 81.5f, 3.2f);

  // R'-зазубрина
  v += amp * 0.04f  * gauss(pos, 86.5f, 1.8f);

  // S-зубец
  v -= amp * 0.22f  * gauss(pos, 91.5f, 3.0f);

  // ST-сегмент +0.02 мВ (норма)
  v += amp * 0.02f  * gauss(pos, 105.0f, 12.0f);

  // T-волна асимметричная
  v += amp * 0.38f  * asymGauss(pos, 130.0f, 22.0f, 14.0f);

  // U-волна
  v += amp * 0.045f * gauss(pos, 165.0f, 12.0f);

  return v;
}

float nextBeatPeriod() {
  float rsa    = RESP_HRV_AMP * sinf(2.0f * M_PI * globalTime / RESP_PERIOD);
  float jitter = ((float)random(-30, 30)) / 10.0f;
  float period = BASE_PERIOD + rsa + jitter;
  if (period < 188.0f) period = 188.0f;
  if (period > 242.0f) period = 242.0f;
  return period;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  randomSeed(analogRead(35));

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  Serial.println("=== CardioScan Synthetic ECG v2 ===");
  Serial.print("Сеть: "); Serial.println(AP_SSID);
  Serial.print("IP: ");   Serial.println(WiFi.softAPIP());

  wsServer.begin();
  Serial.println("WebSocket порт 81");

  beatPeriod = nextBeatPeriod();
  beatAmp    = 0.95f + ((float)random(0, 100)) / 1000.0f;
}

void loop() {
  wsServer.loop();

  if (micros() - lastMicros >= intervalMicros) {
    lastMicros = micros();

    float pos = globalTime - beatStart;

    if (pos >= beatPeriod) {
      beatStart  += beatPeriod;
      beatPeriod  = nextBeatPeriod();
      pos         = globalTime - beatStart;
      beatAmp     = 0.95f + ((float)random(0, 100)) / 1000.0f;
    }

    float val = ecgSample(pos, beatAmp);

    // Baseline wander
    bwPhase1 += 2.0f * M_PI * BW_FREQ_1;
    bwPhase2 += 2.0f * M_PI * BW_FREQ_2;
    val += 0.06f * sinf(bwPhase1) + 0.03f * sinf(bwPhase2);

    // EMG + белый шум
    float white = ((float)random(-100, 100)) / 100.0f;
    emgState    = 0.85f * emgState + 0.15f * white;
    val        += emgState * 0.008f + white * 0.005f;

    // Редкий артефакт движения
    static int   artifactCountdown = 0;
    static int   artifactLen       = 0;
    static float artifactVal       = 0.0f;
    if (artifactCountdown <= 0 && artifactLen == 0)
      artifactCountdown = 1800 + random(0, 500);
    if (artifactCountdown > 0) {
      artifactCountdown--;
      if (artifactCountdown == 0) {
        artifactLen = 3 + random(0, 3);
        artifactVal = (random(0, 2) ? 1.0f : -1.0f) * (0.04f + ((float)random(0, 40)) / 1000.0f);
      }
    }
    if (artifactLen > 0) { val += artifactVal; artifactLen--; }

    int16_t ecg_raw = (int16_t)(val * 1000.0f);
    Serial.println(ecg_raw);
    wsServer.broadcastTXT(String(ecg_raw));

    globalTime += 1.0f;
  }
}
