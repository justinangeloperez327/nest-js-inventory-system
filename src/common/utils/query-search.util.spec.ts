import { describe, expect, it } from '@jest/globals';

import {
  escapeLikeSearchTerm,
  prismaContainsSearch,
  sqlContainsPattern,
} from './query-search.util.js';

describe('query search utilities', () => {
  it('escapes SQL wildcard characters as literal search text', () => {
    expect(escapeLikeSearchTerm('100%_\\done')).toBe(
      '100\\%\\_\\\\done',
    );
  });

  it('keeps Prisma contains search literal', () => {
    expect(prismaContainsSearch('A_B%')).toBe('A\\_B\\%');
    expect(prismaContainsSearch(undefined)).toBeUndefined();
  });

  it('wraps escaped SQL search text in a contains pattern', () => {
    expect(sqlContainsPattern('A_B%')).toBe('%A\\_B\\%%');
    expect(sqlContainsPattern(undefined)).toBeNull();
  });
});
