# 插件事件扩展 SDK 1.6

[SDK 索引](README.md) · [实施计划](../plans/插件事件扩展实现计划-2026-10-21.md)

API 1.6.0 在 processor/provider/action 之外新增声明式 event。原有 API 和签名载荷兼容。事件用于向依赖方通知已发生的变化，不提供历史重放、持久化、事务回滚或恰好一次保证。

## 拥有者声明与发布

拥有者 B 声明 `events.publish` 权限和 event 扩展点。input 是已有有界 schema；output 必须为无属性 object，订阅 handler 用 `{}` 确认处理完成。

```json
{
  "apiVersion": "1.6.0",
  "permissions": ["events.publish"],
  "extensionPoints": [{
    "id": "changed",
    "version": "1.0.0",
    "kind": "event",
    "input": { "type": "object", "properties": { "text": { "type": "string", "maxLength": 100 } } },
    "output": { "type": "object", "properties": {} }
  }]
}
```

这是清单片段，完整清单仍需 id、name、version、main、runtime 与签名等基础字段。B 的隔离运行时 handler 接收的 context 新增：

```js
const receipt = await context.publishEvent('example.owner/changed', { text: 'new value' })
// receipt: { delivered: number, failed: number, skipped: number }
```

只能在当前拥有者 active 后发布自己的 event 点。activate 期间发布会拒绝。桥接在主进程绑定真实 runtime sender、主 frame 和生命周期 signal；插件不能传入另一个发布者 ID，也不能借已停止实例向同 ID 的新实例发布。

需要快速返回的 action 可在处理自身业务后发送通知，不等待订阅完成，但必须处理 Promise 拒绝。搜索灵感样例在换组后发送 `lx.search-starters/suggestions.changed`，payload 是 `{ suggestions: string[] }`，最多12项，每项100字。该样例默认关闭；不读取历史、歌单或凭据。

## 订阅者声明

订阅者 A 声明对 B 的必需依赖和 `extensions.subscribe` 权限，使用既有 extensions 数组绑定 handler：

```json
{
  "apiVersion": "1.6.0",
  "permissions": ["extensions.subscribe"],
  "dependencies": [{ "id": "example.owner", "minVersion": "1.0.0", "maxVersionExclusive": "2.0.0" }],
  "runtime": { "entry": "runtime.html" },
  "extensions": [{ "id": "observe-change", "target": "example.owner/changed", "version": "1.0.0", "handler": "changed" }]
}
```

```js
window.lxRuntime.start({
  handlers: {
    changed: (value, context) => {
      if (context.isCancelled()) return {}
      // Update this plugin's own state; no host object or other plugin memory.
      document.body.dataset.latest = value.text
      return {}
    },
  },
})
```

订阅属于声明式生命周期贡献，不需要动态 subscribe/unsubscribe。依赖/点版本/权限不匹配时 A 阻塞；停用、更新或失败后贡献立即失效。关闭后再启用只接收后续事件。每个 handler 得到独立数据副本，不能修改其他订阅者的数据。

## 顺序、容量与失败

- 每个发布者按发布顺序执行事件；同一事件向发布时 active 的所有订阅贡献并行投递，不使用 priority 选择单一接收者。一次事件执行完毕后才执行该发布者的下一次事件。
- 单发布者最多16个在途事件，包含执行中和排队；全局最多64个。一次最多64个订阅贡献。超限拒绝 `PluginRuntimeBusyError`，不自动重试或隔离。
- payload 必须是 schema 匹配的普通 JSON 数据，拒绝 Date、Map、Set、ArrayBuffer、访问器、隐藏字段或 symbol；确认结果必须是普通空对象。payload 的 JSON 大小最多64KiB；桥接消息整体也受64KiB限制，因此通过桥接发送时需为信封留出空间。schema 仍限制数据深度、数组长度和字符串长度。
- 单个 handler 最多2秒，必须返回 `{}`。异常、超时、非法 ack 隔离故障订阅者及其依赖链；健康订阅者继续投递。运行时繁忙或贡献已撤销记 skipped。
- delivered/failed/skipped 按订阅贡献计数，一个插件声明两个订阅会计作两项。无订阅时返回三个0。failed 不导致发布者自动隔离，发布者可决定如何显示或记录 receipt。
- 拥有者停用、替换或相关参数变化使排队与在途事件拒绝；订阅者停用、替换或相关参数变化使该次订阅跳过。发布后才激活的订阅者不接收旧事件；旧订阅的替代实例也不接收旧事件。
- 发布 Promise 被取消或投递超时不回滚已完成的插件副作用。handler 应检查 context 的取消状态并清理自己的异步资源；公共发布桥不携带页面级 AbortSignal。

runtime 仍无 Node、任意 IPC、外网、弹窗或跨插件资源能力。普通隔离页面没有事件发布接口；宿主设置通知、目录变更和生命周期诊断 events 不因此成为公共插件频道。

## 验证入口

`npm run test:collection` 接入事件契约检查，`npm run test:plugin-events:app` 使用一次性 profile、临时签名包与当前生产构建验证真实隔离桥。应用证据目录可用 `LX_PLUGIN_EVENTS_EVIDENCE_DIR` 指定。实际结果与边界见[本轮实施记录](../records/插件事件扩展实现与验收-2026-10-21.md)。
