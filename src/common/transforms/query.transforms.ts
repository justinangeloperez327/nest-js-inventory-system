import { Transform } from 'class-transformer';

function rawQueryValue(
  value: unknown,
  object: unknown,
  key: string | symbol | undefined,
): unknown {
  if (
    object &&
    typeof object === 'object' &&
    key !== undefined
  ) {
    const source =
      object as Record<
        string | symbol,
        unknown
      >;

    if (key in source) {
      return source[key];
    }
  }

  return value;
}

function trimString(value: unknown): unknown {
  return typeof value === 'string'
    ? value.trim()
    : value;
}

export function TrimQueryString() {
  return Transform(
    ({ value, obj, key }) =>
      trimString(
        rawQueryValue(
          value,
          obj,
          key,
        ),
      ),
  );
}

export function OptionalTrimQueryString() {
  return Transform(
    ({ value, obj, key }) => {
      const trimmed = trimString(
        rawQueryValue(
          value,
          obj,
          key,
        ),
      );

      return trimmed === ''
        ? undefined
        : trimmed;
    },
  );
}

export function StrictIntegerQuery() {
  return Transform(
    ({ value, obj, key }) => {
      const raw = rawQueryValue(
        value,
        obj,
        key,
      );

      if (
        typeof raw === 'number' &&
        Number.isInteger(raw)
      ) {
        return raw;
      }

      if (
        typeof raw === 'string' &&
        /^\d+$/.test(raw.trim())
      ) {
        return Number(raw.trim());
      }

      return raw;
    },
  );
}

export function BooleanQuery() {
  return Transform(
    ({ value, obj, key }) => {
      const raw = rawQueryValue(
        value,
        obj,
        key,
      );

      if (
        raw === true ||
        raw === false
      ) {
        return raw;
      }

      if (typeof raw !== 'string') {
        return raw;
      }

      const normalized =
        raw.trim();

      if (normalized === 'true') {
        return true;
      }

      if (normalized === 'false') {
        return false;
      }

      return raw;
    },
  );
}
