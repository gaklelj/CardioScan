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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
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
        ]);

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.invoke_handler(tauri::generate_handler![]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
