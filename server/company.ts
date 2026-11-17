import type { Exchange } from "../shared/market-rules";
import type { CompanyDto } from "../shared/protocol";
import { seededRandom } from "./market-simulator";

// Thông tin doanh nghiệp GIẢ, sinh có seed theo mã. Chỉ để tab "Thông tin khác" có số mà hiển thị.

const SECTOR: Record<string, string> = {
  VCB: "Ngân hàng", BID: "Ngân hàng", CTG: "Ngân hàng", ACB: "Ngân hàng", TCB: "Ngân hàng", VPB: "Ngân hàng",
  MBB: "Ngân hàng", HDB: "Ngân hàng", STB: "Ngân hàng", TPB: "Ngân hàng", VIB: "Ngân hàng", SHB: "Ngân hàng",
  LPB: "Ngân hàng", SSB: "Ngân hàng", SSI: "Chứng khoán", SHS: "Chứng khoán", MBS: "Chứng khoán", BVS: "Chứng khoán",
  FPT: "Công nghệ", HPG: "Thép", GVR: "Cao su", MSN: "Hàng tiêu dùng", VNM: "Thực phẩm", SAB: "Đồ uống",
  MWG: "Bán lẻ", PNJ: "Bán lẻ", GAS: "Dầu khí", PLX: "Dầu khí", POW: "Điện", VIC: "Bất động sản",
  VHM: "Bất động sản", VRE: "Bất động sản", BCM: "Bất động sản", CEO: "Bất động sản", ACV: "Hàng không",
};

export function companyInfo(input: {
  symbol: string;
  name: string;
  exchange: Exchange;
  price: number;
  room: number;
}): CompanyDto {
  const random = seededRandom([...input.symbol].reduce((hash, char) => hash * 31 + char.charCodeAt(0), 7));
  const sharesOutstanding = Math.round((100 + random() * 7_000) * 1_000_000 / 1_000) * 1_000;
  const eps = Math.round(500 + random() * 7_500);
  const bookValue = input.price / (0.8 + random() * 3.2);
  return {
    symbol: input.symbol,
    name: input.name,
    exchange: input.exchange,
    sector: SECTOR[input.symbol] ?? "Khác",
    sharesOutstanding,
    marketCap: sharesOutstanding * input.price,
    eps,
    pe: Math.round((input.price / eps) * 100) / 100,
    pb: Math.round((input.price / bookValue) * 100) / 100,
    foreignRoom: input.room,
  };
}
