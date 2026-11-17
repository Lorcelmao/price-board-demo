# Price Board Demo

Bảng giá chứng khoán realtime viết bằng React và TypeScript, chạy cùng một mock server trên máy. Dự án mô phỏng các màn hình thường gặp của một bảng giá: bảng giá theo tab sàn, dải chỉ số, đặt lệnh, sổ lệnh, đăng nhập và popup chi tiết mã có biểu đồ nến.

> **Lưu ý:** mọi giá, khối lượng, tài khoản và lệnh trong dự án đều là dữ liệu giả lập do mock server sinh ra. Dự án chỉ dùng để học và demo, không liên kết với công ty chứng khoán nào và không phải lời khuyên đầu tư.

![Bảng giá](docs/bang-gia.png)

![Popup chi tiết mã](docs/chi-tiet-ma.png)

## Tính năng

- **Bảng giá realtime:** 30 cột chia 5 nhóm (dư mua, khớp lệnh, dư bán, giá, nhà ĐTNN), giá nhận qua WebSocket, ô nháy màu khi số đổi.
- **Tab sàn và danh mục quan tâm:** VN30, HNX, UPCOM; thêm hoặc bỏ mã khỏi danh mục, mỗi tab nhớ thứ tự và cách sắp xếp riêng.
- **Tuỳ biến bảng:** sắp xếp theo cột, kéo thả dòng, ẩn hiện cột, thu gọn dải chỉ số. Cấu hình lưu trong `localStorage`.
- **Đặt lệnh:** bấm đúp vào ô giá để mở form lệnh có sẵn giá; kiểm tra bước giá, lô, trần sàn, sức mua; có bước xác nhận.
- **Sổ lệnh:** xem, sửa, huỷ lệnh; tin khớp đẩy về qua WebSocket.
- **Đăng nhập giả lập:** token Bearer sống 8 giờ, mỗi tài khoản một phiên, server báo khi phiên hết hạn.
- **Popup chi tiết mã:** biểu đồ nến (Lightweight Charts) với EMA 5, EMA 20, khối lượng, nhiều kiểu biểu đồ và khung thời gian; bốn tab độ sâu giá, khớp lệnh, lịch sử giá, thông tin khác.
- **Hai nguồn giá:** mặc định là mock server. Nút nhỏ ở chân trang chuyển sang luồng giá công khai của YSFlex (xem mục bên dưới).

## Chạy thử

Cần Node.js 20 trở lên.

```bash
npm install
```

```bash
npm run dev
```

Lệnh trên chạy mock server (cổng 8790) và Vite (cổng 4213) cùng lúc. Mở http://localhost:4213.

Đổi cổng mock server bằng biến môi trường `MOCK_PORT`.

### Tài khoản demo

| Tên đăng nhập | Mật khẩu |
| --- | --- |
| `demo` | `demo123` |
| `demo2` | `demo123` |
| `demo3` | `demo123` |

Đây là tài khoản giả, chỉ tồn tại trong `server/mock-users.ts`. Mock server chỉ có một tài khoản giao dịch, nên ba tên đăng nhập dùng chung số dư, danh mục và sổ lệnh.

### Các lệnh khác

| Lệnh | Việc làm |
| --- | --- |
| `npm test` | Chạy toàn bộ unit test (Vitest) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run build` | Kiểm tra kiểu rồi build bản production vào `dist/` |
| `npm run server` | Chỉ chạy mock server |
| `npm run web` | Chỉ chạy Vite |

## Deploy

Giao diện là trang tĩnh, còn mock server cần chạy liên tục để giữ WebSocket và trạng thái trong bộ nhớ. Vì vậy hai phần deploy ở hai nơi:

| Phần | Nơi chạy | Cấu hình |
| --- | --- | --- |
| Mock server | Render (Web Service) | Build `npm ci --include=dev`, Start `npm run server`. Server tự đọc cổng từ biến `PORT`. |
| Giao diện | Vercel | Preset Vite, giữ lệnh build mặc định. Biến môi trường `VITE_API_URL` là địa chỉ server trên Render. |

Khi có `VITE_API_URL`, giao diện gọi REST và WebSocket thẳng tới địa chỉ đó (server đã bật CORS) và ẩn nguồn YSFlex. Gói miễn phí của Render cho server ngủ khi không có người dùng, nên lần mở đầu có thể phải chờ khoảng một phút. Mọi người xem dùng chung một thị trường giả lập và một tài khoản giao dịch.

## Nguồn giá YSFlex

Thêm `?nguon=ysflex` vào địa chỉ, hoặc bấm nút "Dùng YSFlex" ở chân trang, để xem giá từ luồng `/market` công khai của YSFlex. Ở chế độ này:

- chỉ có 30 mã VN30, tab HNX và UPCOM bị tắt;
- không đăng nhập, không đặt lệnh;
- trình duyệt nối thẳng tới máy chủ bên ngoài, nên cần mạng và phụ thuộc vào việc luồng đó còn mở.

Bấm "Dùng mock" để quay lại nguồn mặc định.

## Kiến trúc

```text
Trình duyệt (React, cổng 4213)
   |  /api (REST) và /ws (WebSocket), Vite chuyển tiếp
   v
Mock server (Node.js, cổng 8790)
   - MarketSimulator: sinh giá và khớp lệnh ngẫu nhiên theo bước giá
   - OrderEngine: nhận, sửa, huỷ, khớp lệnh
   - AuthStore: cấp và kiểm tra token
   - candles: dựng nến lịch sử theo mã (số ngẫu nhiên có hạt giống cố định)
```

- Giá đi một chiều từ server qua WebSocket vào `quote-store`. Mỗi ô chỉ đăng ký đúng mã nó cần (`useSyncExternalStore`), nên một lần khớp không vẽ lại cả bảng.
- Lệnh đi qua REST có gắn token; kết quả khớp đẩy về qua WebSocket và gộp vào `account-store`.
- Biểu đồ nạp lịch sử một lần bằng `setData`, sau đó chỉ cập nhật cây nến cuối theo giá realtime.
- Kiểu dữ liệu và luật nghiệp vụ dùng chung (bước giá, lô, kiểm tra lệnh, tính danh mục) nằm trong `shared/`, có test riêng.

## Cấu trúc thư mục

```text
price-board-demo/
├── index.html
├── src/
│   ├── main.tsx, app.tsx      Điểm vào và bố cục trang
│   ├── components/            Thanh trên, menu, dải chỉ số, bảng giá, hộp thoại, sổ lệnh, biểu đồ
│   ├── hooks/                 State của App tách theo việc: cấu hình bảng, danh mục, form lệnh, sổ lệnh
│   ├── lib/                   Kho dữ liệu, nguồn giá, định dạng số, logic form lệnh (kèm test)
│   ├── net/                   Client WebSocket và REST
│   └── styles/                CSS của bảng và bố cục
├── server/                    Mock server: thị trường giả lập, khớp lệnh, đăng nhập, nến
├── shared/                    Giao thức tin nhắn và luật nghiệp vụ dùng chung
├── scripts/browser-checks/    Script kiểm tra giao diện, dán vào console của trang đang chạy
└── docs/                      Ảnh chụp màn hình
```

## Kiểm tra giao diện

Thư mục `scripts/browser-checks/` chứa các script chạy ngay trong trang (dán vào DevTools console). Mỗi script trả về danh sách `{ id, pass, detail }`:

- `check-layout.js`: thứ tự vùng, tiêu đề cột, màu ô, số dòng;
- `check-interactions.js`: chọn dòng, sắp xếp, kéo thả;
- `check-tabs.js`: tab sàn và danh mục quan tâm;
- `check-order-form.js`: form đặt lệnh;
- `check-order-flow.js`, `check-order-book.js`: đọc trạng thái lệnh và sổ lệnh, không tự bấm.

Nên xoá `localStorage` rồi tải lại trang trước khi chạy để có cấu hình mặc định.

## Công nghệ

React 19, TypeScript 5.8, Vite 6, Vitest 3, Lightweight Charts 5 (TradingView, Apache-2.0), `ws` và `tsx` cho mock server, `socket.io-client` cho nguồn YSFlex.
