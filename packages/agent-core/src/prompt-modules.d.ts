// Raw-string imports for prompt sources. The bunfig.toml `[loader]` section
// (plus the matching loader in bun-lib-build.mjs) loads `.md` / `.yaml` files
// as their string content.

declare module '*.md' {
  const content: string;
  export default content;
}

declare module '*.yaml' {
  const content: string;
  export default content;
}
