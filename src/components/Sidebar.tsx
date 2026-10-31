import {
  Activity,
  CheckCircle2,
  CircleAlert,
  CirclePause,
  Download,
  FolderOpen,
  LayoutGrid,
  ListTodo,
  Settings,
  Upload,
} from "lucide-react";
import type { Torrent } from "../types/torrent";

export type ViewFilter =
  | "all"
  | "active"
  | "incomplete"
  | "completed"
  | "paused"
  | "seeding"
  | "errors"
  | `category:${string}`;

interface SidebarProps {
  torrents: Torrent[];
  categories: { name: string; count: number }[];
  filter: ViewFilter;
  settingsOpen: boolean;
  onFilterChange: (filter: ViewFilter) => void;
  onSettings: () => void;
}

const filters: {
  id: ViewFilter;
  label: string;
  icon: typeof LayoutGrid;
  count: (torrents: Torrent[]) => number;
}[] = [
  { id: "all", label: "Все загрузки", icon: LayoutGrid, count: (items) => items.length },
  {
    id: "active",
    label: "Активные",
    icon: Activity,
    count: (items) =>
      items.filter((torrent) => torrent.status === "downloading").length,
  },
  {
    id: "incomplete",
    label: "Незавершённые",
    icon: ListTodo,
    count: (items) => items.filter((torrent) => !torrent.finished && torrent.status !== "error").length,
  },
  {
    id: "completed",
    label: "Завершённые",
    icon: CheckCircle2,
    count: (items) => items.filter((torrent) => torrent.finished).length,
  },
  {
    id: "paused",
    label: "На паузе",
    icon: CirclePause,
    count: (items) => items.filter((torrent) => torrent.status === "paused").length,
  },
  {
    id: "seeding",
    label: "Раздачи",
    icon: Upload,
    count: (items) => items.filter((torrent) => torrent.status === "seeding").length,
  },
  {
    id: "errors",
    label: "С ошибками",
    icon: CircleAlert,
    count: (items) => items.filter((torrent) => torrent.status === "error" || torrent.error).length,
  },
];

export function Sidebar({
  torrents,
  categories,
  filter,
  settingsOpen,
  onFilterChange,
  onSettings,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="ORBIT — загрузки">
        <span className="brand-mark">
          <span />
          <span />
          <span />
        </span>
        <span className="brand-name">ORBIT</span>
        <span className="brand-version">BETA</span>
      </a>

      <div className="sidebar-section-label">БИБЛИОТЕКА</div>
      <nav className="sidebar-nav" aria-label="Фильтр загрузок">
        {filters.map(({ id, label, icon: Icon, count }) => (
          <button
            className={`nav-item ${filter === id && !settingsOpen ? "active" : ""}`}
            key={id}
            onClick={() => onFilterChange(id)}
            type="button"
          >
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
            <span className="nav-count">{count(torrents)}</span>
          </button>
        ))}
        {categories.length > 0 && (
          <div className="sidebar-category-section">
            <div className="sidebar-section-label">КАТЕГОРИИ</div>
            {categories.map((category) => {
              const id = `category:${category.name}` as const;
              return (
                <button
                  className={`nav-item ${filter === id && !settingsOpen ? "active" : ""}`}
                  key={category.name}
                  onClick={() => onFilterChange(id)}
                  type="button"
                >
                  <FolderOpen size={17} strokeWidth={1.8} />
                  <span>{category.name}</span>
                  <span className="nav-count">{category.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-storage">
          <div className="storage-heading">
            <Download size={15} />
            <span>Хранилище</span>
          </div>
          <span className="storage-caption">
            {torrents.length} {torrents.length === 1 ? "торрент" : "торрентов"} в очереди
          </span>
        </div>
        <button
          className={`nav-item settings-link ${settingsOpen ? "active" : ""}`}
          onClick={onSettings}
          type="button"
        >
          <Settings size={17} strokeWidth={1.8} />
          <span>Настройки</span>
        </button>
      </div>
    </aside>
  );
}
