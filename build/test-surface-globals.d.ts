/**
 * Ambient module declarations for the test-surface TypeScript project.
 *
 * `tsconfig.test.json` compiles client tests, and tsc follows their edges into
 * apps/web/client/src. Those sources import stylesheets, which Vite resolves at
 * build time and types via `vite/client` — but `vite` is only installed in the
 * client workspace, so adding it to the root project's `types` makes tsc fail to
 * resolve it instead. Declaring the shapes here keeps the test surface honest
 * without duplicating the whole Vite client type set.
 *
 * Same role as packages/agent-core/src/prompt-modules.d.ts, which this project
 * also includes defensively.
 */

// Order matters: two wildcard patterns that both consume the whole candidate name
// tie on specificity, and tsc keeps the first declaration it sees. `*.module.css`
// must precede `*.css` or `styles['local']` resolves against the string shape and
// reports TS7015. `vite/client` declares them in this order for the same reason.

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css' {
  const css: string;
  export default css;
}
