use std::collections::HashSet;
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::process::Command;

use librqbit::{
    AddTorrent, AddTorrentOptions, Api, TorrentStatsState,
    api::{ApiTorrentListOpts, TorrentDetailsResponseFile, TorrentIdOrHash},
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentFileRow {
    id: usize,
    name: String,
    length: u64,
    included: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerRow {
    address: String,
    state: &'static str,
    client_name: Option<String>,
    connection_kind: Option<String>,
    downloaded_bytes: u64,
    uploaded_bytes: u64,
    errors: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimits {
    download_bps: Option<u32>,
    upload_bps: Option<u32>,
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
pub async fn torrent_files(
    state: State<'_, AppState>,
    id: usize,
) -> Result<Vec<TorrentFileRow>, String> {
    let details = state
        .api()
        .await?
        .api_torrent_details(TorrentIdOrHash::Id(id))
        .map_err(|error| format!("Не удалось получить список файлов торрента: {error:#}"))?;

    Ok(details
        .files
        .unwrap_or_default()
        .into_iter()
        .enumerate()
        .filter(|(_, file)| !file.attributes.padding)
        .map(|(id, file)| TorrentFileRow {
            id,
            name: file.name,
            length: file.length,
            included: file.included,
        })
        .collect())
}

#[tauri::command]
pub async fn set_torrent_files(
    state: State<'_, AppState>,
    id: usize,
    included_file_ids: Vec<usize>,
) -> Result<(), String> {
    let included_file_ids = validate_included_file_ids(included_file_ids)?;

    state
        .api()
        .await?
        .api_torrent_action_update_only_files(TorrentIdOrHash::Id(id), &included_file_ids)
        .await
        .map(|_| ())
        .map_err(|error| format!("Не удалось изменить список файлов: {error:#}"))
}

fn validate_included_file_ids(included_file_ids: Vec<usize>) -> Result<HashSet<usize>, String> {
    let included_file_ids = included_file_ids.into_iter().collect::<HashSet<_>>();
    if included_file_ids.is_empty() {
        return Err("Оставьте выбранным хотя бы один файл.".to_owned());
    }
    Ok(included_file_ids)
}

#[tauri::command]
pub async fn torrent_peers(state: State<'_, AppState>, id: usize) -> Result<Vec<PeerRow>, String> {
    let snapshot = state
        .api()
        .await?
        .api_peer_stats(TorrentIdOrHash::Id(id), Default::default())
        .map_err(|error| format!("Не удалось получить сведения о пирах: {error:#}"))?;

    let mut peers = snapshot
        .peers
        .into_iter()
        .map(|(address, peer)| PeerRow {
            address,
            state: peer.state,
            client_name: peer.client_name,
            connection_kind: peer.conn_kind.map(|kind| format!("{kind:?}")),
            downloaded_bytes: peer.counters.fetched_bytes,
            uploaded_bytes: peer.counters.uploaded_bytes,
            errors: peer.counters.errors,
        })
        .collect::<Vec<_>>();
    peers.sort_by(|left, right| left.address.cmp(&right.address));
    Ok(peers)
}

#[tauri::command]
pub async fn get_rate_limits(state: State<'_, AppState>) -> Result<RateLimits, String> {
    let limits = state.api().await?.session().ratelimits.get_config();
    Ok(RateLimits {
        download_bps: limits.download_bps.map(NonZeroU32::get),
        upload_bps: limits.upload_bps.map(NonZeroU32::get),
    })
}

#[tauri::command]
pub async fn set_rate_limits(
    state: State<'_, AppState>,
    download_bps: Option<u32>,
    upload_bps: Option<u32>,
) -> Result<(), String> {
    let session = state.api().await?;
    session
        .session()
        .ratelimits
        .set_download_bps(download_bps.and_then(NonZeroU32::new));
    session
        .session()
        .ratelimits
        .set_upload_bps(upload_bps.and_then(NonZeroU32::new));
    Ok(())
}

#[tauri::command]
pub fn set_close_to_tray(state: State<'_, AppState>, enabled: bool) {
    state
        .close_to_tray
        .store(enabled, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
pub fn default_download_folder(state: State<'_, AppState>) -> Result<String, String> {
    state
        .default_download_dir
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Путь загрузки не поддерживает Unicode.".to_owned())
}

#[tauri::command]
pub fn legacy_default_download_folder(state: State<'_, AppState>) -> Result<String, String> {
    state
        .legacy_default_download_dir
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "Старый путь загрузки не поддерживает Unicode.".to_owned())
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
pub async fn remove_torrent(state: State<'_, AppState>, id: usize) -> Result<(), String> {
    let api = state.api().await?;
    remove_torrent_from_api(api, id, false).await
}

#[tauri::command]
pub async fn remove_torrent_and_files(state: State<'_, AppState>, id: usize) -> Result<(), String> {
    let api = state.api().await?;
    remove_torrent_from_api(api, id, true).await
}

async fn remove_torrent_from_api(api: &Api, id: usize, remove_files: bool) -> Result<(), String> {
    let details = if remove_files {
        Some(
            api.api_torrent_details(TorrentIdOrHash::Id(id))
                .map_err(|error| {
                    format!("Не удалось получить список файлов торрента: {error:#}")
                })?,
        )
    } else {
        None
    };

    api.api_torrent_action_forget(TorrentIdOrHash::Id(id))
        .await
        .map(|_| ())
        .map_err(|error| format!("Не удалось удалить торрент из очереди: {error:#}"))?;

    if let Some(details) = details {
        delete_torrent_files(
            &PathBuf::from(details.output_folder),
            details.files.as_deref().unwrap_or(&[]),
        )
        .await?;
    }

    Ok(())
}

fn torrent_file_path(root: &Path, components: &[String]) -> Result<PathBuf, String> {
    if components.is_empty()
        || components.iter().any(|component| {
            let mut path_components = Path::new(component).components();
            !matches!(
                path_components.next(),
                Some(std::path::Component::Normal(_))
            ) || path_components.next().is_some()
        })
    {
        return Err("Метаданные торрента содержат небезопасный путь к файлу.".to_owned());
    }

    let path = components
        .iter()
        .fold(root.to_path_buf(), |path, component| path.join(component));
    if !path.starts_with(root) {
        return Err("Путь файла выходит за пределы папки торрента.".to_owned());
    }
    Ok(path)
}

async fn delete_torrent_files(
    output_folder: &Path,
    files: &[TorrentDetailsResponseFile],
) -> Result<(), String> {
    let root = match tokio::fs::canonicalize(output_folder).await {
        Ok(root) => root,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "Торрент удалён из очереди, но не удалось открыть папку с файлами: {error}"
            ));
        }
    };
    let mut directories = HashSet::new();

    for file in files.iter().filter(|file| !file.attributes.padding) {
        let path = torrent_file_path(output_folder, &file.components)?;
        let Some(parent) = path.parent() else {
            continue;
        };
        let canonical_parent = match tokio::fs::canonicalize(parent).await {
            Ok(parent) => parent,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!(
                    "Торрент удалён из очереди, но не удалось проверить путь файла {}: {error}",
                    path.display()
                ));
            }
        };
        if !canonical_parent.starts_with(&root) {
            return Err(format!(
                "Торрент удалён из очереди, но файл {} находится за пределами папки загрузки; файл оставлен на месте.",
                path.display()
            ));
        }

        match tokio::fs::remove_file(&path).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!(
                    "Торрент удалён из очереди, но файл {} не удалось удалить: {error}. Закройте файл и удалите его вручную.",
                    path.display()
                ));
            }
        }

        let mut directory = parent;
        while directory != output_folder && directory.starts_with(output_folder) {
            directories.insert(directory.to_path_buf());
            let Some(parent) = directory.parent() else {
                break;
            };
            directory = parent;
        }
    }

    let mut directories = directories.into_iter().collect::<Vec<_>>();
    directories.sort_unstable_by_key(|path| std::cmp::Reverse(path.components().count()));
    for directory in directories {
        let canonical = match tokio::fs::canonicalize(&directory).await {
            Ok(path) => path,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => {
                return Err(format!(
                    "Торрент удалён из очереди и файлы удалены, но не удалось проверить папку {}: {error}",
                    directory.display()
                ));
            }
        };
        if !canonical.starts_with(&root) {
            continue;
        }
        match tokio::fs::remove_dir(&directory).await {
            Ok(()) => {}
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty
                ) => {}
            Err(error) => {
                return Err(format!(
                    "Торрент удалён из очереди и файлы удалены, но не удалось убрать папку {}: {error}",
                    directory.display()
                ));
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn open_torrent_folder(state: State<'_, AppState>, id: usize) -> Result<(), String> {
    let torrent = state
        .api()
        .await?
        .api_torrent_details(TorrentIdOrHash::Id(id))
        .map_err(|error| format!("Не удалось найти папку торрента: {error:#}"))?;
    let folder = PathBuf::from(torrent.output_folder);
    if !folder.is_dir() {
        return Err(format!(
            "Папка загрузки ещё не создана: {}",
            folder.display()
        ));
    }

    Command::new("explorer.exe")
        .arg(&folder)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Не удалось открыть папку загрузки: {error}"))
}

#[tauri::command]
pub fn open_download_folder(folder: String) -> Result<(), String> {
    let folder = PathBuf::from(folder);
    if !folder.is_absolute() {
        return Err("Папка загрузки должна быть абсолютным путём.".to_owned());
    }
    if !folder.is_dir() {
        return Err(format!("Папка загрузки не найдена: {}", folder.display()));
    }

    Command::new("explorer.exe")
        .arg(&folder)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Не удалось открыть папку загрузки: {error}"))
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

    #[test]
    fn file_selection_requires_at_least_one_file_and_deduplicates_ids() {
        assert!(validate_included_file_ids(Vec::new()).is_err());
        assert_eq!(
            validate_included_file_ids(vec![1, 1, 2]).unwrap(),
            HashSet::from([1, 2])
        );
    }

    #[test]
    fn rejects_torrent_file_paths_that_escape_the_output_folder() {
        let root = Path::new(r"C:\Downloads");
        assert!(torrent_file_path(root, &["..".to_owned(), "outside.txt".to_owned()]).is_err());
        assert!(torrent_file_path(root, &["folder\\outside.txt".to_owned()]).is_err());
        assert!(torrent_file_path(root, &["C:outside.txt".to_owned()]).is_err());
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
        tokio::fs::write(source.join("skip.bin"), b"not selected")
            .await
            .unwrap();
        let keep_file = downloads.join("source").join("keep.txt");
        tokio::fs::create_dir_all(keep_file.parent().unwrap())
            .await
            .unwrap();
        tokio::fs::write(&keep_file, b"not part of the torrent")
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
        assert_eq!(
            row.total_bytes,
            (b"verified local torrent".len() + b"not selected".len()) as u64
        );

        let details = api
            .api_torrent_details(TorrentIdOrHash::Id(row.id))
            .unwrap();
        let files = details.files.as_ref().unwrap();
        assert_eq!(files.len(), 2);
        let selected_file_id = files
            .iter()
            .position(|file| file.name.ends_with("payload.bin"))
            .unwrap();
        api.api_torrent_action_update_only_files(
            TorrentIdOrHash::Id(row.id),
            &HashSet::from([selected_file_id]),
        )
        .await
        .unwrap();
        let updated_files = api
            .api_torrent_details(TorrentIdOrHash::Id(row.id))
            .unwrap()
            .files
            .unwrap();
        assert!(updated_files[selected_file_id].included);
        assert!(
            updated_files
                .iter()
                .enumerate()
                .filter(|(index, _)| *index != selected_file_id)
                .all(|(_, file)| !file.included)
        );
        assert!(
            api.api_peer_stats(TorrentIdOrHash::Id(row.id), Default::default())
                .is_ok(),
            "peer diagnostics should work for a live torrent"
        );
        session
            .ratelimits
            .set_download_bps(Some(NonZeroU32::new(1_024).unwrap()));
        session
            .ratelimits
            .set_upload_bps(Some(NonZeroU32::new(2_048).unwrap()));
        let limits = session.ratelimits.get_config();
        assert_eq!(limits.download_bps.map(NonZeroU32::get), Some(1_024));
        assert_eq!(limits.upload_bps.map(NonZeroU32::get), Some(2_048));

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

        let details = api
            .api_torrent_details(TorrentIdOrHash::Id(row.id))
            .unwrap();
        let payload_file = details
            .files
            .as_ref()
            .and_then(|files| files.iter().find(|file| file.name.ends_with("payload.bin")))
            .expect("generated torrent should expose its payload file");
        let payload_path =
            torrent_file_path(Path::new(&details.output_folder), &payload_file.components).unwrap();
        tokio::fs::create_dir_all(payload_path.parent().unwrap())
            .await
            .unwrap();
        tokio::fs::write(&payload_path, b"torrent payload")
            .await
            .unwrap();

        remove_torrent_from_api(&api, row.id, true).await.unwrap();
        assert!(
            !payload_path.exists(),
            "deleting torrent data should remove its payload on Windows"
        );
        assert!(
            keep_file.exists(),
            "deleting torrent data must preserve unrelated files in its output folder"
        );

        let readded = api
            .api_add_torrent(
                AddTorrent::from_bytes(torrent.as_bytes().unwrap()),
                Some(AddTorrentOptions {
                    output_folder: Some(downloads.to_string_lossy().into_owned()),
                    ..AddTorrentOptions::default()
                }),
            )
            .await
            .unwrap();
        tokio::fs::write(&payload_path, b"preserved payload")
            .await
            .unwrap();
        remove_torrent_from_api(&api, readded.id.unwrap(), false)
            .await
            .unwrap();
        assert!(
            payload_path.exists(),
            "removing a torrent from the queue must preserve its payload"
        );
        assert_eq!(
            tokio::fs::read(&payload_path).await.unwrap(),
            b"preserved payload",
            "removing a torrent from the queue must not alter its payload"
        );
        assert!(
            api.api_torrent_list_ext(ApiTorrentListOpts { with_stats: true })
                .torrents
                .is_empty(),
            "deleted torrent should no longer appear in the session"
        );
        session.stop().await;
        tokio::fs::remove_dir_all(root).await.unwrap();
    }
}
