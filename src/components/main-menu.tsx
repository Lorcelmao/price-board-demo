// Vùng 2: menu cao 45px, tĩnh.
const MENU = [
  { label: "BẢNG GIÁ", arrow: false },
  { label: "THÔNG TIN THỊ TRƯỜNG", arrow: true },
  { label: "GIAO DỊCH CHỨNG KHOÁN", arrow: true },
  { label: "GIAO DỊCH TIỀN", arrow: true },
  { label: "QUẢN LÝ TÀI SẢN", arrow: true },
  { label: "TIỆN ÍCH KHÁC", arrow: true },
  { label: "ĐẦU TƯ", arrow: true },
];

export function MainMenu() {
  return (
    <nav className="pb-menu" aria-label="Menu chính">
      {MENU.map((item) => (
        <span key={item.label} className="pb-menu-item">
          {item.label}
          {item.arrow && <i className="pb-caret" aria-hidden="true">▾</i>}
        </span>
      ))}
    </nav>
  );
}
