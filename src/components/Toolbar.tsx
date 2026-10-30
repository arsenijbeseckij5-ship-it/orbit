import { FilePlus2, Link2, Pause, Play, Search, Trash2 } from "lucide-react";

interface ToolbarProps {
  search: string;
  selectedCount: number;
  actionsDisabled: boolean;
  onSearch: (value: string) => void;
  onAddMagnet: () => void;
  onAddFile: () => void;
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
}

export function Toolbar({
  search,
  selectedCount,
  actionsDisabled,
  onSearch,
  onAddMagnet,
  onAddFile,
  onPause,
  onResume,
  onRemove,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-actions">
        <button className="button button-primary" disabled={actionsDisabled} onClick={onAddMagnet} type="button">
          <Link2 size={16} />
          <span>Добавить Magnet</span>
        </button>
        <button className="button button-quiet" disabled={actionsDisabled} onClick={onAddFile} type="button">
          <FilePlus2 size={16} />
          <span>Открыть файл</span>
        </button>
        <span className="toolbar-divider" />
        <button
          className="icon-button"
          disabled={actionsDisabled || selectedCount === 0}
          onClick={onResume}
          title="Продолжить выбранные"
          type="button"
        >
          <Play size={16} />
        </button>
        <button
          className="icon-button"
          disabled={actionsDisabled || selectedCount === 0}
          onClick={onPause}
          title="Приостановить выбранные"
          type="button"
        >
          <Pause size={16} />
        </button>
        <button
          className="icon-button icon-button-danger"
          disabled={actionsDisabled || selectedCount === 0}
          onClick={onRemove}
          title="Удалить выбранные"
          type="button"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input
          onChange={(event) => onSearch(event.currentTarget.value)}
          placeholder="Поиск загрузок"
          value={search}
        />
        <kbd>Ctrl K</kbd>
      </label>
    </div>
  );
}
