use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // PythonでビルドしたFastAPIサーバーを起動
            let (mut receiver, child) = app
                .shell()
                .sidecar("wintersweater-server")?
                .spawn()?;

            app.manage(BackendProcess(Mutex::new(Some(child))));

            // プロセスの出力を読み続ける
            tauri::async_runtime::spawn(async move {
                while let Some(_event) = receiver.recv().await {}
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tauri initialization failed");

    app.run(|handle, event| {
        // アプリ終了時にFastAPIも終了する
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<BackendProcess>() {
                if let Ok(mut child) = state.0.lock() {
                    if let Some(process) = child.as_mut() {
                        let _ = process.kill();
                    }
                }
            }
        }
    });
}