
use std::{
    fs::{self, OpenOptions},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use tauri::{Manager, RunEvent};

struct BackendProcess(Mutex<Option<Child>>);

fn backend_path(app: &tauri::App) -> Result<PathBuf, Box<dyn std::error::Error>> {
    #[cfg(debug_assertions)]
    {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../packaging/windows/wintersweater-backend")
            .join("wintersweater-backend.exe");

        return Ok(path);
    }

    #[cfg(not(debug_assertions))]
    {
        Ok(app
            .path()
            .resource_dir()?
            .join("backend")
            .join("wintersweater-backend.exe"))
    }
}

fn backend_is_running() -> bool {
    let address: SocketAddr = "127.0.0.1:8765".parse().unwrap();

    TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // 2重起動を防ぐ（他のプラグインより先に登録する）。
        // 2つ目を起動すると、既存のウィンドウを前面に出す。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let log_dir = app_data_dir.join("logs");

            fs::create_dir_all(&log_dir)?;

            let log_path = log_dir.join("backend.log");

            let child = if backend_is_running() {
                None
            } else {
                let executable = backend_path(app)?;

                if !executable.exists() {
                    return Err(format!(
                        "バックエンド実行ファイルが見つかりません: {}",
                        executable.display()
                    )
                    .into());
                }

                let stdout = OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)?;

                let stderr = stdout.try_clone()?;

                let child = Command::new(executable)
                    .current_dir(&app_data_dir)
                    .stdin(Stdio::null())
                    .stdout(Stdio::from(stdout))
                    .stderr(Stdio::from(stderr))
                    .spawn()?;

                Some(child)
            };

            app.manage(BackendProcess(Mutex::new(child)));

            for _ in 0..200 {
                if backend_is_running() {
                    return Ok(());
                }

                if let Some(child) = app
                    .state::<BackendProcess>()
                    .0
                    .lock()
                    .unwrap()
                    .as_mut()
                {
                    if child.try_wait()?.is_some() {
                        return Err(format!(
                            "バックエンドが起動直後に終了しました。ログ: {}",
                            log_path.display()
                        )
                        .into());
                    }
                }

                thread::sleep(Duration::from_millis(100));
            }

            Err(format!(
                "バックエンドの起動がタイムアウトしました。ログ: {}",
                log_path.display()
            )
            .into())
        });

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<BackendProcess>() {
                    if let Ok(mut process) = state.0.lock() {
                        if let Some(child) = process.as_mut() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
