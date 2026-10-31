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
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddMagnetDialog } from "./components/AddMagnetDialog";
import { SpeedChart } from "./components/SpeedChart";
import { Sidebar, type ViewFilter } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { TorrentTable } from "./components/TorrentTable";
import {
  addMagnet,
  addTorrentFile,
  chooseTorrentFile,
  defaultDownloadFolder,
  isDesktopRuntime,
  legacyDefaultDownloadFolder,
  listTorrents,
  openTorrentFolder,
  pauseTorrent,
  removeTorrent,
  resumeTorrent,
} from "./services/torrentService";
import { Settings } from "./pages/Settings";
import type { Torrent } from "./types/torrent";

const DEFAULT_DOWNLOAD_FOLDER = "";
const REFRESH_INTERVAL_MS = 1000;
const SIDEBAR_MIN_WIDTH = 184;
const SIDEBAR_MAX_WIDTH = 320;
const DEFAULT_SIDEBAR_WIDTH = 228;
const CHART_MIN_HEIGHT = 72;
const CHART_MAX_HEIGHT = 220;
const DEFAULT_CHART_HEIGHT = 110;

type ResizeAxis = "column" | "row";

interface ActiveResize {
  axis: ResizeAxis;
  pointerId: number;
  startPosition: number;
  startSize: number;
  currentSize: number;
}

function readSizePreference(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = Number(localStorage.getItem(key));
    return Number.isFinite(stored) && stored >= min && stored <= max
      ? stored
      : fallback;
  } catch {
    return fallback;
  }
}

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
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readSizePreference("orbit.sidebarWidth", DEFAULT_SIDEBAR_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH),
  );
  const [chartHeight, setChartHeight] = useState(() =>
    readSizePreference("orbit.chartHeight", DEFAULT_CHART_HEIGHT, CHART_MIN_HEIGHT, CHART_MAX_HEIGHT),
  );
  const [resizeAxis, setResizeAxis] = useState<ResizeAxis | null>(null);
  const activeResize = useRef<ActiveResize | null>(null);

  function persistSize(key: string, value: number) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Resizing still works for this run when browser storage is unavailable.
    }
  }

  function beginResize(axis: ResizeAxis, event: ReactPointerEvent<HTMLDivElement>, size: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeResize.current = {
      axis,
      pointerId: event.pointerId,
      startPosition: axis === "column" ? event.clientX : event.clientY,
      startSize: size,
      currentSize: size,
    };
    setResizeAxis(axis);
  }

  function moveResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = activeResize.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const position = resize.axis === "column" ? event.clientX : event.clientY;
    const delta = resize.axis === "column"
      ? position - resize.startPosition
      : resize.startPosition - position;

    if (resize.axis === "column") {
      resize.currentSize = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, resize.startSize + delta),
      );
      setSidebarWidth(resize.currentSize);
    } else {
      resize.currentSize = Math.min(
        CHART_MAX_HEIGHT,
        Math.max(CHART_MIN_HEIGHT, resize.startSize + delta),
      );
      setChartHeight(resize.currentSize);
    }
  }

  function finishResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = activeResize.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    persistSize(
      resize.axis === "column" ? "orbit.sidebarWidth" : "orbit.chartHeight",
      resize.currentSize,
    );
    activeResize.current = null;
    setResizeAxis(null);
  }

  function resizeByKeyboard(axis: ResizeAxis, event: ReactKeyboardEvent<HTMLDivElement>) {
    const current = axis === "column" ? sidebarWidth : chartHeight;
    const min = axis === "column" ? SIDEBAR_MIN_WIDTH : CHART_MIN_HEIGHT;
    const max = axis === "column" ? SIDEBAR_MAX_WIDTH : CHART_MAX_HEIGHT;
    const increaseKey = axis === "column" ? "ArrowRight" : "ArrowUp";
    const decreaseKey = axis === "column" ? "ArrowLeft" : "ArrowDown";
    let next: number;
    if (event.key === increaseKey) next = Math.min(max, current + 12);
    else if (event.key === decreaseKey) next = Math.max(min, current - 12);
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    else return;

    event.preventDefault();
    if (axis === "column") setSidebarWidth(next);
    else setChartHeight(next);
    persistSize(axis === "column" ? "orbit.sidebarWidth" : "orbit.chartHeight", next);
  }

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
    if (!runtimeAvailable) return;
    let cancelled = false;
    const savedFolder = readDownloadFolder();
    const normalizeFolder = (folder: string) =>
      folder.replace(/[\\/]+$/, "").toLowerCase();
    void Promise.all([defaultDownloadFolder(), legacyDefaultDownloadFolder()])
      .then(([defaultFolder, legacyFolder]) => {
        if (cancelled) return;
        if (
          !savedFolder ||
          normalizeFolder(savedFolder) === normalizeFolder(legacyFolder)
        ) {
          setDownloadFolder(defaultFolder);
        } else {
          setDownloadFolder(savedFolder);
        }
      })
      .catch((error: unknown) =>
        notify(error instanceof Error ? error.message : String(error), "error"),
      );
    return () => {
      cancelled = true;
    };
  }, [notify, runtimeAvailable]);

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
      if (filter === "incomplete" && (torrent.finished || torrent.status === "error")) return false;
      if (filter === "completed" && !torrent.finished) return false;
      if (filter === "paused" && torrent.status !== "paused") return false;
      if (filter === "seeding" && torrent.status !== "seeding") return false;
      if (filter === "errors" && torrent.status !== "error" && !torrent.error) return false;
      return !query || torrent.name.toLocaleLowerCase().includes(query) || torrent.infoHash.includes(query);
    });
  }, [filter, search, torrents]);

  const completedCount = useMemo(
    () => torrents.filter((torrent) => torrent.finished).length,
    [torrents],
  );
  const allVisibleSelected =
    visibleTorrents.length > 0 &&
    visibleTorrents.every((torrent) => selectedIds.has(torrent.id));

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
    const errors: string[] = [];
    try {
      for (const torrent of selected) {
        try {
          await removeTorrent(torrent.id, removeFiles);
        } catch (error) {
          errors.push(
            `${torrent.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      setSelectedIds(new Set());
      setSelectedTorrent(null);
      await refresh();
      if (errors.length > 0) {
        notify(`Не все торренты удалось удалить:\n${errors.join("\n")}`, "error");
      } else {
        notify(
          removeFiles
            ? "Торренты и их файлы удалены."
            : "Торренты удалены, файлы сохранены.",
        );
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleTorrents.forEach((torrent) => next.delete(torrent.id));
      } else {
        visibleTorrents.forEach((torrent) => next.add(torrent.id));
      }
      return next;
    });
  }

  async function clearCompleted() {
    const completed = torrents.filter((torrent) => torrent.finished);
    if (completed.length === 0) return;
    if (
      !window.confirm(
        `Убрать ${completed.length} завершённых торрентов из библиотеки? Скачанные файлы останутся на диске.`,
      )
    ) {
      return;
    }

    setBusy(true);
    const errors: string[] = [];
    try {
      for (const torrent of completed) {
        try {
          await removeTorrent(torrent.id, false);
        } catch (error) {
          errors.push(
            `${torrent.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      await refresh();
      if (errors.length > 0) {
        notify(
          `Не все завершённые торренты удалось убрать:\n${errors.join("\n")}`,
          "error",
        );
      } else {
        notify("Завершённые торренты убраны из библиотеки, файлы сохранены.");
      }
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

  async function toggleTorrent(torrent: Torrent) {
    setBusy(true);
    try {
      await (torrent.status === "paused"
        ? resumeTorrent(torrent.id)
        : pauseTorrent(torrent.id));
      await refresh();
      notify(torrent.status === "paused" ? "Загрузка возобновлена." : "Загрузка приостановлена.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function openFolder(torrent: Torrent) {
    try {
      await openTorrentFolder(torrent.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function removeTorrentFromMenu(torrent: Torrent) {
    const removeFiles = window.confirm(
      `Удалить файлы торрента «${torrent.name}» вместе с записью в очереди?\n\nНажмите «ОК», чтобы удалить файлы, или «Отмена», чтобы сохранить их.`,
    );
    if (!window.confirm(`Удалить «${torrent.name}» из очереди${removeFiles ? " и удалить файлы" : ", сохранив файлы"}?`)) {
      return;
    }
    setBusy(true);
    try {
      await removeTorrent(torrent.id, removeFiles);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(torrent.id);
        return next;
      });
      setSelectedTorrent((current) => current?.id === torrent.id ? null : current);
      await refresh();
      notify(removeFiles ? "Торрент и его файлы удалены." : "Торрент удалён, файлы сохранены.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await refresh();
      } catch (refreshError) {
        notify(
          `${message}\nНе удалось обновить очередь: ${
            refreshError instanceof Error ? refreshError.message : String(refreshError)
          }`,
          "error",
        );
        return;
      }
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  const selectedDetailsTorrent =
    torrents.find((torrent) => torrent.id === selectedTorrent?.id) ?? null;

  return (
    <div
      className={`app-shell ${resizeAxis ? `resizing-${resizeAxis}` : ""}`}
      style={{
        "--sidebar-width": `${sidebarWidth}px`,
        "--chart-height": `${chartHeight}px`,
      } as CSSProperties}
    >
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
      <div
        aria-label="Ширина боковой панели"
        aria-orientation="vertical"
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuenow={sidebarWidth}
        className="resize-handle column-resizer"
        onKeyDown={(event) => resizeByKeyboard("column", event)}
        onLostPointerCapture={() => {
          activeResize.current = null;
          setResizeAxis(null);
        }}
        onPointerCancel={finishResize}
        onPointerDown={(event) => beginResize("column", event, sidebarWidth)}
        onPointerMove={moveResize}
        onPointerUp={finishResize}
        role="separator"
        tabIndex={0}
        title="Потяните, чтобы изменить ширину боковой панели"
      />
      <main className="main-panel">
        <div className="main-content">
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
            <div className="content-heading">
              <div className="table-caption">
                <span>ОЧЕРЕДЬ</span>
                <span className="caption-dot" />
                <span>{visibleTorrents.length} торрентов</span>
              </div>
              <div className="content-actions">
                {selectedIds.size > 0 && (
                  <span className="selection-count">{selectedIds.size} выбрано</span>
                )}
                <button
                  className="refresh-link"
                  disabled={visibleTorrents.length === 0}
                  onClick={toggleVisibleSelection}
                  type="button"
                >
                  {allVisibleSelected ? "Снять выделение" : "Выбрать видимые"}
                </button>
                <button
                  className="refresh-link"
                  disabled={completedCount === 0 || busy || !runtimeAvailable}
                  onClick={() => void clearCompleted()}
                  type="button"
                >
                  Очистить готовые{completedCount > 0 ? ` · ${completedCount}` : ""}
                </button>
                <button
                  className="refresh-link"
                  onClick={() => void refresh()}
                  type="button"
                >
                  <RefreshCw size={13} />
                  Обновить
                </button>
              </div>
            </div>
            <section className="table-card">
              {visibleTorrents.length > 0 ? (
                <TorrentTable
                  onSelect={selectTorrent}
                  onSelectionChange={setSelectedIds}
                  onToggleTorrent={(torrent) => void toggleTorrent(torrent)}
                  onOpenFolder={(torrent) => void openFolder(torrent)}
                  onRemoveTorrent={(torrent) => void removeTorrentFromMenu(torrent)}
                  actionsDisabled={!runtimeAvailable || busy}
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
            </>
          )}
        </div>
        {!settingsOpen && (
          <div className="bottom-dock">
            <div
              aria-label="Высота панели графика"
              aria-orientation="horizontal"
              aria-valuemax={CHART_MAX_HEIGHT}
              aria-valuemin={CHART_MIN_HEIGHT}
              aria-valuenow={chartHeight}
              className="resize-handle chart-resizer"
              onKeyDown={(event) => resizeByKeyboard("row", event)}
              onLostPointerCapture={() => {
                activeResize.current = null;
                setResizeAxis(null);
              }}
              onPointerCancel={finishResize}
              onPointerDown={(event) => beginResize("row", event, chartHeight)}
              onPointerMove={moveResize}
              onPointerUp={finishResize}
              role="separator"
              tabIndex={0}
              title="Потяните, чтобы изменить высоту панели графика"
            />
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
                <SpeedChart
                  downloadSpeed={totals.download}
                  enabled={runtimeAvailable && !engineError}
                  uploadSpeed={totals.upload}
                />
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
          </div>
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
