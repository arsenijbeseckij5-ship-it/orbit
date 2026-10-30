export type TorrentStatus =
  | "metadata"
  | "downloading"
  | "seeding"
  | "paused"
  | "error";

export interface Torrent {
  id: number;
  infoHash: string;
  name: string;
  outputFolder: string;
  status: TorrentStatus;
  progressBytes: number;
  totalBytes: number;
  uploadedBytes: number;
  downloadSpeed: number;
  uploadSpeed: number;
  eta: string | null;
  finished: boolean;
  error: string | null;
}
