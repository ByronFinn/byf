---
'@byfriends/cli': patch
'@byfriends/agent-core': patch
---

为 ReadMediaFile 增加图片摄入管线：不支持的格式 (HEIC/AVIF/BMP/TIFF/ICO 等) 在进入对话前被拒绝并给出转换提示；大图在发送前自动压缩 (最长边 2000px、JPEG 质量阶梯) 并缓存原图供回读，降低 token 与上下文消耗。
