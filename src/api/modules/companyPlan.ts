import { requestEmpty, requestJson, requestJsonOrUnauthorized } from "../request";
import type { BootstrapPayload, CompanyConfig, LoginPayload, Ticket, TicketCreatePayload, TicketStatus } from "../../types";

export async function getBootstrapApi(): Promise<BootstrapPayload | null> {
  return requestJsonOrUnauthorized<BootstrapPayload>("/api/bootstrap");
}

export function loginApi(payload: LoginPayload) {
  return requestJson<{ currentUser: BootstrapPayload["currentUser"] }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logoutApi() {
  return requestEmpty("/api/auth/logout", { method: "POST" });
}

export function updateTicketStatusApi(ticketId: string, status: TicketStatus) {
  return requestJson<{ ticket: Ticket }>(`/api/tickets/${ticketId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateTicketTimelineApi(ticketId: string, offsetHours: number, spanHours: number) {
  return requestJson<{ ticket: Ticket }>(`/api/tickets/${ticketId}/timeline`, {
    method: "PATCH",
    body: JSON.stringify({ offsetHours, spanHours }),
  });
}

export function createTicketApi(ticket: TicketCreatePayload) {
  return requestJson<{ ticket: Ticket }>("/api/tickets", {
    method: "POST",
    body: JSON.stringify(ticket),
  });
}

export function saveAdminConfigApi(config: CompanyConfig) {
  return requestJson<{ config: CompanyConfig; bootstrap?: BootstrapPayload }>("/api/admin/config", {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}
