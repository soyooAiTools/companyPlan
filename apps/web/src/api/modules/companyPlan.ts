import { requestEmpty, requestJson } from "../request";

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginUser {
  id: string;
  username: string;
  name: string;
  roleKey: string;
}

export function loginApi(payload: LoginPayload) {
  return requestJson<{ currentUser: LoginUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logoutApi() {
  return requestEmpty("/api/auth/logout", { method: "POST" });
}
