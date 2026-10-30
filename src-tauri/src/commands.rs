use std::path::{Path, PathBuf};

use librqbit::{
    AddTorrent, AddTorrentOptions, Api, TorrentStatsState,
    api::{ApiTorrentListOpts, TorrentIdOrHash},
};
use serde::Serialize;
use tauri::State;

use crate::AppState;

const MAX_TORRENT_FILE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentRow {
    id: usize,
    info_hash: String,
    name: String,
    output_folder: String,
    status: String,
    progress_bytes: u64,
    total_bytes: u64,
    uploaded_bytes: u64,
    download_speed: u64,
    upload_speed: u64,
    eta: Option<String>,
    finished: bool,
    error: Option<String>,
}

fn map_torrent(torrent: librqbit::api::TorrentDetailsResponse) -> Result<TorrentRow, String> {
    let stats = torrent
        .stats
        .ok_or_else(|| format!("Torrent {} is missing engine statistics", torrent.info_hash))?;
    let status = match stats.state {
        TorrentStatsState::Initializing { paused: true } | TorrentStatsState::Paused => "paused",
        TorrentStatsState::Initializing { paused: false } => "metadata",
        TorrentStatsState::Live if stats.finished => "seeding",
        TorrentStatsState::Live => "downloading",
        TorrentStatsState::Error => "error",
    };
    let (download_speed, upload_speed, eta) = stats
        .live
        .as_ref()
        .map(|live| {
            (
                live.download_speed.as_bytes(),
                live.upload_speed.as_bytes(),
                live.time_remaining.as_ref().map(ToString::to_string),
            )
        })
        .unwrap_or((0, 0, None));

    Ok(TorrentRow {
        id: torrent
            .id
            .ok_or_else(|| format!("Torrent {} has no engine ID", torrent.info_hash))?,
        info_hash: torrent.info_hash,
        name: torrent
            .name
            .unwrap_or_else(|| "Получение метаданных…".to_owned()),
        output_folder: torrent.output_folder,
        status: status.to_owned(),
        progress_bytes: stats.progress_bytes,
        total_bytes: stats.total_bytes,
        uploaded_bytes: stats.uploaded_bytes,
        download_speed,
        upload_speed,
        eta,
        finished: stats.finished,
        error: stats.error,
    })
}

#[tauri::command]
pub async fn list_torrents(state: State<'_, AppState>) -> Result<Vec<TorrentRow>, String> {
    let api = state.api().await?;
    api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true })
        .torrents
        .into_iter()
        .map(map_torrent)
        .collect()
}

#[tauri::command]
pub fn default_download_folder(state: State<'_, AppState>) -> Result<String, String> {
    state
        .default_download_dir
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Путь загрузки не поддерживает Unicode.".to_owned())
}

async fn download_directory(requested: Option<String>, fallback: &Path) -> Result<String, String> {
    let path = requested
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| fallback.to_path_buf());
    if !path.is_absolute() {
        return Err("Папка загрузки должна быть абсолютным путём.".to_owned());
    }

    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|error| format!("Не удалось создать папку загрузки: {error}"))?;
    let canonical = tokio::fs::canonicalize(&path)
        .await
        .map_err(|error| format!("Не удалось проверить папку загрузки: {error}"))?;
    let metadata = tokio::fs::metadata(&canonical)
        .await
        .map_err(|error| format!("Не удалось прочитать папку загрузки: {error}"))?;
    if !metadata.is_dir() {
        return Err("Путь загрузки должен указывать на папку.".to_owned());
    }
    canonical
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Путь загрузки не поддерживает Unicode.".to_owned())
}

fn validate_magnet(uri: &str) -> Result<(), String> {
    if !uri.starts_with("magnet:?") {
        return Err("Ожидается Magnet-ссылка, начинающаяся с magnet:?".to_owned());
    }
    librqbit::Magnet::parse(uri)
        .map(|_| ())
        .map_err(|error| format!("Некорректная Magnet-ссылка: {error:#}"))
}

async fn add_to_session(
    api: &Api,
    torrent: AddTorrent<'_>,
    output_folder: Option<String>,
) -> Result<(), String> {
    api.api_add_torrent(
        torrent,
        Some(AddTorrentOptions {
            output_folder,
            ..AddTorrentOptions::default()
        }),
    )
    .await
    .map(|_| ())
    .map_err(|error| format!("Не удалось добавить торрент: {error}"))
}

#[tauri::command]
pub async fn add_magnet(
    state: State<'_, AppState>,
    uri: String,
    output_folder: Option<String>,
) -> Result<(), String> {
    let uri = uri.trim();
    validate_magnet(uri)?;
    let folder = download_directory(output_folder, &state.default_download_dir).await?;
    add_to_session(state.api().await?, AddTorrent::from_url(uri), Some(folder)).await
}

#[tauri::command]
pub async fn add_torrent_file(
    state: State<'_, AppState>,
    path: String,
    output_folder: Option<String>,
) -> Result<(), String> {
    let source = PathBuf::from(&path);
    if !source
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("torrent"))
    {
        return Err("Выберите файл с расширением .torrent.".to_owned());
    }

    let metadata = tokio::fs::metadata(&source)
        .await
        .map_err(|error| format!("Не удалось открыть файл торрента: {error}"))?;
    if !metadata.is_file() || metadata.len() > MAX_TORRENT_FILE_BYTES {
        return Err("Файл торрента пуст или превышает ограничение 32 МиБ.".to_owned());
    }
    let bytes = tokio::fs::read(&source)
        .await
        .map_err(|error| format!("Не удалось прочитать файл торрента: {error}"))?;
    if bytes.is_empty() {
        return Err("Файл торрента пуст.".to_owned());
    }

    let folder = download_directory(output_folder, &state.default_download_dir).await?;
    add_to_session(
        state.api().await?,
        AddTorrent::from_bytes(bytes),
        Some(folder),
    )
    .await
}

#[tauri::command]
pub async fn pause_torrent(state: State<'_, AppState>, id: usize) -> Result<(), String> {
    state
        .api()
        .await?
        .api_torrent_action_pause(TorrentIdOrHash::Id(id))
        .await
        .map(|_| ())
        .map_err(|error| format!("Не удалось приостановить торрент: {error}"))
}

#[tauri::command]
pub async fn resume_torrent(state: State<'_, AppState>, id: usize) -> Result<(), String> {
    state
        .api()
        .await?
        .api_torrent_action_start(TorrentIdOrHash::Id(id))
        .await
        .map(|_| ())
        .map_err(|error| format!("Не удалось возобновить торрент: {error}"))
}

#[tauri::command]
pub async fn remove_torrent(
    state: State<'_, AppState>,
    id: usize,
    remove_files: bool,
) -> Result<(), String> {
    let api = state.api().await?;
    let result = if remove_files {
        api.api_torrent_action_delete(TorrentIdOrHash::Id(id)).await
    } else {
        api.api_torrent_action_forget(TorrentIdOrHash::Id(id)).await
    };
    result
        .map(|_| ())
        .map_err(|error| format!("Не удалось удалить торрент: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use librqbit::{Session, SessionOptions, create_torrent, spawn_utils::BlockingSpawner};

    #[test]
    fn validates_magnet_scheme_and_metadata() {
        assert!(validate_magnet("https://example.com").is_err());
        assert!(validate_magnet("magnet:?dn=file").is_err());
        assert!(
            validate_magnet("magnet:?xt=urn:btih:0123456789012345678901234567890123456789").is_ok()
        );
    }

    #[test]
    fn rejects_non_torrent_file_names() {
        let path = PathBuf::from(r"C:\Downloads\archive.zip");
        assert!(
            !path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("torrent"))
        );
    }

    #[test]
    fn accepts_case_insensitive_torrent_extension() {
        let path = PathBuf::from(r"C:\Downloads\sample.TORRENT");
        assert!(
            path.extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("torrent"))
        );
    }

    #[tokio::test]
    async fn local_torrent_can_be_added_listed_paused_and_resumed() {
        let root = std::env::temp_dir().join(format!(
            "orbit-engine-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source = root.join("source");
        let downloads = root.join("downloads");
        tokio::fs::create_dir_all(&source).await.unwrap();
        tokio::fs::write(source.join("payload.bin"), b"verified local torrent")
            .await
            .unwrap();

        let torrent = create_torrent(&source, Default::default(), &BlockingSpawner::new(1))
            .await
            .unwrap();
        let session = Session::new_with_opts(
            downloads.clone(),
            SessionOptions {
                dht: None,
                persistence: None,
                ..SessionOptions::default()
            },
        )
        .await
        .unwrap();
        let api = Api::new(session.clone(), None);
        let added = api
            .api_add_torrent(
                AddTorrent::from_bytes(torrent.as_bytes().unwrap()),
                Some(AddTorrentOptions {
                    output_folder: Some(downloads.to_string_lossy().into_owned()),
                    ..AddTorrentOptions::default()
                }),
            )
            .await
            .unwrap();
        assert!(added.id.is_some());
        assert_eq!(
            added.details.name.as_deref(),
            Some("source"),
            "engine should report the generated torrent's real name"
        );

        let rows = api
            .api_torrent_list_ext(ApiTorrentListOpts { with_stats: true })
            .torrents;
        assert_eq!(rows.len(), 1);
        let row = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let row = map_torrent(
                    api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true })
                        .torrents
                        .into_iter()
                        .next()
                        .unwrap(),
                )
                .unwrap();
                if row.status == "downloading" {
                    break row;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("torrent did not finish initialization");
        assert_eq!(row.name, "source");
        assert_eq!(row.status, "downloading");
        assert_eq!(row.total_bytes, b"verified local torrent".len() as u64);

        api.api_torrent_action_pause(TorrentIdOrHash::Id(row.id))
            .await
            .unwrap();
        let paused = map_torrent(
            api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true })
                .torrents
                .into_iter()
                .next()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(paused.status, "paused");

        api.api_torrent_action_start(TorrentIdOrHash::Id(row.id))
            .await
            .unwrap();
        let resumed = map_torrent(
            api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true })
                .torrents
                .into_iter()
                .next()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(resumed.status, "downloading");

        api.api_torrent_action_forget(TorrentIdOrHash::Id(row.id))
            .await
            .unwrap();
        session.stop().await;
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
}
