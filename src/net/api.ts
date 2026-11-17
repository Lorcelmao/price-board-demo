import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "./api-base";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) throw new Error(`Không tải được ${path} (${response.status})`);
  return (await response.json()) as T;
}

// Trả về cả trạng thái HTTP vì lệnh bị từ chối (422, 409) vẫn có nội dung cần đọc.
export async function apiPost<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return { status: response.status, data: (await response.json()) as T };
}

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useApi<T>(path: string): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    apiGet<T>(path)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(reload, [reload]);
  return { data, error, loading, reload };
}
