use tauri_plugin_fs::FsExt;

#[tauri::command]
fn grant_fs_scope(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let fs_scope = app.fs_scope();
    let path = std::path::PathBuf::from(&path);

    // Allow the directory and all contents recursively
    fs_scope
        .allow_directory(&path, true)
        .map_err(|e| format!("Failed to grant scope for {}: {}", path.display(), e))?;

    log::info!("Granted fs scope for: {}", path.display());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![grant_fs_scope])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
