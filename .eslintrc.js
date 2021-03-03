module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module'
  },
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    'prettier/prettier': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_+$'}],
    '@typescript-eslint/no-use-before-define': [
      'error',
      {functions: false, classes: true}
    ],
    '@typescript-eslint/ban-ts-comment': ['warn', {'ts-expect-error': false}]
  }
};
