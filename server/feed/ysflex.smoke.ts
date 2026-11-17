import { createYsflexFeed } from "./ysflex";

// Thử tay: nối thật vào /market trong 15 giây, in số tin theo loại rồi tự dừng.
// Không nằm trong `npm test` (Vitest chỉ lấy file *.test.ts).
// Chạy: npx tsx server/feed/ysflex.smoke.ts

const feed = createYsflexFeed();
const counts = { quote: 0, index: 0, indexHistory: 0 };
const startedAt = Date.now();

feed.start({
  quote: () => {
    counts.quote += 1;
  },
  index: () => {
    counts.index += 1;
  },
  indexHistory: () => {
    counts.indexHistory += 1;
  },
  connection: (state) => console.log(`[ysflex] connection=${state}`),
});

setTimeout(() => {
  const status = feed.status();
  console.log(JSON.stringify({ durationMs: Date.now() - startedAt, counts, status }, null, 2));
  feed.stop();
  console.log(`[ysflex] stopped=${feed.status().connection}`);
  process.exit(0);
}, 15_000);
