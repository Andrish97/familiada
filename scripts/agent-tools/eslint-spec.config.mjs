// Lint no-undef dla speców e2e (CommonJS): npx eslint -c scripts/agent-tools/eslint-spec.config.mjs tests/e2e/x.spec.js
import base from "./eslint-undef.config.mjs";
const g = base[0].languageOptions.globals;
export default [{ files: ["**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "commonjs", globals: { ...g, require:"readonly", module:"writable", process:"readonly", __dirname:"readonly", Buffer:"readonly", DOMException:"readonly", setImmediate:"readonly" } }, rules: { "no-undef": "error" } }];
