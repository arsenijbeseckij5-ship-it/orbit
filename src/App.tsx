import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  Info,
  Link2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AddMagnetDialog } from "./components/AddMagnetDialog";
import { Sidebar, type ViewFilter } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { TorrentTable } from "./components/TorrentTable";
import {
  addMagnet,
  addTorrentFile,
  chooseTorrentFile,
  defaultDownloadFolder,
  isDesktopRuntime,
  listTorrents,
  pauseTorrent,
  removeTorrent,
  resumeTorrent,
} from "./services/torrentService";
import { Settings } from "./pages/Settings";
import type { Torrent } from "./types/torrent";

const DEFAULT_DOWNLOAD_FOLDER = "";
const REFRESH_INTERVAL_MS = 1000;

function readDownloadFolder(): string {
  try {
    return localStorage.getItem("orbit.downloadFolder") ?? DEFAULT_DOWNLOAD_FOLDER;
  } catch {
    return DEFAULT_DOWNLOAD_FOLDER;
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toLocaleString("ru-RU", {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  })} ${units[exponent]}`;
}

interface Notice {
  message: string;
  kind: "success" | "error";
}

export default function App() {
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedTorrent, setSelectedTorrent] = useState<Torrent | null>(null);
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [search, setSearch] = useState("");
  const [magnetOpen, setMagnetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadFolder, setDownloadFolder] = useState(readDownloadFolder);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [runtimeAvailable] = useState(isDesktopRuntime);
  const [engineError, setEngineError] = useState<string | null>(null);

  const notify = useCallback((message: string, kind: Notice["kind"] = "success") => {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

  const refresh = useCallback(async () => {
    const latest = await listTorrents();
    setTorrents(latest);
    setSelectedIds((current) => {
      const existing = new Set(latest.map((torrent) => torrent.id));
      return new Set([...current].filter((id) => existing.has(id)));
    });
    setSelectedTorrent((current) =>
      current ? latest.find((torrent) => torrent.id === current.id) ?? null : null,
    );
    setEngineError(null);
  }, []);

  useEffect(() => {
    if (!runtimeAvailable) return;
    let cancelled = false;
    let firstLoad = true;

    const update = async () => {
      try {
        const latest = await listTorrents();
        if (cancelled) return;
        setTorrents(latest);
        setSelectedIds((current) => {
          const existing = new Set(latest.map((torrent) => torrent.id));
          return new Set([...current].filter((id) => existing.has(id)));
        });
        setSelectedTorrent((current) =>
          current ? latest.find((torrent) => torrent.id === current.id) ?? null : null,
        );
        setEngineError(null);
      } catch (error) {
        if (cancelled) return;
        setEngineError(error instanceof Error ? error.message : String(error));
      } finally {
        firstLoad = false;
      }
    };

    void update();
    const interval = window.setInterval(() => {
      if (!firstLoad) void update();
    }, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runtimeAvailable]);

  useEffect(() => {
    if (!runtimeAvailable || downloadFolder) return;
    void defaultDownloadFolder()
      .then(setDownloadFolder)
      .catch((error: unknown) =>
        notify(error instanceof Error ? error.message : String(error), "error"),
      );
  }, [downloadFolder, notify, runtimeAvailable]);

  useEffect(() => {
    if (!runtimeAvailable) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      getCurrentWindow()
        .onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          const files = event.payload.paths.filter((path) =>
            path.toLowerCase().endsWith(".torrent"),
          );
          if (files.length === 0) return;
          void Promise.all(files.map((path) => addTorrentFile(path, downloadFolder)))
            .then(() => {
              notify(`${files.length} торрент(ов) добавлено.`, "success");
              return refresh();
            })
            .catch((error: unknown) =>
              notify(error instanceof Error ? error.message : String(error), "error"),
            );
        })
        .then((stop) => {
          if (cancelled) stop();
          else unlisten = stop;
        }),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [downloadFolder, notify, refresh, runtimeAvailable]);

  const visibleTorrents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return torrents.filter((torrent) => {
      if (filter === "active" && torrent.status !== "downloading") return false;
      if (filter === "completed" && !torrent.finished) return false;
      if (filter === "paused" && torrent.status !== "paused") return false;
      if (filter === "seeding" && torrent.status !== "seeding") return false;
      return !query || torrent.name.toLocaleLowerCase().includes(query) || torrent.infoHash.includes(query);
    });
  }, [filter, search, torrents]);

  const totals = useMemo(
    () =>
      torrents.reduce(
        (sum, torrent) => ({
          download: sum.download + torrent.downloadSpeed,
          upload: sum.upload + torrent.uploadSpeed,
          active: sum.active + Number(
            torrent.status === "downloading" || torrent.status === "seeding",
          ),
        }),
        { download: 0, upload: 0, active: 0 },
      ),
    [torrents],
  );

  async function performAction(
    action: (id: number) => Promise<void>,
    successMessage: string,
  ) {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      await Promise.all([...selectedIds].map(action));
      await refresh();
      notify(successMessage);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function addFromMagnet(uri: string) {
    setBusy(true);
    try {
      await addMagnet(uri, downloadFolder);
      setMagnetOpen(false);
      await refresh();
      notify("Торрент добавлен в очередь.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function addFromFile() {
    try {
      const path = await chooseTorrentFile();
      if (!path) return;
      setBusy(true);
      await addTorrentFile(path, downloadFolder);
      await refresh();
      notify("Торрент добавлен в очередь.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    const selected = torrents.filter((torrent) => selectedIds.has(torrent.id));
    if (selected.length === 0) return;
    const removeFiles = window.confirm(
      "Удалить скачанные файлы вместе с выбранными торрентами?\n\nНажмите «ОК», чтобы удалить файлы, или «Отмена», чтобы оставить их.",
    );
    if (
      !window.confirm(
        `Удалить ${selected.length} выбранных торрент(ов)${removeFiles ? " и их файлы" : ""}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await Promise.all(
        selected.map((torrent) => removeTorrent(torrent.id, removeFiles)),
      );
      setSelectedIds(new Set());
      setSelectedTorrent(null);
      await refresh();
      notify(
        removeFiles
          ? "Торренты и их файлы удалены."
          : "Торренты удалены, файлы сохранены.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  function saveDownloadFolder(folder: string) {
    setDownloadFolder(folder);
    try {
      localStorage.setItem("orbit.downloadFolder", folder);
    } catch (error) {
      notify(
        `Не удалось сохранить настройки в браузере: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
    }
  }

  function selectTorrent(torrent: Torrent) {
    setSelectedTorrent(torrent);
  }

  const selectedDetailsTorrent =
    torrents.find((torrent) => torrent.id === selectedTorrent?.id) ?? null;

  return (
    <div className="app-shell">
      <Sidebar
        filter={filter}
        onFilterChange={(next) => {
          setFilter(next);
          setSettingsOpen(false);
        }}
        onSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
        torrents={torrents}
      />
      <main className="main-panel">
        {settingsOpen ? (
          <Settings
            initialDownloadFolder={downloadFolder}
            notify={notify}
            onBack={() => setSettingsOpen(false)}
            onSaveFolder={saveDownloadFolder}
          />
        ) : (
          <>
            <header className="page-header">
              <div>
                <div className="eyebrow">ВАША БИБЛИОТЕКА</div>
                <h1>Загрузки</h1>
              </div>
              <div className="header-summary">
                <span className="online-indicator" />
                <span>{runtimeAvailable ? "Движок готов" : "Режим предпросмотра"}</span>
              </div>
            </header>
            <Toolbar
              actionsDisabled={!runtimeAvailable || busy}
              onAddFile={addFromFile}
              onAddMagnet={() => setMagnetOpen(true)}
              onPause={() =>
                void performAction(pauseTorrent, "Загрузки приостановлены.")
              }
              onRemove={() => void removeSelected()}
              onResume={() =>
                void performAction(resumeTorrent, "Загрузки возобновлены.")
              }
              onSearch={setSearch}
              search={search}
              selectedCount={selectedIds.size}
            />
            {engineError && (
              <div className="engine-error">
                <CircleAlert size={16} />
                <span>{engineError}</span>
                <button className="icon-button" onClick={() => void refresh()} type="button">
                  <RefreshCw size={14} />
                </button>
              </div>
            )}
            {selectedDetailsTorrent ? (
              <div className="content-heading">
                <div className="table-caption">
                  <span>ОЧЕРЕДЬ</span>
                  <span className="caption-dot" />
                  <span>{visibleTorrents.length} торрентов</span>
                </div>
                <span className="details-hint">Нажмите на строку, чтобы выбрать</span>
              </div>
            ) : (
              <div className="content-heading">
                <div className="table-caption">
                  <span>ОЧЕРЕДЬ</span>
                  <span className="caption-dot" />
                  <span>{visibleTorrents.length} торрентов</span>
                </div>
                <button
                  className="refresh-link"
                  onClick={() => void refresh()}
                  type="button"
                >
                  <RefreshCw size={13} />
                  Обновить
                </button>
              </div>
            )}
            <section className="table-card">
              {visibleTorrents.length > 0 ? (
                <TorrentTable
                  onSelect={selectTorrent}
                  onSelectionChange={setSelectedIds}
                  selectedIds={selectedIds}
                  torrents={visibleTorrents}
                />
              ) : (
                <div className="empty-state">
                  <div className="empty-orbit">
                    <div className="empty-orbit-center"><Download size={23} /></div>
                  </div>
                  <h2>{search ? "Ничего не найдено" : "Здесь пока пусто"}</h2>
                  <p>
                    {search
                      ? "Измените поисковый запрос."
                      : runtimeAvailable
                        ? "Добавьте Magnet-ссылку или откройте файл .torrent."
                        : "Запустите ORBIT в окне приложения Tauri, чтобы управлять загрузками."}
                  </p>
                  {!search && (
                    <div className="empty-actions">
                      <button
                        className="button button-primary"
                        disabled={!runtimeAvailable || busy}
                        onClick={() => setMagnetOpen(true)}
                        type="button"
                      >
                        <Link2 size={15} />
                        Добавить Magnet
                      </button>
                      <button
                        className="button button-quiet"
                        disabled={!runtimeAvailable || busy}
                        onClick={() => void addFromFile()}
                        type="button"
                      >
                        <FileText size={15} />
                        Открыть .torrent
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
            <div className="details-panel">
              <div className="details-panel-header">
                <div className="details-title">
                  <Info size={15} />
                  <span>{selectedDetailsTorrent ? "СВЕДЕНИЯ О ТОРРЕНТЕ" : "СВЕДЕНИЯ"}</span>
                </div>
                {selectedDetailsTorrent && (
                  <div className="details-panel-actions">
                    <button
                      className="icon-button"
                      disabled={busy}
                      onClick={() =>
                        void (selectedDetailsTorrent.status === "paused"
                          ? resumeTorrent(selectedDetailsTorrent.id)
                          : pauseTorrent(selectedDetailsTorrent.id)
                        )
                          .then(refresh)
                          .catch((error: unknown) =>
                            notify(error instanceof Error ? error.message : String(error), "error"),
                          )
                      }
                      title={selectedDetailsTorrent.status === "paused" ? "Продолжить" : "Пауза"}
                      type="button"
                    >
                      {selectedDetailsTorrent.status === "paused" ? <Play size={15} /> : <Pause size={15} />}
                    </button>
                    <button
                      className="icon-button icon-button-danger"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm("Удалить торрент из ORBIT? Скачанные файлы останутся на диске.")) return;
                        void removeTorrent(selectedDetailsTorrent.id, false)
                          .then(() => {
                            setSelectedTorrent(null);
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              next.delete(selectedDetailsTorrent.id);
                              return next;
                            });
                            return refresh();
                          })
                          .catch((error: unknown) =>
                            notify(error instanceof Error ? error.message : String(error), "error"),
                          );
                      }}
                      title="Удалить из очереди, сохранив файлы"
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      aria-label="Закрыть сведения"
                      className="icon-button details-close"
                      onClick={() => setSelectedTorrent(null)}
                      type="button"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
              </div>
              {selectedDetailsTorrent ? (
                <div className="details-data">
                  <div className="detail-entry">
                    <span>Статус</span>
                    <strong>{selectedDetailsTorrent.status}</strong>
                  </div>
                  <div className="detail-entry">
                    <span>Размер</span>
                    <strong>{formatBytes(selectedDetailsTorrent.totalBytes)}</strong>
                  </div>
                  <div className="detail-entry detail-hash">
                    <span>Info hash</span>
                    <strong title={selectedDetailsTorrent.infoHash}>
                      {selectedDetailsTorrent.infoHash}
                    </strong>
                  </div>
                  <div className="detail-entry detail-folder">
                    <span>Папка</span>
                    <strong title={selectedDetailsTorrent.outputFolder}>
                      {selectedDetailsTorrent.outputFolder}
                    </strong>
                  </div>
                  {selectedDetailsTorrent.error && (
                    <div className="detail-error">
                      <CircleAlert size={14} />
                      {selectedDetailsTorrent.error}
                    </div>
                  )}
                </div>
              ) : (
                <div className="details-placeholder">
                  Выберите торрент, чтобы посмотреть его статус и путь сохранения.
                </div>
              )}
            </div>
            <footer className="status-bar">
              <div className="status-metric">
                <ArrowDownToLine size={14} />
                <span>↓ {formatBytes(totals.download)}/с</span>
              </div>
              <div className="status-metric">
                <ArrowUpFromLine size={14} />
                <span>↑ {formatBytes(totals.upload)}/с</span>
              </div>
              <span className="status-separator" />
              <div className="status-metric">
                <ActivityIcon />
                <span>{totals.active} активных</span>
              </div>
              <div className="status-bar-spacer" />
              <div className="status-engine">
                <span className={`status-engine-dot ${engineError ? "error" : ""}`} />
                <span>
                  {engineError
                    ? "Ошибка движка"
                    : runtimeAvailable
                      ? "librqbit"
                      : "Браузерный просмотр"}
                </span>
              </div>
            </footer>
          </>
        )}
      </main>
      <AddMagnetDialog
        busy={busy}
        onClose={() => setMagnetOpen(false)}
        onSubmit={addFromMagnet}
        open={magnetOpen}
      />
      {notice && (
        <div className={`toast ${notice.kind}`}>
          {notice.kind === "error" ? <CircleAlert size={16} /> : <Check size={16} />}
          <span>{notice.message}</span>
          <button
            aria-label="Закрыть уведомление"
            className="toast-close"
            onClick={() => setNotice(null)}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityIcon() {
  return <Clock3 size={14} />;
}
