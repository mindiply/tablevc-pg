module.exports = {
  // collectCoverage: true,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'jsx', 'node'],
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  // testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  globals: {}
};
