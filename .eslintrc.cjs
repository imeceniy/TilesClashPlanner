module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  env: { browser: true, es2022: true, node: true },
  ignorePatterns: ["dist/", "vendor/", "Map example/"],
  rules: { "@typescript-eslint/no-explicit-any": "error", "@typescript-eslint/no-non-null-assertion": "off" },
};
