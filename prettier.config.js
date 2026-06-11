/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  singleQuote: false,
  semi: true,
  trailingComma: "all",
  plugins: ["prettier-plugin-tailwindcss"],
  // Tailwind v4 использует CSS-first конфиг — указываем входной стиль для сортировки классов.
  tailwindStylesheet: "./src/index.css",
  tailwindFunctions: ["cn", "cva"],
};
