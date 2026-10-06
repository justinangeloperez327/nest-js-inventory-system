export function escapeLikeSearchTerm(
  value: string,
): string {
  return value.replace(
    /[\\%_]/g,
    '\\$&',
  );
}

export function prismaContainsSearch(
  value: string | undefined,
): string | undefined {
  return value
    ? escapeLikeSearchTerm(value)
    : undefined;
}

export function sqlContainsPattern(
  value: string | undefined,
): string | null {
  return value
    ? '%' +
        escapeLikeSearchTerm(value) +
        '%'
    : null;
}
