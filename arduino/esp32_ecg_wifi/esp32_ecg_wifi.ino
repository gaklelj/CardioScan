/*
  CardioScan5 -- ESP32 DevKit V1 (classic dual-core ESP32), ADS1293 ONLY.
  Arduino IDE: ESP32 Dev Module; ESP32 Arduino core 3.x.
  Uses bundled Arduino/SPI/WiFi/FreeRTOS libraries; no ADS library required.

  SPI: SCLK=18, SDO/MISO=19, SDI/MOSI=23, CSB=27, DRDYB=34, common GND.
  Reset is not driven by this sketch. RSTB must be held high by the module.
  Requires a 4.096 MHz crystal and the external RLD circuit from TI's design.
  Do NOT infer module power wiring from this sketch. Verify VDDIO=3.3 V,
  module supply requirements, input protection and connector routing first.

  Required electrode routing (NOT a cable color or physical jack assignment):
    IN1=RA, IN2=LA, IN3=LL, IN4=RL (RLD output), IN5=chest V1.
    IN6=internally driven Wilson reference; leave its cable end insulated.
  Unknown CJMCU jack/color mapping must be checked with power disconnected.
  Development prototype, not a diagnostic device. Do not connect a person
  while USB, a charger or non-isolated test equipment is connected.
  Battery operation alone does not establish patient electrical safety.

  TI ADS1293 datasheet, section 9.2.2:
  https://www.ti.com/lit/ds/symlink/ads1293.pdf
  CH1=LA-RA; CH2=LL-RA; CH3=V1-(RA+LA+LL)/3.
  Lead III is computed separately as II-I.
  Nominal sample rate 853.333 samples/s, hardware ECG bandwidth ~175 Hz.
  Raw ADC codes are UNSIGNED, not signed 24-bit two's complement.
  No additional high-pass/notch/low-pass filtering or voltage conversion.

  WiFi AP: CardioScan-ESP32 / 12345678; TCP 192.168.4.1:3333.
  One TCP client. CSV header describes the NEW seven-column format:
  timestamp_us,sequence,lead_I_raw,lead_II_raw,lead_III_raw,V1_raw,lost_samples
  timestamp_us is ESP32 read time, not an exact ADC conversion timestamp.
  sequence starts at 0 and includes known missed notification events.
  lost_samples counts known acquisition backlog + queue overflow only;
  it cannot detect every hardware or network loss. ADC has no sample FIFO.
  Serial 115200: register checks, data-ready timeout and sampling statistics.
  Open arduino/esp32_ecg_wifi/esp32_ecg_wifi.ino; upload with electrodes off.
  The root firmware_synthetic_v2.ino is a separate USB/WiFi test generator.
*/
#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <cstring>

#if !defined(CONFIG_IDF_TARGET_ESP32)
#error "Select ESP32 Dev Module (classic ESP32); this wiring is not for ESP8266/C3/S3."
#endif

constexpr uint8_t PIN_SCLK=18, PIN_MISO=19, PIN_MOSI=23, PIN_CSB=27, PIN_DRDY=34;
constexpr uint16_t TCP_PORT=3333;
const char* AP_NAME="CardioScan-ESP32";
const char* AP_PASSWORD="12345678";
SPISettings adsSettings(1000000, MSBFIRST, SPI_MODE0);
WiFiServer server(TCP_PORT);

struct EcgSample {
  uint64_t timestamp;
  uint32_t sequence, ch1, ch2, ch3, lost;
  int32_t leadIII;
};
// Explicit declaration prevents Arduino's generated prototypes from using the
// custom type before its definition.
void readChannels(EcgSample& s);
QueueHandle_t samples=nullptr;
TaskHandle_t acquisitionHandle=nullptr;

void adsWrite(uint8_t reg, uint8_t value) {
  SPI.beginTransaction(adsSettings);
  digitalWrite(PIN_CSB, LOW);
  SPI.transfer(reg & 0x7F);
  SPI.transfer(value);
  digitalWrite(PIN_CSB, HIGH);
  SPI.endTransaction();
  delayMicroseconds(5);
}
uint8_t adsRead(uint8_t reg) {
  SPI.beginTransaction(adsSettings);
  digitalWrite(PIN_CSB, LOW);
  SPI.transfer(0x80 | reg);
  uint8_t value=SPI.transfer(0);
  digitalWrite(PIN_CSB, HIGH);
  SPI.endTransaction();
  return value;
}
uint32_t read24() {
  uint32_t value=uint32_t(SPI.transfer(0)) << 16;
  value |= uint32_t(SPI.transfer(0)) << 8;
  value |= uint32_t(SPI.transfer(0));
  return value;
}
void readChannels(EcgSample& s) {
  SPI.beginTransaction(adsSettings);
  digitalWrite(PIN_CSB, LOW);
  SPI.transfer(0xD0); // DATA_LOOP 0x50, read bit set; CH_CNFG=0x70.
  s.ch1=read24();
  s.ch2=read24();
  s.ch3=read24();
  digitalWrite(PIN_CSB, HIGH);
  SPI.endTransaction();
}

bool configureADS() {
  adsWrite(0x00, 0x00); // Stop before changing configuration.
  delay(10);
  uint8_t revision=adsRead(0x40);
  Serial.printf("ADS1293 REVID=0x%02X (expected 0x01)\n", revision);
  if (revision != 0x01) return false;
  // Explicitly restore relevant settings, including those changed by the old sketch.
  const uint8_t settings[][2]={
    {0x01,0x11}, // CH1 IN2-IN1
    {0x02,0x19}, // CH2 IN3-IN1
    {0x03,0x2E}, // CH3 IN5-IN6
    {0x07,0x00}, // Disable lead-off excitation on all inputs
    {0x0A,0x07}, // Common mode: IN1, IN2, IN3
    {0x0C,0x04}, // RLD internally routed to IN4
    {0x0D,0x01}, // Wilson buffer 1: IN1
    {0x0E,0x02}, // Wilson buffer 2: IN2
    {0x0F,0x03}, // Wilson buffer 3: IN3
    {0x10,0x01}, // Wilson reference internally routed to IN6
    {0x11,0x00}, // Reference enabled
    {0x12,0x04}, // External 4.096 MHz crystal
    {0x13,0x07}, // High-resolution amplifiers; keep default sample clock
    {0x14,0x00}, // Enable ALL three physical channels
    {0x21,0x02}, // R2=5
    {0x22,0x02}, // R3 CH1=6
    {0x23,0x02}, // R3 CH2=6
    {0x24,0x02}, // R3 CH3=6
    {0x25,0x00}, // R1=4 on all channels
    {0x26,0x00}, // Enable ECG decimation filters
    {0x27,0x08}, // DRDY source ECG CH1; identical rates for all channels
    {0x28,0x40}, // Restore standalone operation: SYNCB output disabled
    {0x29,0x00}, // No optional DRDY masking
    {0x2F,0x70}  // DATA_LOOP: CH1, CH2, CH3 ECG only
  };
  for (const auto& item: settings) adsWrite(item[0],item[1]);
  delay(20);
  bool ok=true;
  for (const auto& item: settings) {
    uint8_t actual=adsRead(item[0]);
    // Ignore reserved read-back bits (TI section 8.6).
    uint8_t mask=0xFF;
    switch (item[0]) {
      case 0x01: case 0x02: case 0x03: case 0x07: case 0x0A:
      case 0x13: case 0x14: mask=0x3F; break;
      case 0x0C: mask=0x07; break; // Verify selected RLD electrode.
      case 0x0D: case 0x0E: case 0x0F: case 0x12:
      case 0x25: case 0x26: mask=0x07; break;
      case 0x10: case 0x11: mask=0x03; break;
      case 0x27: case 0x29: mask=0x3F; break;
      case 0x2F: mask=0x7F; break;
      case 0x28: mask=0x7F; break;
    }
    if ((actual & mask) != (item[1] & mask)) {
      Serial.printf("Register 0x%02X: wrote 0x%02X, read 0x%02X\n",
                    item[0],item[1],actual);
      ok=false;
    }
  }
  return ok;
}

void IRAM_ATTR dataReadyISR() {
  BaseType_t wake=pdFALSE;
  if (acquisitionHandle) vTaskNotifyGiveFromISR(acquisitionHandle,&wake);
  if (wake == pdTRUE) portYIELD_FROM_ISR();
}

void acquireTask(void*) {
  acquisitionHandle=xTaskGetCurrentTaskHandle();
  // setup() and this task must never access SPI concurrently. In particular,
  // the first DRDY may arrive before the start-conversion SPI write finishes.
  // The notification remains pending until this task finishes that write.
  attachInterrupt(digitalPinToInterrupt(PIN_DRDY),dataReadyISR,FALLING);
  adsWrite(0x00,0x01);
  if ((adsRead(0x00) & 0x01) == 0) {
    Serial.println("ERROR: ADS1293 did not start conversion. Restart after checking wiring.");
    detachInterrupt(digitalPinToInterrupt(PIN_DRDY));
    vTaskDelete(nullptr);
    return;
  }
  Serial.println("Started: I, II, computed III, measured V1; nominal 853.333 samples/s.");
  uint32_t sequence=0, lost=0, windowReads=0;
  uint32_t windowStart=millis();
  for (;;) {
    uint32_t ready=ulTaskNotifyTake(pdTRUE,pdMS_TO_TICKS(2000));
    if (!ready) {
      Serial.println("No DRDY for 2 s: check DRDYB->GPIO34, crystal, reset and power.");
      continue; // Never manufacture repeated samples on a timeout.
    }
    if (ready > 1) {
      lost += ready-1;
      sequence += ready-1; // Only the latest ADC result can be recovered.
    }
    EcgSample s{};
    s.timestamp=uint64_t(esp_timer_get_time());
    s.sequence=sequence++;
    readChannels(s);
    s.leadIII=int32_t(s.ch2)-int32_t(s.ch1);
    s.lost=lost;
    if (xQueueSend(samples,&s,0) != pdTRUE) ++lost; // Drop new sample, never block ADC.
    ++windowReads;
    uint32_t now=millis();
    if (now-windowStart >= 5000) {
      Serial.printf("Read rate=%.1f/s; known lost=%lu; queue=%u\n",
        windowReads*1000.0f/(now-windowStart),(unsigned long)lost,
        (unsigned)uxQueueMessagesWaiting(samples));
      windowReads=0;
      windowStart=now;
    }
  }
}

bool writeAll(WiFiClient& client, const char* data, size_t length) {
  size_t offset=0;
  uint32_t start=millis();
  while (offset < length && client.connected()) {
    size_t n=client.write(reinterpret_cast<const uint8_t*>(data)+offset,length-offset);
    if (n == 0 || millis()-start > 1000) return false;
    offset += n;
  }
  return offset == length;
}

void networkTask(void*) {
  WiFiClient client;
  char packet[2048];
  size_t used=0;
  uint32_t lastSend=millis();
  for (;;) {
    if (!client || !client.connected()) {
      client.stop();
      used=0;
      client=server.available();
      if (client) {
        // A new recording starts with fresh samples, never a previous backlog.
        xQueueReset(samples);
        client.setNoDelay(true);
        client.setTimeout(1000);
        const char* header="timestamp_us,sequence,lead_I_raw,lead_II_raw,lead_III_raw,V1_raw,lost_samples\r\n";
        if (!writeAll(client,header,strlen(header))) client.stop();
        lastSend=millis();
      }
    }
    EcgSample s;
    if (xQueueReceive(samples,&s,pdMS_TO_TICKS(5)) == pdTRUE && client.connected()) {
      char line[160];
      int length=snprintf(line,sizeof(line),"%llu,%lu,%lu,%lu,%ld,%lu,%lu\r\n",
        (unsigned long long)s.timestamp,(unsigned long)s.sequence,
        (unsigned long)s.ch1,(unsigned long)s.ch2,(long)s.leadIII,
        (unsigned long)s.ch3,(unsigned long)s.lost);
      if (length <= 0 || size_t(length) >= sizeof(line)) {
        client.stop(); used=0; continue;
      }
      if (used+size_t(length) > sizeof(packet)) {
        if (!writeAll(client,packet,used)) {client.stop(); used=0; continue;}
        used=0; lastSend=millis();
      }
      memcpy(packet+used,line,size_t(length));
      used+=size_t(length);
    }
    // Batch for <=20 ms instead of a WiFi transmission for every ADC sample.
    if (used && (used >= 1024 || millis()-lastSend >= 20)) {
      if (!writeAll(client,packet,used)) client.stop();
      used=0; lastSend=millis();
    }
    // Without a client samples are deliberately drained, not recorded locally.
  }
}

void haltWithError(const char* message) {
  Serial.println(message);
  for (;;) delay(1000);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(PIN_CSB,OUTPUT);
  digitalWrite(PIN_CSB,HIGH);
  pinMode(PIN_DRDY,INPUT); // GPIO34 has no internal pull-up.
  SPI.begin(PIN_SCLK,PIN_MISO,PIN_MOSI,PIN_CSB);
  delay(100);
  if (!configureADS()) haltWithError("ADS configuration failed; acquisition NOT started.");
  samples=xQueueCreate(512,sizeof(EcgSample));
  if (!samples) haltWithError("Cannot allocate sample queue.");

  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);
  if (!WiFi.softAP(AP_NAME,AP_PASSWORD,1,false,1)) haltWithError("WiFi AP failed.");
  server.begin();
  server.setNoDelay(true);
  Serial.printf("WiFi: %s / %s\n",AP_NAME,AP_PASSWORD);
  Serial.print("TCP: "); Serial.print(WiFi.softAPIP()); Serial.printf(":%u\n",TCP_PORT);
  if (xTaskCreatePinnedToCore(networkTask,"TCP sender",6144,nullptr,1,
      nullptr,0) != pdPASS) haltWithError("Cannot start network task.");
  if (xTaskCreatePinnedToCore(acquireTask,"ADS acquisition",4096,nullptr,3,
      &acquisitionHandle,1) != pdPASS) haltWithError("Cannot start ADC task.");
}

void loop() { delay(1000); }
