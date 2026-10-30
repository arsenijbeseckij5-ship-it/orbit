import {
  Activity,
  CheckCircle2,
  CirclePause,
  Download,
  LayoutGrid,
  Settings,
  Upload,
} from "lucide-react";
import type { Torrent } from "../types/torrent";

export type ViewFilter = "all" | "active" | "completed" | "paused" | "seeding";

interface SidebarProps {
  torrents: Torrent[];
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
];

export function Sidebar({
  torrents,
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
