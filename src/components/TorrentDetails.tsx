import { useEffect, useState } from "react";
import {
  getTorrentFiles,
  getTorrentPeers,
  setTorrentFiles,
  type TorrentFile,
  type TorrentPeer,
} from "../services/torrentService";
import type { Torrent } from "../types/torrent";

type DetailsTab = "info" | "files" | "peers";

interface TorrentDetailsProps {
  torrent: Torrent;
  category: string;
  queuePosition: number;
  onCategoryChange: (category: string) => void;
  onMoveInQueue: (direction: -1 | 1) => void;
  notify: (message: string, kind?: "success" | "error") => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toLocaleString("ru-RU", {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  })} ${units[exponent]}`;
}

export function TorrentDetails({
  torrent,
  category,
  queuePosition,
  onCategoryChange,
  onMoveInQueue,
  notify,
}: TorrentDetailsProps) {
  const [tab, setTab] = useState<DetailsTab>("info");
  const [files, setFiles] = useState<TorrentFile[]>([]);
  const [peers, setPeers] = useState<TorrentPeer[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTab("info");
    setFiles([]);
    setPeers([]);
    void getTorrentFiles(torrent.id)
      .then(setFiles)
      .catch((error: unknown) =>
        notify(error instanceof Error ? error.message : String(error), "error"),
      );
  }, [notify, torrent.id]);

  async function refreshPeers() {
    if (torrent.status !== "downloading" && torrent.status !== "seeding") {
      setPeers([]);
      return;
    }
    setBusy(true);
    try {
      setPeers(await getTorrentPeers(torrent.id));
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveFileSelection() {
    const includedFileIds = files.filter((file) => file.included).map((file) => file.id);
    setBusy(true);
    try {
      await setTorrentFiles(torrent.id, includedFileIds);
      setFiles(await getTorrentFiles(torrent.id));
      notify("Список файлов торрента обновлён.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="torrent-details-content">
      <div aria-label="Раздел сведений" className="details-tabs" role="tablist">
        <button
          aria-selected={tab === "info"}
          onClick={() => setTab("info")}
          role="tab"
          type="button"
        >
          Обзор
        </button>
        <button
          aria-selected={tab === "files"}
          onClick={() => setTab("files")}
          role="tab"
          type="button"
        >
          Файлы ({files.length})
        </button>
        <button
          aria-selected={tab === "peers"}
          onClick={() => {
            setTab("peers");
            void refreshPeers();
          }}
          role="tab"
          type="button"
        >
          Пиры
        </button>
      </div>
      {tab === "info" && (
        <>
          <div className="details-data">
            <div className="detail-entry">
              <span>Статус</span>
              <strong>{torrent.status}</strong>
            </div>
            <div className="detail-entry">
              <span>Размер</span>
              <strong>{formatBytes(torrent.totalBytes)}</strong>
            </div>
            <div className="detail-entry detail-hash">
              <span>Info hash</span>
              <strong title={torrent.infoHash}>{torrent.infoHash}</strong>
            </div>
            <div className="detail-entry detail-folder">
              <span>Папка</span>
              <strong title={torrent.outputFolder}>{torrent.outputFolder}</strong>
            </div>
            {torrent.error && (
              <div className="detail-error">
                <span>{torrent.error}</span>
              </div>
            )}
          </div>
          <div className="details-extra">
            <label>
              Категория
              <input
                className="text-input"
                maxLength={32}
                onChange={(event) => onCategoryChange(event.currentTarget.value)}
                placeholder="Например: фильмы"
                value={category}
              />
            </label>
            <div className="queue-controls">
              <span>Место в очереди: {queuePosition}</span>
              <button
                aria-label="Поднять торрент в очереди"
                className="icon-button"
                disabled={queuePosition <= 1}
                onClick={() => onMoveInQueue(-1)}
                title="Выше в очереди"
                type="button"
              >
                ↑
              </button>
              <button
                aria-label="Опустить торрент в очереди"
                className="icon-button"
                disabled={torrent.finished}
                onClick={() => onMoveInQueue(1)}
                title="Ниже в очереди"
                type="button"
              >
                ↓
              </button>
            </div>
          </div>
        </>
      )}
      {tab === "files" && (
        <div className="details-file-list">
          {files.length === 0 ? (
            <span className="details-muted">Список появится после получения метаданных.</span>
          ) : (
            files.map((file) => (
              <label className="details-file-row" key={file.id}>
                <input
                  checked={file.included}
                  disabled={busy}
                  onChange={(event) => {
                    const included = event.currentTarget.checked;
                    setFiles((current) =>
                      current.map((item) =>
                        item.id === file.id
                          ? { ...item, included }
                          : item,
                      ),
                    );
                  }}
                  type="checkbox"
                />
                <span title={file.name}>{file.name}</span>
                <small>{formatBytes(file.length)}</small>
              </label>
            ))
          )}
          {files.length > 0 && (
            <button
              className="button button-outline details-save-files"
              disabled={busy || !files.some((file) => file.included)}
              onClick={() => void saveFileSelection()}
              type="button"
            >
              Применить выбор файлов
            </button>
          )}
        </div>
      )}
      {tab === "peers" && (
        <div className="details-peer-list">
          <div className="details-peer-toolbar">
            <span>{peers.length} подключённых пиров</span>
            <button
              className="refresh-link"
              disabled={busy}
              onClick={() => void refreshPeers()}
              type="button"
            >
              Обновить
            </button>
          </div>
          {peers.length === 0 ? (
            <span className="details-muted">
              {torrent.status === "downloading" || torrent.status === "seeding"
                ? "Нет активных пиров."
                : "Сведения о пирах доступны только для активного торрента."}
            </span>
          ) : (
            peers.map((peer) => (
              <div className="details-peer-row" key={peer.address}>
                <strong title={peer.address}>{peer.address}</strong>
                <span title={peer.clientName ?? peer.state}>
                  {peer.clientName ?? peer.state}
                </span>
                <small>
                  ↓ {formatBytes(peer.downloadedBytes)} · ↑ {formatBytes(peer.uploadedBytes)}
                </small>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
