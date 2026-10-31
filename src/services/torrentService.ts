import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Torrent } from "../types/torrent";

export function isDesktopRuntime(): boolean {
  return isTauri();
}

export function listTorrents(): Promise<Torrent[]> {
  return invoke<Torrent[]>("list_torrents");
}

export function defaultDownloadFolder(): Promise<string> {
  return invoke<string>("default_download_folder");
}

export function legacyDefaultDownloadFolder(): Promise<string> {
  return invoke<string>("legacy_default_download_folder");
}

export function addMagnet(uri: string, outputFolder: string): Promise<void> {
  return invoke("add_magnet", { uri, outputFolder });
}

export function addTorrentFile(
  path: string,
  outputFolder: string,
): Promise<void> {
  return invoke("add_torrent_file", { path, outputFolder });
}

export async function chooseTorrentFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "BitTorrent", extensions: ["torrent"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function chooseDownloadFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

export function pauseTorrent(id: number): Promise<void> {
  return invoke("pause_torrent", { id });
}

export function resumeTorrent(id: number): Promise<void> {
  return invoke("resume_torrent", { id });
}

export function removeTorrent(
  id: number,
  removeFiles: boolean,
): Promise<void> {
  return invoke(removeFiles ? "remove_torrent_and_files" : "remove_torrent", {
    id,
  });
}

export function openTorrentFolder(id: number): Promise<void> {
  return invoke("open_torrent_folder", { id });
}

export function openDownloadFolder(folder: string): Promise<void> {
  return invoke("open_download_folder", { folder });
}
