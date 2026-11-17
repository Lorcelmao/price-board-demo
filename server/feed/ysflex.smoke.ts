import { createYsflexFeed } from "./ysflex";

// Thử tay: nối thật vào /market trong 15 giây, in số tin theo loại, rồi thử lịch sử của FPT.
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
  void (async () => {
    const status = feed.status();
    const candles = await feed.history!.intraday("FPT").catch((error: Error) => {
      console.error(`[ysflex] intraday lỗi: ${error.message}`);
      return [];
    });
    const trades = await feed.history!.trades("FPT", { size: 5 }).catch((error: Error) => {
      console.error(`[ysflex] trades lỗi: ${error.message}`);
      return [];
    });

    console.log(
      JSON.stringify(
        {
          durationMs: Date.now() - startedAt,
          counts,
          status,
          fpt: { candles: candles.length, latestCandles: candles.slice(-3), trades: trades.slice(0, 5) },
        },
        null,
        2,
      ),
    );
    feed.stop();
    console.log(`[ysflex] stopped=${feed.status().connection}`);
    process.exit(0);
  })();
}, 15_000);
