import { describe, expect, it } from '@jest/globals';

import type { PaginationQueryDto } from '../dto/pagination-query.dto.js';
import {
  createPaginationMeta,
  toPaginatedResult,
  toPaginationWindow,
} from './pagination.util.js';

describe('pagination utilities', () => {
  const query = {
    page: 3,
    pageSize: 25,
  } as PaginationQueryDto;

  it('converts a page into a stable Prisma window', () => {
    expect(toPaginationWindow(query)).toEqual({
      skip: 50,
      take: 25,
    });
  });

  it('calculates page metadata including partial final pages', () => {
    expect(createPaginationMeta(query, 51)).toEqual({
      page: 3,
      pageSize: 25,
      totalItems: 51,
      totalPages: 3,
    });
  });

  it('returns zero pages for an empty result set', () => {
    expect(createPaginationMeta(query, 0).totalPages).toBe(0);
  });

  it('wraps data and metadata in the public pagination contract', () => {
    const result = toPaginatedResult(['one', 'two'], 51, query);

    expect(result.data).toEqual(['one', 'two']);
    expect(result.pagination.totalPages).toBe(3);
  });
});
