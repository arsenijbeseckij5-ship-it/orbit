import {
  ArrowLeft,
  Clipboard,
  FolderOpen,
  HardDriveDownload,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import {
  chooseDownloadFolder,
  defaultDownloadFolder,
  openDownloadFolder,
} from "../services/torrentService";

interface SettingsProps {
  initialDownloadFolder: string;
  onBack: () => void;
  onSaveFolder: (folder: string) => void;
  notify: (message: string, kind?: "success" | "error") => void;
}

export function Settings({
  initialDownloadFolder,
  onBack,
  onSaveFolder,
  notify,
}: SettingsProps) {
  const [folder, setFolder] = useState(initialDownloadFolder);

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

  function save() {
    const trimmed = folder.trim();
    if (!trimmed) {
      notify("Укажите папку для загрузок.", "error");
      return;
    }
    onSaveFolder(trimmed);
    notify("Папка загрузки сохранена.", "success");
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
        <div className="settings-note">
          <span className="note-dot" />
          Сессия и очередь сохраняются локально на этом устройстве.
        </div>
        <div className="settings-actions">
          <button className="button button-primary" onClick={save} type="button">
            Сохранить настройки
          </button>
        </div>
      </div>
    </section>
  );
}
