/* eslint-env node */

// eslint-disable-next-line no-undef
module.exports = {
  env: {
    node: true,
    commonjs: true
  },
  rules: {
    "no-undef": "off",
    "no-unused-vars": ["warn", { 
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }],
    "@typescript-eslint/no-unused-vars": "off",
    "no-console": "off"
  },
  parserOptions: {
    sourceType: "script"
  }
}; 