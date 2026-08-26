import tailwind from "@harpyhare/prettier-config/tailwind";

/** @type {import("prettier").Config} */
export default { ...tailwind, tailwindStylesheet: "./src/app/globals.css" };
