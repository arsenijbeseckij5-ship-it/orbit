import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Torrent } from "../types/torrent";

export interface TorrentFile {
  id: number;
  name: string;
  length: number;
  included: boolean;
}

export interface TorrentPeer {
  address: string;
  state: string;
  clientName: string | null;
  connectionKind: string | null;
  downloadedBytes: number;
  uploadedBytes: number;
  errors: number;
}

export interface RateLimits {
  downloadBps: number | null;
  uploadBps: number | null;
}

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

export function getTorrentFiles(id: number): Promise<TorrentFile[]> {
  return invoke("torrent_files", { id });
}

export function setTorrentFiles(id: number, includedFileIds: number[]): Promise<void> {
  return invoke("set_torrent_files", { id, includedFileIds });
}

export function getTorrentPeers(id: number): Promise<TorrentPeer[]> {
  return invoke("torrent_peers", { id });
}

export function getRateLimits(): Promise<RateLimits> {
  return invoke("get_rate_limits");
}

export function setRateLimits(limits: RateLimits): Promise<void> {
  return invoke("set_rate_limits", {
    downloadBps: limits.downloadBps,
    uploadBps: limits.uploadBps,
  });
}

export function setCloseToTray(enabled: boolean): Promise<void> {
  return invoke("set_close_to_tray", { enabled });
}
