---
'@byfriends/cli': patch
'@byfriends/kosong': patch
'@byfriends/agent-core': patch
---

增强 provider 故障韧性：HTTP 529 (provider overloaded) 纳入自动重试；解析 Retry-After 响应头并以服务端要求的等待时间覆盖本地退避（并设上限，避免恶意/异常值挂死当前回合），避免过早重试触发二次限流。
