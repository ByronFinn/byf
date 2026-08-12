# TypeScript: WeakMap 记忆化与缓存原语选择

> **Stack**: typescript@6.0.2 | **Major**: 6 | **Verified**: 2026-08-12 | **Status**: verified

## TL;DR

对**对象键**的计算结果记忆化,用 `WeakMap<object, T>`——ECMA-262 §24.3 规定 key 弱引用、key 被 GC 后 entry 自动回收,MDN 明确将「Caching 纯函数结果」列为官方推荐用途;当变更模式是「替换为新对象」而非「原地修改」时,**对象身份键控自动失效、零维护代码**。对**原始值键(字符串)**,WeakMap 不接受(仅 object / 非 registered symbol),改用 `Map<string, T>`——纯函数保证永远正确,唯一代价是强引用导致缓存不随源数据 GC,需按 live-data 上界评估或主动清理。

## Question

在 TypeScript(ECMA-262 运行时,如 Bun/JSC)中,为一个**纯函数计算值**(如 token 估算)做记忆化时,key 可能是可变对象(Message)或原始值字符串(text),应分别选择什么缓存原语,失效策略如何设计?

## Approach

阅读 ECMA-262(2027 草案)§24.3 Keyed Collections 关于 WeakMap 的规范性定义,交叉比对 MDN(Mozilla 维护)对 WeakMap 的「Caching」用例说明与示例代码,验证:(1) key 类型约束、(2) 弱引用语义、(3) entry 生命周期、(4) 官方推荐用途。再验证原始值(string)不能作为 WeakMap key 的约束,推导出 primitive-keyed 场景必须回退到 `Map` 并自行管理生命周期。

## Findings

| 原语                           | key 类型                                   | 引用强度                 | 失效方式                                                | 适用场景                                                      |
| ------------------------------ | ------------------------------------------ | ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------- |
| `WeakMap<object \| symbol, T>` | 仅 object 与非 registered symbol(ECMA-262) | 弱引用(不阻止 key 被 GC) | key 不可达时 entry 自动被 GC 回收,无需手动删除          | 对象键的记忆化;变更模式为「替换为新对象」时零维护             |
| `Map<string, T>`               | 任意值(含原始值)                           | 强引用(阻止 key 被 GC)   | 必须手动 `delete` 或清空;不清理则随 unique key 单调增长 | 原始值(字符串)键的纯函数记忆化;live unique key 有上界时可接受 |
| 对象上挂字段 `_cache?: T`      | 任意                                       | 与对象同生命周期         | 对象 GC 时字段自然消失                                  | 同一所有权域内的对象;会污染对象 shape / 枚举                  |

**WeakMap 失效的两种变更模式**:

| 变更模式                                                            | WeakMap 行为                                                  | 是否需要显式失效       |
| ------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------- |
| **替换为新对象**(`state.history[i] = {...message, content: [...]}`) | 旧对象不可达 → entry 自动 GC;新对象 WeakMap miss → 重算后缓存 | **否**——自动失效       |
| **原地修改**(`message.content.push(part)`,身份不变)                 | WeakMap 仍命中**旧值**(stale!)                                | **是**——必须删除或排除 |

**关键约束(原始值不能做 WeakMap key)**:ECMA-262 规定 WeakMap key「must be objects or non-registered symbols」。字符串、数字等原始值不是合法 key——`new WeakMap().set('foo', 1)` 抛 `TypeError`。因此对 `estimateTokens(text: string)` 这类**原始值输入的纯函数**,只能用 `Map<string, number>`,并接受强引用增长(或自行 LRU / 周期清理)。

## Verdict & Rationale

- **对象键(Message)→ `WeakMap<Message, number>`**:ECMA-262 §24.3 与 MDN 均确认 WeakMap 是「关联数据到对象而不阻止其 GC」的规范原语,且 MDN 把「Caching the results of expensive, pure functions based on an object input」列为示例用途。当应用层变更模式是「替换为新对象」(reassign `arr[i] = newObj`)而非「原地改字段」时,旧对象自然不可达、entry 自动回收,**不需要写任何失效代码**——这是 WeakMap 相比 Map / 挂字段的核心优势。
- **原始值键(string text)→ `Map<string, number>`**:纯函数(同输入恒同输出)保证缓存永远语义正确;强引用的唯一风险是 unique key 无界增长,但当 unique 输入受 live-data 上界约束(如会话历史内的文本片段总数有上限)时,增长可控且可忽略。若需严格上界,在已知的数据收缩点(如压缩完成)一次性 `.clear()` 即可。

## Boundary Conditions

- **运行时语义由 JS 引擎定义,非 TS 编译器**:WeakMap / Map 行为由 ECMA-262 与具体引擎(V8 / JSC)实现,与 TypeScript 编译版本无关;TS 仅提供类型。本项目运行时为 Bun(JSC),`engines.bun ≥ 1.3.14`。
- **symbols as WeakMap keys**:ES2023 起非 registered symbol 可做 WeakMap key(ECMA-262 已合并);本项目 TS 6.0.2 target 远高于此,可用。但对本场景无实际意义(key 是 Message 对象)。
- **不可枚举性**:WeakMap 不可遍历 / 不可查 size——无法做「清空全部」「统计命中数」;调试需另挂计数器。这是规范的固有约束,非缺陷。
- **原地修改是陷阱**:若对象身份不变但内容被改(如流式 append),WeakMap 返回 stale 值。必须用 `partial` 标志排除未冻结对象,或在变更点显式 `delete`。
- **Map<string> 的字符串哈希**:引擎(V8/JSC)对字符串哈希做惰性计算并缓存于字符串对象上;对**同一字符串对象**的重复 `Map.get` 是 O(1)。但对 `JSON.stringify` 每次产生的新字符串,首次哈希仍 O(n)——primitive-keyed 缓存对「每次重新序列化」的输入,省的是「计算」而非「哈希」。

## Sources

**Tier 1(maintainer-authored, required)**

- [ECMA-262® 2027 Language Specification — Keyed Collections (§24.3 WeakMap)](https://tc39.es/ecma262/multipage/keyed-collections.html#sec-weakmap-objects) — WeakMap key 必须为 object 或非 registered symbol、弱引用、key 不可达时 entry 可被 GC
- [MDN Web Docs — WeakMap](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap) — Mozilla 维护;明确列出 Caching 为推荐用途并给出 `cache.has(obj) → cache.set(obj, heavyComputation)` 示例;key 按对象身份比较(`compared by reference, not by value`)

**Tier 2(supplementary only, never sole evidence)**

- [TC39 proposal: Symbols as WeakMap keys(已并入 ES2023)](https://github.com/tc39/proposal-symbols-as-weakmap-keys) — 非 registered symbol 可做 WeakMap key 的合并提案
