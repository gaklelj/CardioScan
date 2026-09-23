#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::sync::Mutex;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
struct SerialState(Mutex<Option<Box<dyn serialport::SerialPort>>>);

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn list_serial_ports() -> Vec<String> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p: serialport::SerialPortInfo| p.port_name)
        .collect()
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn connect_serial(
    state: tauri::State<SerialState>,
    port: String,
    baud_rate: u32,
) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    let p = serialport::new(&port, baud_rate)
        .timeout(std::time::Duration::from_millis(10))
        .open()
        .map_err(|e| e.to_string())?;
    *guard = Some(p);
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn disconnect_serial(state: tauri::State<SerialState>) {
    let mut guard = state.0.lock().unwrap();
    *guard = None;
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
fn read_serial_data(state: tauri::State<SerialState>) -> Result<String, String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(port) = guard.as_mut() {
        let mut buf = vec![0u8; 512];
        match port.read(&mut buf) {
            Ok(n) if n > 0 => {
                String::from_utf8(buf[..n].to_vec()).map_err(|e| e.to_string())
            }
            Ok(_) => Ok(String::new()),
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(String::new()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        Err("not_connected".to_string())
    }
}

// Native HTTP proxy — bypasses WebView fetch/CORS restrictions on all platforms
use base64::Engine as _;

#[tauri::command]
async fn ai_report(predictions: Vec<serde_json::Value>, lang: String, api_key: String) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("API key not configured".to_string());
    }

    // Build per-class summary: "ST-Elevation ×3 (max 94%)"
    let mut class_map: std::collections::HashMap<String, (u32, f64)> = std::collections::HashMap::new();
    for p in &predictions {
        let cls = p.get("class").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
        let conf = p.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let entry = class_map.entry(cls).or_insert((0, 0.0));
        entry.0 += 1;
        if conf > entry.1 { entry.1 = conf; }
    }

    let mut findings: Vec<String> = class_map.iter()
        .map(|(cls, (cnt, max_conf))| {
            if *cnt > 1 {
                format!("{} ×{} (max {:.0}%)", cls, cnt, max_conf * 100.0)
            } else {
                format!("{} ({:.0}%)", cls, max_conf * 100.0)
            }
        })
        .collect();
    findings.sort();

    let findings_text = if findings.is_empty() {
        "No anomalies detected".to_string()
    } else {
        findings.join(", ")
    };

    let (lang_instruction, field_labels) = match lang.as_str() {
        "ru" => (
            "Ответь ТОЛЬКО на русском языке. НЕ используй английский.",
            "Заключение: ...\nРекомендации: ...\nПримечание: Данный анализ выполнен ИИ и не заменяет консультацию врача.",
        ),
        "kz" => (
            "Тек қазақ тілінде жауап бер. Ағылшын тілін пайдаланба.",
            "Қорытынды: ...\nҰсыныстар: ...\nЕскерту: Бұл талдау ЖИ арқылы жасалған және дәрігердің кеңесін алмастырмайды.",
        ),
        _ => (
            "Respond in English only.",
            "Interpretation: ...\nRecommendation: ...\nDisclaimer: This analysis is AI-generated and does not replace professional medical advice.",
        ),
    };

    let prompt = format!(
        "You are a concise ECG interpretation assistant. Based on these computer vision detection results, write a brief clinical interpretation in 2-3 sentences, then a short recommendation. {}\n\nFormat:\n{}\n\nDetected findings: {}",
        lang_instruction, field_labels, findings_text
    );

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "claude-haiku-4-5",
        "max_tokens": 600,
        "messages": [{"role": "user", "content": prompt}]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key.trim())
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    json["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| {
            json.get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unexpected API response")
                .to_string()
        })
}

#[tauri::command]
async fn roboflow_infer(url: String, body: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Content-Type", "text/plain")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    if content_type.contains("image") {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(serde_json::json!({
            "type": "image",
            "data": format!("data:{};base64,{}", content_type.split(';').next().unwrap_or("image/jpeg"), b64)
        }))
    } else {
        let text = String::from_utf8_lossy(&bytes).to_string();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::json!({"error": text}));
        Ok(serde_json::json!({
            "type": "json",
            "data": json
        }))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Launch bundled Python backend on desktop (Windows/macOS/Linux)
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use tauri_plugin_shell::ShellExt;
                match app.shell().sidecar("backend") {
                    Ok(cmd) => { let _ = cmd.spawn(); }
                    Err(e) => log::warn!("Backend sidecar unavailable: {}", e),
                }
            }

            Ok(())
        });

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .manage(SerialState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            connect_serial,
            disconnect_serial,
            read_serial_data,
            roboflow_infer,
            ai_report,
        ]);

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.invoke_handler(tauri::generate_handler![roboflow_infer, ai_report]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
