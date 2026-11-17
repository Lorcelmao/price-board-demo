import type { QuotePatch } from "../../shared/feed";
import type { BookLevel, Quote } from "../../shared/protocol";

// Chuyển một tin của luồng /market thành phần cập nhật của Quote.
// Hàm thuần, không mở kết nối, không ném lỗi: tin không nhận ra thì trả null.
// Bản vá chỉ chứa trường có trong tin. Trường vắng mặt không được có mặt dưới dạng undefined,
// vì bản vá được trộn đè lên dữ liệu đang có: tin chỉ có một phía dư mua thì phía kia phải giữ nguyên.

export interface MappedMessage {
  symbol: string;
  patch: QuotePatch;
}

type Raw = Record<string, unknown>;

const num = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

// Topic dạng KRXMDDS|<loại>|G<n>|<mã>.
const parseTopic = (topic: unknown): { kind: string; symbol: string } | null => {
  if (typeof topic !== "string") return null;
  const parts = topic.split("|");
  if (parts.length < 4) return null;
  const [root, kind, , symbol] = parts;
  if (root !== "KRXMDDS" || !kind || !symbol) return null;
  return { kind, symbol };
};

// ST: t207 là sàn nơi niêm yết. HO = HOSE; còn lại giữ nguyên nếu đã là tên sàn.
const toExchange = (code: unknown): Quote["exchange"] | undefined => {
  if (code === "HO") return "HOSE";
  if (code === "HOSE" || code === "HNX" || code === "UPCOM") return code;
  return undefined;
};

// Ba mức dư mua/bán: mảng TPBID/TPOFFER, mỗi phần tử có t290 (mức 1..3), t270 giá, t271 KL.
const toLevels = (rows: unknown): BookLevel[] | undefined => {
  if (!Array.isArray(rows)) return undefined;
  const levels: BookLevel[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const price = num((row as Raw).t270);
    const volume = num((row as Raw).t271);
    if (price === undefined || volume === undefined) continue;
    const index = num((row as Raw).t290) ?? levels.length + 1;
    levels[index - 1] = [price, volume];
  }
  return levels.filter((level): level is BookLevel => Array.isArray(level));
};

function mapData(kind: string, data: Raw): QuotePatch | null {
  switch (kind) {
    case "ST": {
      const ref = num(data.t20013);
      const ceil = num(data.t1149);
      const floor = num(data.t1148);
      const exchange = toExchange(data.t207);
      if (ref === undefined && ceil === undefined && floor === undefined && exchange === undefined) return null;
      return pruneEmpty({ ref, ceil, floor, exchange });
    }
    case "SI": {
      // Giá khớp là t270, giống tin MD và giống số trên màn hình YSFlex.
      // Không dùng t20026: khi theo dõi thực tế, trường này đứng yên cả phiên chiều trong khi giá khớp chạy.
      const last = num(data.t270);
      const patch: QuotePatch = {
        last,
        lastVolume: num(data.t271),
        totalVolume: num(data.t387),
        avgPrice: num(data.t40001),
        high: num(data.t30562),
        low: num(data.t30563),
        open: num(data.t30561),
        foreignBuyValue: num(data.t30557),
        foreignSellValue: num(data.t30558),
      };
      // Đã có khớp thật thì giá dự khớp không còn ý nghĩa (giống applyMarketMessage của mock).
      if (last !== undefined) patch.expectedPrice = null;
      return pruneEmpty(patch);
    }
    case "TP": {
      const bids = toLevels(data.TPBID);
      const asks = toLevels(data.TPOFFER);
      if (!bids && !asks) return null;
      return pruneEmpty({ bids, asks });
    }
    case "MD": {
      const last = num(data.t270);
      const lastVolume = num(data.t271);
      if (last === undefined && lastVolume === undefined) return null;
      return pruneEmpty({ last, lastVolume });
    }
    default:
      return null;
  }
}

const pruneEmpty = (patch: QuotePatch): QuotePatch => {
  const out: QuotePatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
};

export function mapYsflexMessage(event: unknown, payload: unknown): MappedMessage | null {
  if (event !== "onFOSStream") return null;
  if (!payload || typeof payload !== "object") return null;
  const { topic, data } = payload as Raw;
  if (!data || typeof data !== "object") return null;

  const parsed = parseTopic(topic);
  if (!parsed) return null;

  const patch = mapData(parsed.kind, data as Raw);
  if (!patch) return null;

  return { symbol: parsed.symbol, patch };
}
