import "server-only";
import { PAGE_SIZE } from "@/lib/validation/admin";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

export function paginationArgs(page: number, pageSize = PAGE_SIZE) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(items: T[], total: number, page: number, pageSize = PAGE_SIZE): Paginated<T> {
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export function activeFilter(status: "active" | "inactive" | "all") {
  return status === "all" ? {} : { active: status === "active" };
}
