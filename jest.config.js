module.exports = {
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'mjs'],
    testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.mjs'],
    setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
    transform: {},
  };
  