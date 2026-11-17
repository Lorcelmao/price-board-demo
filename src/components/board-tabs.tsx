import type { SourceKey } from "../lib/board-prefs";
import { YSFLEX_TAB_NOTICE, tabEnabled, type BoardTab } from "../lib/board-tabs-data";

// Vùng 4: thanh tab cao 40px. Bốn tab chạy thật (DM quan tâm, VN30, HNX, UPCOM);
// các tab còn lại tĩnh như cũ. HNX và UPCOM bị tắt với nguồn ysflex.
const PRIMARY_TABS: Array<{ id: BoardTab; label: string }> = [
  { id: "watchlist", label: "DM quan tâm" },
  { id: "vn30", label: "VN30" },
  { id: "hnx", label: "HNX" },
  { id: "upcom", label: "UPCOM" },
];

const STATIC_TABS = ["Nhóm ngành", "Chứng quyền", "ETF HOSE", "Trái phiếu", "Khuyến nghị"];

interface BoardTabsProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenColumnConfig: () => void;
  gearRef?: React.Ref<HTMLButtonElement>;
  source: SourceKey;
  activeTab: BoardTab;
  onTabChange: (tab: BoardTab) => void;
  symbolInput: string;
  onSymbolInput: (value: string) => void;
  onAddSymbol: () => void;
  watchlistError: string | null;
  watchlistNotice: string | null;
}

export function BoardTabs({
  collapsed,
  onToggleCollapse,
  onOpenColumnConfig,
  gearRef,
  source,
  activeTab,
  onTabChange,
  symbolInput,
  onSymbolInput,
  onAddSymbol,
  watchlistError,
  watchlistNotice,
}: BoardTabsProps) {
  return (
    <div className="pb-tabs" role="tablist" aria-label="Nhóm bảng giá">
      <div className="pb-tabs-left">
        <div className="pb-symbol-box">
          <input
            className="pb-symbol-input"
            type="text"
            placeholder="Nhập mã CK"
            aria-label="Nhập mã CK"
            value={symbolInput}
            aria-invalid={Boolean(watchlistError)}
            onChange={(event) => onSymbolInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onAddSymbol();
            }}
          />
          <button type="button" className="pb-add" aria-label="Thêm mã" onClick={onAddSymbol}>+</button>
          {watchlistError && (
            <span className="pb-symbol-error" role="alert">{watchlistError}</span>
          )}
          {!watchlistError && watchlistNotice && (
            <span className="pb-symbol-notice" role="status">{watchlistNotice}</span>
          )}
        </div>
        {PRIMARY_TABS.map((tab) => {
          const enabled = tabEnabled(tab.id, source);
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-disabled={!enabled}
              disabled={!enabled}
              title={enabled ? undefined : YSFLEX_TAB_NOTICE}
              className={`pb-tab${selected ? " is-active" : ""}${enabled ? "" : " is-off"}`}
              data-tab={tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
              <i className="pb-caret" aria-hidden="true">▾</i>
            </button>
          );
        })}
        {STATIC_TABS.map((tab) => (
          <button key={tab} type="button" className="pb-tab" role="tab" aria-selected={false} tabIndex={-1}>
            {tab}
            <i className="pb-caret" aria-hidden="true">▾</i>
          </button>
        ))}
      </div>
      <div className="pb-tabs-right">
        <button
          ref={gearRef}
          type="button"
          className="pb-gear"
          aria-label="Cấu hình cột"
          title="Cấu hình cột"
          onClick={onOpenColumnConfig}
        >
          ⚙
        </button>
        <button type="button" className="pb-collapse" onClick={onToggleCollapse}>
          {collapsed ? "Mở rộng ▼" : "Thu gọn ▲"}
        </button>
      </div>
    </div>
  );
}
