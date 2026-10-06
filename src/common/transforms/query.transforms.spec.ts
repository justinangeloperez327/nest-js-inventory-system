import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  validate,
} from 'class-validator';
import { describe, expect, it } from '@jest/globals';

import { PaginationQueryDto } from '../dto/pagination-query.dto.js';
import {
  BooleanQuery,
  OptionalTrimQueryString,
} from './query.transforms.js';

class FilterQueryDto {
  @BooleanQuery()
  @IsBoolean()
  active!: boolean;

  @OptionalTrimQueryString()
  @IsOptional()
  @IsString()
  search?: string;
}

describe('query transforms', () => {
  it('accepts decimal integer query text for pagination', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      page: ' 2 ',
      pageSize: '100',
    });

    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(100);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('does not coerce scientific notation into a page number', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      page: '1e2',
    });

    expect(dto.page).toBe('1e2');
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('does not collapse repeated query parameters into one value', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      page: ['1', '2'],
    });

    expect(dto.page).toEqual(['1', '2']);
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('parses only exact true and false boolean query text', async () => {
    const valid = plainToInstance(FilterQueryDto, {
      active: 'true',
      search: '  stock  ',
    });
    const invalid = plainToInstance(FilterQueryDto, {
      active: 'TRUE',
      search: '   ',
    });

    expect(valid.active).toBe(true);
    expect(valid.search).toBe('stock');
    await expect(validate(valid)).resolves.toHaveLength(0);

    expect(invalid.active).toBe('TRUE');
    expect(invalid.search).toBeUndefined();
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
