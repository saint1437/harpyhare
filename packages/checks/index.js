/**
 * The checks both apps run over their own palette, with the palette itself
 * left as an argument. See `tokens.js` and `contrast.js` for why each exists.
 */
export { checkContrast } from "./contrast.js";
export { checkTokens } from "./tokens.js";

/**
 * Prints a result the way a check script should and returns its exit code, so
 * a script is `process.exit(report(checkTokens({…})))` and nothing more.
 */
export function report(result) {
  if (result.ok) {
    console.log(`✔ ${result.summary}`);
    return 0;
  }
  console.error(`✖ ${result.summary}\n`);
  for (const failure of result.failures) console.error(`  ${failure}`);
  return 1;
}
