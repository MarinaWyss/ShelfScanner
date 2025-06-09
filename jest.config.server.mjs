export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/server'],
  testMatch: [
    '**/tests/server/**/simple.test.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/server.setup.ts'],
  coverageDirectory: 'coverage/server',
  coverageReporters: ['text', 'lcov'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 10000,
  verbose: true
}; 