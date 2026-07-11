# Spike: Jimp + `bun build --compile` 兼容性验证

- **关联**：PRD-0022（引擎韧性与图片管线，issue #233）/ AC20
- **日期**：2026-07-12
- **结论**：✅ Jimp 1.6.1 在 `bun build --compile` 下可正常打包与运行，无需回退或换依赖。

## 背景

PRD-0023 引入 `jimp@^1.6.1` 作为图片解码/重编码依赖。CLI 官方分发路径是
`bun build --compile` 产物（见 PRD-0020），因此必须在发版前验证 Jimp 的完整插件树
（`@jimp/core` + `@jimp/js-{png,jpeg,gif,bmp,tiff}` + 各 plugin）能在编译二进制中工作。

Jimp v1 的 decode 全部走纯 JS 实现（`@jimp/js-*`），不依赖 N-API 或原生编解码库，
因此理论上与 compile 兼容；但插件面很宽（约 25 个 `@jimp/*` 子包），需要实测确认。

## 方法

在 `packages/agent-core/`（jimp 的实际安装位置）下放一个最小入口：

```ts
import { Jimp } from 'jimp';
const img = new Jimp({ width: 8, height: 8, color: 0xff0000ff });
const pngBuf = await img.getBuffer('image/png'); // PNG 编码
const read = await Jimp.read(pngBuf); // PNG 解码
const jpegBuf = await read.getBuffer('image/jpeg', { quality: 60 }); // JPEG 重编码
console.log('OK png=' + pngBuf.length + ' jpeg=' + jpegBuf.length);
```

执行 `bun build --compile --outfile=<bin> <entry>`，再运行产物。

## 结果

```
[21ms]  bundle  208 modules
[181ms] compile  /tmp/jimp-smoke-bin
$ /tmp/jimp-smoke-bin
OK png=89 jpeg=615
exit=0
```

- **打包**：208 modules，无 resolve 错误，无外部原生依赖缺失。
- **运行**：PNG 编码 → `Jimp.read` 解码 → JPEG 质量阶梯重编码全部成功。

## 适用范围与后续

- 本次 smoke 覆盖 PNG + JPEG 的 read/getBuffer 路径（生产压缩管线的核心）。
- WebP 在 Jimp v1 无编码支持，设计上已 passthrough；GIF 重编码会丢动画，也
  passthrough——两者不走 Jimp，不受 compile 影响。
- BMP/TIFF 的 Jimp decode 路径未单独 smoke，但共用 `@jimp/core` 的同一 JS decode
  管线，风险等价；如后续发现回归可补。
- jimp 完整插件树约 13MB，编译产物体积增加可接受；如需进一步瘦身，可考虑只拉
  `@jimp/core` + `@jimp/js-png` + `@jimp/js-jpeg` + `@jimp/plugin-resize`（超出
  本 PR 范围）。
