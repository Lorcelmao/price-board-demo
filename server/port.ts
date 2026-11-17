// Cổng của mock server, dùng chung cho server và proxy của Vite.
// Mặc định 8790 vì 8787 hay bị công cụ khác trên máy chiếm. Đổi bằng biến môi trường MOCK_PORT.
// Dịch vụ host như Render cấp cổng qua PORT, nên đọc PORT khi không đặt MOCK_PORT.
export const MOCK_PORT = Number(process.env.MOCK_PORT ?? process.env.PORT ?? 8790);
