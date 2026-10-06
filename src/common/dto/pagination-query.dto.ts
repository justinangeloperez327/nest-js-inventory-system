import { IsInt, Max, Min } from 'class-validator';

import { StrictIntegerQuery } from '../transforms/query.transforms.js';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE_NUMBER =
  1_000_000;

export class PaginationQueryDto {
  @StrictIntegerQuery()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_NUMBER)
  page = 1;

  @StrictIntegerQuery()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize = DEFAULT_PAGE_SIZE;
}
