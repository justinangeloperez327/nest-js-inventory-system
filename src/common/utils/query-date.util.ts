import { BadRequestException } from '@nestjs/common';

const DATE_ONLY_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

export function parseQueryDate(
  value: string | undefined,
  field = 'date',
): Date | null {
  if (!value) {
    return null;
  }

  const dateOnly =
    DATE_ONLY_PATTERN.test(value);
  const date = new Date(
    dateOnly
      ? value + 'T00:00:00.000Z'
      : value,
  );

  if (
    Number.isNaN(date.getTime()) ||
    (dateOnly &&
      date
        .toISOString()
        .slice(0, 10) !== value)
  ) {
    throw invalidDate(field);
  }

  return date;
}

export function queryDateToExclusive(
  value: string | undefined,
  field = 'dateTo',
): Date | null {
  const date =
    parseQueryDate(value, field);

  if (!date || !value) {
    return null;
  }

  if (DATE_ONLY_PATTERN.test(value)) {
    date.setUTCDate(
      date.getUTCDate() + 1,
    );
    return date;
  }

  return new Date(
    date.getTime() + 1,
  );
}

export function assertQueryDateRange(
  dateFrom: string | undefined,
  dateTo: string | undefined,
): void {
  if (!dateFrom || !dateTo) {
    return;
  }

  const from =
    parseQueryDate(
      dateFrom,
      'dateFrom',
    );
  const to =
    queryDateToExclusive(
      dateTo,
      'dateTo',
    );

  if (from && to && from >= to) {
    throw new BadRequestException({
      code: 'INVALID_DATE_RANGE',
      message:
        'dateFrom must be before or equal to dateTo',
      fields: {
        dateFrom: [
          'Use a date on or before dateTo.',
        ],
        dateTo: [
          'Use a date on or after dateFrom.',
        ],
      },
    });
  }
}

export function parseDateOnlyQuery(
  value: string,
  field: string,
): Date {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new BadRequestException({
      code: 'INVALID_DATE',
      message:
        field +
        ' must use YYYY-MM-DD format',
      fields: {
        [field]: [
          'Use YYYY-MM-DD format.',
        ],
      },
    });
  }

  const date = parseQueryDate(
    value,
    field,
  );

  if (!date) {
    throw invalidDate(field);
  }

  return date;
}

export function dateOnlyToExclusive(
  value: string | undefined,
  field = 'dateTo',
): Date | null {
  if (!value) {
    return null;
  }

  const date =
    parseDateOnlyQuery(
      value,
      field,
    );
  date.setUTCDate(
    date.getUTCDate() + 1,
  );
  return date;
}

export function assertDateOnlyQueryRange(
  dateFrom: string | undefined,
  dateTo: string | undefined,
): void {
  if (!dateFrom || !dateTo) {
    return;
  }

  const from =
    parseDateOnlyQuery(
      dateFrom,
      'dateFrom',
    );
  const to =
    parseDateOnlyQuery(
      dateTo,
      'dateTo',
    );

  if (from > to) {
    throw new BadRequestException({
      code: 'INVALID_DATE_RANGE',
      message:
        'dateFrom must be before or equal to dateTo',
      fields: {
        dateFrom: [
          'Use a date on or before dateTo.',
        ],
        dateTo: [
          'Use a date on or after dateFrom.',
        ],
      },
    });
  }
}

function invalidDate(
  field: string,
): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_DATE',
    message:
      field +
      ' must be a valid date',
    fields: {
      [field]: [
        'Enter a valid date.',
      ],
    },
  });
}
