
use std::{
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
            .join("../packaging/windows/wintersweater-backend.exe");
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
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
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

                let child = Command::new(executable)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()?;

                Some(child)
            };

            app.manage(BackendProcess(Mutex::new(child)));

            for _ in 0..100 {
                if backend_is_running() {
                    return Ok(());
                }

                if let Some(child) = app.state::<BackendProcess>().0.lock().unwrap().as_mut() {
                    if child.try_wait()?.is_some() {
                        return Err("バックエンドが起動直後に終了しました".into());
                    }
                }

                thread::sleep(Duration::from_millis(100));
            }

            Err("バックエンドの起動がタイムアウトしました".into())
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
