module.exports = {
  // collectCoverage: true,
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  // testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  globals: {}
};
