import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileArchive,
  FileVideo2,
  Pause,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Torrent } from "../types/torrent";

export type SortColumn = "name" | "status" | "progress" | "speed" | "eta";

interface TorrentTableProps {
  torrents: Torrent[];
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  onSelect: (torrent: Torrent) => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toLocaleString("ru-RU", {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  })} ${units[exponent]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/с`;
}

function statusLabel(status: Torrent["status"]): string {
  switch (status) {
    case "metadata":
      return "Метаданные";
    case "downloading":
      return "Загрузка";
    case "seeding":
      return "Раздача";
    case "paused":
      return "Пауза";
    case "error":
      return "Ошибка";
  }
}

function progressPercent(torrent: Torrent): number {
  if (torrent.totalBytes <= 0) return 0;
  return Math.min(100, (torrent.progressBytes / torrent.totalBytes) * 100);
}

function FileIcon({ name }: { name: string }) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (["mp4", "mkv", "avi", "mov", "webm"].includes(extension ?? "")) {
    return <FileVideo2 size={19} />;
  }
  return <FileArchive size={19} />;
}

export function TorrentTable({
  torrents,
  selectedIds,
  onSelectionChange,
  onSelect,
}: TorrentTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortAscending, setSortAscending] = useState(true);

  const sortedTorrents = useMemo(() => {
    const sorted = [...torrents].sort((a, b) => {
      switch (sortColumn) {
        case "name":
          return a.name.localeCompare(b.name);
        case "status":
          return a.status.localeCompare(b.status);
        case "progress":
          return progressPercent(a) - progressPercent(b);
        case "speed":
          return a.downloadSpeed - b.downloadSpeed;
        case "eta":
          return (a.eta ?? "zzzz").localeCompare(b.eta ?? "zzzz");
      }
    });
    return sortAscending ? sorted : sorted.reverse();
  }, [sortAscending, sortColumn, torrents]);

  function sortBy(column: SortColumn) {
    if (sortColumn === column) {
      setSortAscending((ascending) => !ascending);
    } else {
      setSortColumn(column);
      setSortAscending(column === "name");
    }
  }

  function toggleRow(torrent: Torrent, additive: boolean) {
    const next = additive ? new Set(selectedIds) : new Set<number>();
    if (additive && next.has(torrent.id)) next.delete(torrent.id);
    else next.add(torrent.id);
    onSelectionChange(next);
    onSelect(torrent);
  }

  function toggleAll() {
    if (selectedIds.size === torrents.length) onSelectionChange(new Set());
    else onSelectionChange(new Set(torrents.map((torrent) => torrent.id)));
  }

  const heading = (label: string, column: SortColumn) => (
    <button className="table-heading-button" onClick={() => sortBy(column)} type="button">
      {label}
      {sortColumn === column && (
        <span className="sort-indicator">{sortAscending ? "↑" : "↓"}</span>
      )}
    </button>
  );

  return (
    <div className="torrent-table-wrap">
      <table className="torrent-table">
        <thead>
          <tr>
            <th className="checkbox-column">
              <input
                aria-label="Выбрать все загрузки"
                checked={torrents.length > 0 && selectedIds.size === torrents.length}
                onChange={toggleAll}
                type="checkbox"
              />
            </th>
            <th>{heading("Название", "name")}</th>
            <th>{heading("Статус", "status")}</th>
            <th>{heading("Прогресс", "progress")}</th>
            <th>{heading("Скорость", "speed")}</th>
            <th>{heading("Осталось", "eta")}</th>
            <th className="row-actions-column" />
          </tr>
        </thead>
        <tbody>
          {sortedTorrents.map((torrent) => {
            const percent = progressPercent(torrent);
            return (
              <tr
                aria-selected={selectedIds.has(torrent.id)}
                className={`torrent-row ${selectedIds.has(torrent.id) ? "selected" : ""}`}
                key={torrent.id}
                onClick={(event) => toggleRow(torrent, event.metaKey || event.ctrlKey)}
              >
                <td className="checkbox-column">
                  <input
                    aria-label={`Выбрать ${torrent.name}`}
                    checked={selectedIds.has(torrent.id)}
                    onChange={(event) => toggleRow(torrent, event.nativeEvent instanceof MouseEvent && (event.nativeEvent.metaKey || event.nativeEvent.ctrlKey))}
                    onClick={(event) => event.stopPropagation()}
                    type="checkbox"
                  />
                </td>
                <td className="torrent-name-cell">
                  <span className={`torrent-file-icon ${torrent.status}`}>
                    <FileIcon name={torrent.name} />
                  </span>
                  <span className="torrent-title-stack">
                    <span className="torrent-name" title={torrent.name}>
                      {torrent.name}
                    </span>
                    <span className="torrent-subtitle">
                      {formatBytes(torrent.totalBytes)} · {torrent.infoHash.slice(0, 8)}
                    </span>
                  </span>
                </td>
                <td>
                  <span className={`status-pill ${torrent.status}`}>
                    {torrent.status === "paused" ? (
                      <Pause size={11} />
                    ) : torrent.status === "error" ? (
                      <CircleAlert size={12} />
                    ) : torrent.finished ? (
                      <CheckCircle2 size={12} />
                    ) : null}
                    {statusLabel(torrent.status)}
                  </span>
                </td>
                <td>
                  <div className="progress-cell">
                    <div className="progress-copy">
                      <span>{percent.toFixed(1)}%</span>
                      <span>{formatBytes(torrent.progressBytes)}</span>
                    </div>
                    <div className="progress-track">
                      <span
                        className={`progress-fill ${torrent.finished ? "complete" : ""}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td>
                  <span className="speed-value">
                    <span className="download-arrow">↓</span>
                    {formatSpeed(torrent.downloadSpeed)}
                  </span>
                  {torrent.uploadSpeed > 0 && (
                    <span className="upload-speed">
                      ↑ {formatSpeed(torrent.uploadSpeed)}
                    </span>
                  )}
                </td>
                <td className="eta-cell">
                  {torrent.error ? (
                    <span className="error-text" title={torrent.error}>
                      Ошибка
                    </span>
                  ) : torrent.finished ? (
                    <span className="muted-value">—</span>
                  ) : torrent.status === "paused" ? (
                    <span className="muted-value">Приостановлено</span>
                  ) : (
                    <span className="muted-value">{torrent.eta ?? "—"}</span>
                  )}
                </td>
                <td className="row-actions-column">
                  <button
                    aria-label={`Показать детали ${torrent.name}`}
                    className="row-detail-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(torrent);
                    }}
                    title="Подробности"
                    type="button"
                  >
                    <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
