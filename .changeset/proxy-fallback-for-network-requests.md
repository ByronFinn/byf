---
'@byfriends/agent-core': minor
---

Add automatic proxy fallback for network tool requests (FetchURL, WebSearch, MCP HTTP)

BYF now automatically detects proxy configuration from environment variables (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `SOCKS_PROXY`, `NO_PROXY`) and macOS system proxy settings (`scutil --proxy`). When a direct network request fails with a retryable error (network-level errors or HTTP 403/429/502/503/504), BYF retries through the detected proxy with a 60-second timeout. If no proxy is configured, behavior is unchanged.

Key changes:
- **ProxiedFetch**: A `typeof fetch` wrapper with direct→proxy fallback logic
- **System proxy detection**: macOS `scutil --proxy` parsing for HTTP/HTTPS/SOCKS proxy
- **SOCKS5 support**: Via `undici.ProxyAgent` (no additional dependencies needed)
- **NO_PROXY matching**: Domain suffixes, exact hosts, IPs, and wildcard support
- **MCP HTTP wiring**: ProxiedFetch threaded through `McpConnectionManager` → `HttpMcpClient`
- **60s timeout**: Applied to all network tool requests (previously no timeout)
