import { ArrowLeft, FolderOpen, HardDriveDownload } from "lucide-react";
import { useState } from "react";
import { chooseDownloadFolder } from "../services/torrentService";

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
