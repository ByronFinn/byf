// Raw-string imports for prompt sources. The bunfig.toml `[loader]` section
// loads `.md` / `.yaml` files as their string content.

declare module '*.md' {
  const content: string;
  export default content;
}

declare module '*.yaml' {
  const content: string;
  export default content;
}
