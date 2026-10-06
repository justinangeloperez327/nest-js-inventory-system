import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';

import {
  assertDateOnlyQueryRange,
  assertQueryDateRange,
  dateOnlyToExclusive,
  parseDateOnlyQuery,
  parseQueryDate,
  queryDateToExclusive,
} from './query-date.util.js';

describe('query date utilities', () => {
  it('accepts real calendar dates including leap days', () => {
    expect(parseQueryDate('2024-02-29')?.toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });

  it('rejects impossible calendar dates instead of normalizing them', () => {
    expect(() => parseQueryDate('2026-02-29')).toThrow(
      BadRequestException,
    );
  });

  it('converts a date-only upper bound to the next day', () => {
    expect(queryDateToExclusive('2026-10-06')?.toISOString()).toBe(
      '2026-10-07T00:00:00.000Z',
    );
    expect(dateOnlyToExclusive('2026-10-06')?.toISOString()).toBe(
      '2026-10-07T00:00:00.000Z',
    );
  });

  it('makes timestamp upper bounds exclusive by one millisecond', () => {
    expect(
      queryDateToExclusive('2026-10-06T12:00:00.000Z')?.toISOString(),
    ).toBe('2026-10-06T12:00:00.001Z');
  });

  it('rejects reversed general date ranges', () => {
    expect(() =>
      assertQueryDateRange('2026-10-07', '2026-10-06'),
    ).toThrow(BadRequestException);
  });

  it('allows equal date-only range bounds', () => {
    expect(() =>
      assertDateOnlyQueryRange('2026-10-06', '2026-10-06'),
    ).not.toThrow();
  });

  it('requires strict YYYY-MM-DD values for business dates', () => {
    expect(() =>
      parseDateOnlyQuery(
        '2026-10-06T12:00:00Z',
        'orderDate',
      ),
    ).toThrow(BadRequestException);
  });
});
