// API 基址:dev 为空 → 相对 /api(vite 代理到本地后端);prod 为线上域名 → 直连域名。
// 调用方传入路径已含 /api,故此处只拼「源」(协议+域名)。见 .env.development / .env.production
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
// 拼完整 API 地址(dev 相对、prod 直连域名)。导出供 EventSource 等非 fetch 场景复用同一基址。
export const apiUrl = (url: string) => (API_BASE && url.startsWith("/") ? API_BASE + url : url);

export async function readApiError(response: Response) {
  if (response.status >= 500) return "服务重启中...";
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || `请求失败：${response.status}`;
  } catch {
    return `请求失败：${response.status}`;
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
