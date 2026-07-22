import type { OpsPeopleProgressRole, OpsPeopleProgressRow, OpsTicket } from "../../api/modules/ops";

export type PeopleProgressRole = OpsPeopleProgressRole;
export type PeopleProgressRow = OpsPeopleProgressRow;
export type PeopleTicketStatus = "all" | "doing" | "queued" | "blocked" | "overdue";
export type PeopleProgressTicket = OpsTicket;
