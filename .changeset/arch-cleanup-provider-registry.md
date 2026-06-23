---
'@byfriends/agent-core': minor
---

refactor: replace web-search provider self-registration with explicit `registerBuiltinWebSearchProviders()`

The Exa, Brave, and Firecrawl provider modules previously called
`registerProvider(...)` at module load as an import side effect, and
`core-impl.ts` triggered registration via three `import '#/tools/providers/{exa,brave,firecrawl}'`
side-effect imports. This made provider availability depend on import
order and hid the registration surface.

Now each provider module exports only its class, and
`registerBuiltinWebSearchProviders()` in `registry.ts` registers all
three explicitly. `core-impl.ts` calls it once at module load.
Order-independent and discoverable from a single location. The new
`registerBuiltinWebSearchProviders` is exported as public API for
callers that bootstrap a custom core.
