import { useEffect, useRef, useState } from "react";
import { ALWAYS_VISIBLE, COLUMNS, GROUP_ORDER } from "../lib/columns";

// Hộp thoại cấu hình cột. Giữ một bản nháp; chỉ "Áp dụng" mới trả về danh sách ẩn mới.
// Esc, "Hủy" và bấm ra ngoài đều như Hủy: không đổi gì.

interface ColumnConfigDialogProps {
  hidden: string[];
  onApply: (hidden: string[]) => void;
  onClose: () => void;
}

interface Section {
  name: string;
  columnIds: string[];
}

const BASIC_GROUP = "Cơ bản";

const SECTIONS: Section[] = (() => {
  const sections: Section[] = [{ name: BASIC_GROUP, columnIds: [] }];
  for (const name of GROUP_ORDER) sections.push({ name, columnIds: [] });
  for (const column of COLUMNS) {
    if (column.id === "drag") continue;
    const target = column.group ?? BASIC_GROUP;
    const section = sections.find((item) => item.name === target);
    section?.columnIds.push(column.id);
  }
  // "Tổng KL" không thuộc nhóm nào nhưng phải ẩn hiện được: xếp vào Cơ bản.
  return sections.filter((section) => section.columnIds.length > 0);
})();

const titleOf = (id: string): string => COLUMNS.find((column) => column.id === id)?.title ?? id;

export function ColumnConfigDialog({ hidden, onApply, onClose }: ColumnConfigDialogProps) {
  const [draft, setDraft] = useState<string[]>(hidden);
  const firstCheckbox = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mã CK bị khoá nên không nhận con trỏ; đưa con trỏ vào ô chọn bật được đầu tiên
    const fallback = dialog.current?.querySelector<HTMLInputElement>("input[type=checkbox]:not(:disabled)") ?? null;
    (firstCheckbox.current ?? fallback)?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: string) => {
    if (ALWAYS_VISIBLE.has(id)) return;
    setDraft((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const resetAll = () => setDraft([]);

  return (
    <div
      className="pb-dialog-backdrop"
      onMouseDown={(event) => {
        // Chỉ tính là bấm ra ngoài khi nhấn bắt đầu ở chính lớp nền.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="pb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pb-column-config-title"
      >
        <h2 id="pb-column-config-title" className="pb-dialog-title">Cấu hình bảng giá</h2>
        <div className="pb-dialog-body">
          {SECTIONS.map((section) => (
            <fieldset key={section.name} className="pb-dialog-group">
              <legend>{section.name}</legend>
              <div className="pb-dialog-checks">
                {section.columnIds.map((id) => {
                  const locked = ALWAYS_VISIBLE.has(id);
                  const checked = locked || !draft.includes(id);
                  return (
                    <label key={id} className="pb-dialog-check">
                      <input
                        ref={id === "symbol" ? firstCheckbox : undefined}
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={() => toggle(id)}
                      />
                      {titleOf(id)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="pb-dialog-actions">
          <button type="button" className="pb-dialog-btn" onClick={resetAll}>Quay lại mặc định</button>
          <span className="pb-dialog-spacer" />
          <button type="button" className="pb-dialog-btn" onClick={onClose}>Hủy</button>
          <button type="button" className="pb-dialog-btn is-primary" onClick={() => onApply(draft)}>Áp dụng</button>
        </div>
      </div>
    </div>
  );
}
