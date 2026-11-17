import { z } from "zod";
import type { TicketWithDetails } from "./schema";

export const ticketHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().optional(),
  assignedToMe: z.enum(["true", "false"]).optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).optional(),
});

export type TicketListFilters = {
  status?: string;
  q?: string;
  includeClosed?: boolean;
  assignedToMe?: boolean;
  pendingReopen?: boolean;
};

export type TicketHistoryFilters = Pick<TicketListFilters, "q" | "assignedToMe"> & {
  page: number;
  pageSize: number;
  priority?: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
};

export type TicketHistoryPage = {
  items: TicketWithDetails[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
