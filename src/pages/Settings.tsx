import {
  ArrowLeft,
  Clipboard,
  FolderOpen,
  HardDriveDownload,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import type { RateLimits } from "../services/torrentService";
import {
  chooseDownloadFolder,
  defaultDownloadFolder,
  openDownloadFolder,
} from "../services/torrentService";

interface SettingsProps {
  initialDownloadFolder: string;
  initialRateLimits: RateLimits;
  initialMaxActiveDownloads: number;
  initialCloseToTray: boolean;
  initialNotifications: boolean;
  onBack: () => void;
  onSavePreferences: (
    folder: string,
    rateLimits: RateLimits,
    maxActiveDownloads: number,
    closeToTray: boolean,
    notifications: boolean,
  ) => Promise<void>;
  notify: (message: string, kind?: "success" | "error") => void;
}

function formatLimit(bps: number | null): string {
  return bps ? (bps / (1024 * 1024)).toFixed(2) : "";
}

function parseLimit(value: string): number | null {
  const parsed = Number(value);
  if (!value.trim() || parsed === 0) return null;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Лимит скорости должен быть положительным числом.");
  }
  const bytesPerSecond = Math.round(parsed * 1024 * 1024);
  if (bytesPerSecond > 4_294_967_295) {
    throw new Error("Указанный лимит слишком велик.");
  }
  return bytesPerSecond;
}

export function Settings({
  initialDownloadFolder,
  initialRateLimits,
  initialMaxActiveDownloads,
  initialCloseToTray,
  initialNotifications,
  onBack,
  onSavePreferences,
  notify,
}: SettingsProps) {
  const [folder, setFolder] = useState(initialDownloadFolder);
  const [downloadLimit, setDownloadLimit] = useState(formatLimit(initialRateLimits.downloadBps));
  const [uploadLimit, setUploadLimit] = useState(formatLimit(initialRateLimits.uploadBps));
  const [maxActiveDownloads, setMaxActiveDownloads] = useState(initialMaxActiveDownloads);
  const [closeToTray, setCloseToTray] = useState(initialCloseToTray);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [saving, setSaving] = useState(false);

  async function browseFolder() {
    try {
      const selected = await chooseDownloadFolder();
      if (selected) setFolder(selected);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function restoreDefaultFolder() {
    try {
      setFolder(await defaultDownloadFolder());
      notify("Папка по умолчанию подставлена. Нажмите «Сохранить настройки», чтобы применить её.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function openFolder() {
    const trimmed = folder.trim();
    if (!trimmed) {
      notify("Сначала укажите папку загрузки.", "error");
      return;
    }
    try {
      await openDownloadFolder(trimmed);
      notify("Папка загрузки открыта.");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function copyFolderPath() {
    const trimmed = folder.trim();
    if (!trimmed) {
      notify("Сначала укажите папку загрузки.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(trimmed);
      notify("Путь к папке скопирован.");
    } catch (error) {
      notify(
        `Не удалось скопировать путь: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  }

  async function save() {
    const trimmed = folder.trim();
    if (!trimmed) {
      notify("Укажите папку для загрузок.", "error");
      return;
    }
    try {
      setSaving(true);
      await onSavePreferences(
        trimmed,
        { downloadBps: parseLimit(downloadLimit), uploadBps: parseLimit(uploadLimit) },
        maxActiveDownloads,
        closeToTray,
        notifications,
      );
      notify("Настройки сохранены.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-page">
      <div className="settings-title-row">
        <button className="icon-button" onClick={onBack} type="button">
          <ArrowLeft size={17} />
        </button>
        <div>
          <div className="eyebrow">ПАРАМЕТРЫ ПРИЛОЖЕНИЯ</div>
          <h1>Настройки</h1>
        </div>
      </div>
      <div className="settings-card">
        <div className="settings-section-heading">
          <span className="settings-icon"><HardDriveDownload size={18} /></span>
          <div>
            <h2>Загрузки</h2>
            <p>Выберите, куда ORBIT будет сохранять новые торренты.</p>
          </div>
        </div>
        <label className="field-label" htmlFor="download-folder">
          Папка сохранения
        </label>
        <div className="folder-picker">
          <input
            className="text-input"
            id="download-folder"
            onChange={(event) => setFolder(event.currentTarget.value)}
            placeholder="C:\Users\...\Downloads\ORBIT"
            value={folder}
          />
          <button
            aria-label="Выбрать папку"
            className="button button-outline"
            onClick={browseFolder}
            title="Выбрать папку"
            type="button"
          >
            <FolderOpen size={16} />
            Обзор
          </button>
        </div>
        <p className="field-hint">
          Папка создаётся при добавлении торрента. Уже добавленные загрузки
          останутся в выбранных для них папках.
        </p>
        <div className="settings-folder-actions">
          <button
            className="button button-outline"
            disabled={!folder.trim()}
            onClick={() => void openFolder()}
            type="button"
          >
            <FolderOpen size={15} />
            Открыть папку
          </button>
          <button
            className="button button-outline"
            disabled={!folder.trim()}
            onClick={() => void copyFolderPath()}
            type="button"
          >
            <Clipboard size={15} />
            Копировать путь
          </button>
          <button
            className="button button-quiet"
            onClick={() => void restoreDefaultFolder()}
            type="button"
          >
            <RotateCcw size={15} />
            По умолчанию
          </button>
        </div>
        <div className="settings-divider" />
        <div className="settings-section-heading">
          <span className="settings-icon"><HardDriveDownload size={18} /></span>
          <div>
            <h2>Скорость и очередь</h2>
            <p>Ограничения применяются сразу к загрузке и раздаче.</p>
          </div>
        </div>
        <div className="settings-grid">
          <label className="settings-field">
            <span>Лимит загрузки, МиБ/с</span>
            <input
              className="text-input"
              min="0"
              onChange={(event) => setDownloadLimit(event.currentTarget.value)}
              placeholder="Без ограничений"
              step="0.1"
              type="number"
              value={downloadLimit}
            />
          </label>
          <label className="settings-field">
            <span>Лимит отдачи, МиБ/с</span>
            <input
              className="text-input"
              min="0"
              onChange={(event) => setUploadLimit(event.currentTarget.value)}
              placeholder="Без ограничений"
              step="0.1"
              type="number"
              value={uploadLimit}
            />
          </label>
          <label className="settings-field">
            <span>Одновременные загрузки</span>
            <select
              className="text-input"
              onChange={(event) => setMaxActiveDownloads(Number(event.currentTarget.value))}
              value={maxActiveDownloads}
            >
              <option value={0}>Без ограничения</option>
              {Array.from({ length: 20 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="field-hint">
          Очередь упорядочивается в панели сведений торрента. Пауза вручную остаётся паузой и не снимается очередью.
        </p>
        <div className="settings-divider" />
        <div className="settings-section-heading">
          <span className="settings-icon"><FolderOpen size={18} /></span>
          <div>
            <h2>Уведомления и окно</h2>
            <p>Управление завершёнными загрузками и поведением окна.</p>
          </div>
        </div>
        <div className="settings-toggle-list">
          <label className="settings-toggle">
            <input
              checked={notifications}
              onChange={(event) => setNotifications(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>Уведомлять о завершении загрузки</span>
          </label>
          <label className="settings-toggle">
            <input
              checked={closeToTray}
              onChange={(event) => setCloseToTray(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>Сворачивать в системный трей при закрытии</span>
          </label>
        </div>
        <div className="settings-divider" />
        <div className="settings-note">
          <span className="note-dot" />
          Сессия и очередь сохраняются локально на этом устройстве.
        </div>
        <div className="settings-actions">
          <button className="button button-primary" disabled={saving} onClick={() => void save()} type="button">
            Сохранить настройки
          </button>
        </div>
      </div>
    </section>
  );
}
