import { useEffect, useState } from "react";
import type { SourceView } from "../components/footer-bar";
import { instrumentsFromApi } from "../lib/board-tabs-data";
import { apiUrl } from "../net/api-base";
import type { Instrument } from "../../shared/protocol";

export type InstrumentsState = "idle" | "loading" | "ready" | "error";

// Danh sách mã của nguồn. Chỉ nguồn mock cần tải (GET /api/instruments) để biết sàn và lọc tab HNX/UPCOM.
// Với ysflex, mọi mã đều là HOSE và chỉ có 30 mã VN30, nên danh sách để trống.
export function useInstruments(source: SourceView): { instruments: Instrument[]; state: InstrumentsState } {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [state, setState] = useState<InstrumentsState>("idle");

  useEffect(() => {
    if (source !== "mock") {
      setState("ready");
      return;
    }
    let cancelled = false;
    setState("loading");
    fetch(apiUrl("/instruments"))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((raw) => {
        if (cancelled) return;
        setInstruments(instrumentsFromApi(raw));
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return { instruments, state };
}
