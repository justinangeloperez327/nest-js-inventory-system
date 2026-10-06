/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        sourceMaps: 'inline',
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true,
          },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
          target: 'es2023',
        },
        module: {
          type: 'commonjs',
        },
      },
    ],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/generated/**',
    '!src/**/*.module.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.types.ts',
  ],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
};
