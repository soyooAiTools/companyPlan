// API 基址:dev 为空 → 相对 /api(vite 代理到本地后端);prod 为线上 API 域名 → 直连。
// VITE_API_BASE_URL 由发布环境覆盖；兜底值避免 OSS 静态站漏配构建变量后把 POST /api 发给 OSS。
// 调用方传入路径已含 /api,故此处只拼「源」(协议+域名)。
const DEFAULT_PRODUCTION_API_BASE = "https://opsapi.soyootech.com";
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? DEFAULT_PRODUCTION_API_BASE : "")).replace(/\/+$/, "");
// 拼完整 API 地址(dev 相对、prod 直连域名)。导出供 EventSource 等非 fetch 场景复用同一基址。
export const apiUrl = (url: string) => (API_BASE && url.startsWith("/") ? API_BASE + url : url);

export async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || `请求失败：${response.status}`;
  } catch {
    return response.status >= 500 ? "服务重启中..." : `请求失败：${response.status}`;
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(url), {
      credentials: "include",
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("服务重启中...");
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json() as Promise<T>;
}

export async function requestJsonOrUnauthorized<T>(url: string, init?: RequestInit): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(apiUrl(url), {
      credentials: "include",
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("服务重启中...");
  }

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json() as Promise<T>;
}

export async function requestEmpty(url: string, init?: RequestInit): Promise<void> {
  let response: Response;
  try {
    response = await fetch(apiUrl(url), {
      credentials: "include",
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("服务重启中...");
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}
