---
'@byfriends/kosong': patch
'@byfriends/cli': patch
---

修复 DeepSeek Responses 流式路径下 reasoning 文本丢失:补 `response.reasoning_text.delta` 事件处理(此前落在默认分支被静默忽略),流式 reasoning 文本现可正常到达。
