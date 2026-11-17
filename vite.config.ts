import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { MOCK_PORT } from "./server/port";

// Trình duyệt chỉ nói chuyện với cổng 4213. Vite chuyển tiếp /api và /ws sang mock server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4213,
    strictPort: true,
    proxy: {
      "/api": `http://localhost:${MOCK_PORT}`,
      "/ws": { target: `ws://localhost:${MOCK_PORT}`, ws: true },
    },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "server/**/*.test.ts", "src/**/*.test.ts"],
  },
});
