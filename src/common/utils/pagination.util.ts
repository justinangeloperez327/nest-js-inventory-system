import type { PaginationQueryDto } from '../dto/pagination-query.dto.js';
import {
  PaginatedResult,
  type PaginationMeta,
  type PaginationWindow,
} from '../interfaces/pagination.interface.js';

export function toPaginationWindow(
  query: PaginationQueryDto,
): PaginationWindow {
  return {
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export function createPaginationMeta(
  query: PaginationQueryDto,
  total: number,
): PaginationMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
}

export function toPaginatedResult<T>(
  data: T[],
  total: number,
  query: PaginationQueryDto,
): PaginatedResult<T> {
  return new PaginatedResult(data, createPaginationMeta(query, total));
}
