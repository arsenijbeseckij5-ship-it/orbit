mod commands;

use std::path::PathBuf;

use librqbit::{Api, Session, SessionOptions, SessionPersistenceConfig};
use tauri::Manager;
use tokio::sync::OnceCell;

pub struct AppState {
    api: OnceCell<Api>,
    session_dir: PathBuf,
    default_download_dir: PathBuf,
}

impl AppState {
    async fn api(&self) -> Result<&Api, String> {
        self.api
            .get_or_try_init(|| async {
                tokio::fs::create_dir_all(&self.session_dir)
                    .await
                    .map_err(|error| format!("Cannot create session directory: {error}"))?;
                tokio::fs::create_dir_all(&self.default_download_dir)
                    .await
                    .map_err(|error| format!("Cannot create download directory: {error}"))?;

                let session = Session::new_with_opts(
                    self.default_download_dir.clone(),
                    SessionOptions {
                        fastresume: true,
                        persistence: Some(SessionPersistenceConfig::Json {
                            folder: Some(self.session_dir.clone()),
                        }),
                        ..SessionOptions::default()
                    },
                )
                .await
                .map_err(|error| format!("Cannot start torrent engine: {error:#}"))?;

                Ok(Api::new(session, None))
            })
            .await
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_local_data_dir()?;
            let downloads_dir = app
                .path()
                .download_dir()
                .unwrap_or_else(|_| app_data_dir.join("Downloads"))
                .join("ORBIT");
            let state = AppState {
                api: OnceCell::new(),
                session_dir: app_data_dir.join("session"),
                default_download_dir: downloads_dir,
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_torrents,
            commands::default_download_folder,
            commands::add_magnet,
            commands::add_torrent_file,
            commands::pause_torrent,
            commands::resume_torrent,
            commands::remove_torrent,
            commands::remove_torrent_and_files,
            commands::open_torrent_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running ORBIT");
}
