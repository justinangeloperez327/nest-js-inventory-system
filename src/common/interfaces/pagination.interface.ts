export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export class PaginatedResult<T> {
  constructor(
    public readonly data: T[],
    public readonly pagination: PaginationMeta,
  ) {}
}

export interface PaginationWindow {
  skip: number;
  take: number;
}
