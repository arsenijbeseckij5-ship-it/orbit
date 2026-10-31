mod commands;

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use librqbit::{Api, Session, SessionOptions, SessionPersistenceConfig};
use tauri::Manager;
use tokio::sync::OnceCell;

fn application_download_directory(executable: &std::path::Path) -> Option<PathBuf> {
    executable
        .parent()
        .filter(|directory| !directory.as_os_str().is_empty())
        .map(|directory| directory.join("Downloads"))
}

fn prepare_download_directory(
    preferred: &std::path::Path,
    fallback: &std::path::Path,
) -> Result<PathBuf, std::io::Error> {
    match ensure_writable_directory(preferred) {
        Ok(()) => Ok(preferred.to_path_buf()),
        Err(preferred_error) => {
            ensure_writable_directory(fallback).map_err(|fallback_error| {
                std::io::Error::other(format!(
                    "Cannot use download directory {} ({preferred_error}); fallback {} also failed ({fallback_error})",
                    preferred.display(),
                    fallback.display()
                ))
            })?;
            Ok(fallback.to_path_buf())
        }
    }
}

fn ensure_writable_directory(directory: &std::path::Path) -> Result<(), std::io::Error> {
    std::fs::create_dir_all(directory)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let probe_path = directory.join(format!(
        ".orbit-write-check-{}-{timestamp}",
        std::process::id()
    ));
    let probe = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe_path)?;
    drop(probe);
    std::fs::remove_file(probe_path)
}

pub struct AppState {
    api: OnceCell<Api>,
    session_dir: PathBuf,
    default_download_dir: PathBuf,
    legacy_default_download_dir: PathBuf,
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
            let legacy_download_dir = app
                .path()
                .download_dir()
                .unwrap_or_else(|_| app_data_dir.join("Downloads"))
                .join("ORBIT");
            let executable = std::env::current_exe()?;
            let downloads_dir = application_download_directory(&executable).ok_or_else(|| {
                std::io::Error::other("Cannot find the ORBIT installation directory")
            })?;
            let downloads_dir = prepare_download_directory(&downloads_dir, &legacy_download_dir)?;
            let state = AppState {
                api: OnceCell::new(),
                session_dir: app_data_dir.join("session"),
                default_download_dir: downloads_dir,
                legacy_default_download_dir: legacy_download_dir,
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_torrents,
            commands::default_download_folder,
            commands::legacy_default_download_folder,
            commands::add_magnet,
            commands::add_torrent_file,
            commands::pause_torrent,
            commands::resume_torrent,
            commands::remove_torrent,
            commands::remove_torrent_and_files,
            commands::open_torrent_folder,
            commands::open_download_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running ORBIT");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downloads_are_stored_in_a_folder_next_to_the_application() {
        let executable = std::path::Path::new(r"H:\Games\ORBIT\orbit.exe");
        assert_eq!(
            application_download_directory(executable),
            Some(PathBuf::from(r"H:\Games\ORBIT\Downloads"))
        );
    }

    #[test]
    fn executable_without_parent_has_no_application_download_directory() {
        assert_eq!(
            application_download_directory(std::path::Path::new("orbit.exe")),
            None
        );
    }

    #[test]
    fn download_directory_falls_back_when_the_application_path_cannot_be_used() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "orbit-download-path-test-{}-{timestamp}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).expect("create isolated test directory");
        let preferred = root.join("not-a-directory");
        std::fs::write(&preferred, b"test").expect("create preferred-path blocker");
        let fallback = root.join("fallback");

        assert_eq!(
            prepare_download_directory(&preferred, &fallback).expect("use fallback"),
            fallback
        );
        std::fs::remove_dir_all(root).expect("remove isolated test directory");
    }
}
