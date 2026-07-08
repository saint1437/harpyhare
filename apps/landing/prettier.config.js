/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  singleQuote: false,
  semi: true,
  trailingComma: "all",
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./src/index.css",
  tailwindFunctions: ["cn", "cva"],
};
