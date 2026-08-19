---
'@byfriends/kosong': patch
'@byfriends/cli': patch
---

修复 DeepSeek Responses 路径下 reasoning 文本被漏读:reasoning 解析在 summary 为空时回退到 content 的 reasoning_text 项(不影响 OpenAI 形态)。
