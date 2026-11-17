// Cổng của mock server, dùng chung cho server và proxy của Vite.
// Mặc định 8790 vì 8787 hay bị công cụ khác trên máy chiếm. Đổi bằng biến môi trường MOCK_PORT.
// Không đọc PORT ở đây: nhiều công cụ trên máy tự đặt PORT cho Vite, khi đó server và Vite sẽ tranh một cổng.
export const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8790);

// Cổng khi server chạy một mình (npm run server, như trên Render): dịch vụ host cấp cổng qua PORT.
// Khi chạy cùng Vite (npm run dev, có cờ --dev) thì luôn dùng MOCK_PORT để khớp proxy của Vite.
export const listenPort = (argv: string[] = process.argv): number =>
  argv.includes("--dev") ? MOCK_PORT : Number(process.env.PORT ?? MOCK_PORT);
