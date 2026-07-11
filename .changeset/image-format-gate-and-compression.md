---
'@byfriends/cli': minor
'@byfriends/agent-core': minor
---

为 ReadMediaFile 增加图片摄入管线：不支持的格式 (HEIC/AVIF/BMP/TIFF/ICO 等) 在进入对话前被拒绝并给出转换提示（以文件实际字节为准，防止扩展名欺骗）；大图在发送前自动压缩 (最长边 2000px、JPEG 质量阶梯) 并缓存原图供回读，降低 token 与上下文消耗；压缩遇炸弹/解码失败时改为拒绝而非继续发送原图。原图缓存随会话目录清理。
