# 插件动作扩展 SDK 1.5

API 1.5.0 在 processor、provider 之上增加通用 action。processor 按顺序变换数据，provider 选择一个实现读取数据；action 由宿主明确选择某个实现后执行一次操作。旧 API 包继续兼容，旧签名载荷不补入新字段。

## 声明和权限

拥有者 B 声明 `extensionPoints`，字段包含 `id`、精确 `version`、`kind: "action"`、有界 `input` 和 `output` schema。实现者 A 需要声明：

- `apiVersion: "1.5.0"`、`runtime.entry` 和 `extensions.act` 权限。
- 对 B 的必需 `dependencies`，可限定 B 的包版本。
- `extensions` 中的 `id`、`target: "B的ID/扩展点ID"`、扩展点 `version`、`handler`；可选 `title` 和 `priority`。

`title` 是非空、最多 80 字符的普通文本，仅作标签，不解析 HTML。未声明时使用插件名。API 1.4 及更旧的清单不能声明 action 权限、action 点或 title。

B 激活完成后 A 才能激活；依赖缺失、停用、失败、权限不足或点版本不匹配会阻塞 A。A 停止和释放后才停止 B，依赖顺序与展示排序分别管理。

## 宿主调用

```ts
const actions = lifecycle.listActions('B/next')
// [{ id: 'A/next-set', title: '换一组', pluginId: 'A', pluginName: '搜索灵感' }]
const output = await lifecycle.act('B/next', 'A/next-set', input, signal)
```

列表只包含 active 拥有者下 active 的实现，读取列表不会调用 handler。列表按 priority 升序、插件 ID、扩展 ID 稳定排序；这些字段只影响展示次序。执行必须提供精确的 `pluginId/extensionId`，并验证该实现属于指定 target。缺失、已停用或跨目标的 ID 会拒绝，不自动选中其他实现。

动作没有自动重试，也没有同次或下次请求中的隐式替代执行；用户再次执行相同 ID 时，该实现仍须可用。同一个 target/action 在途最多一次，多余调用立即返回 busy；busy 不隔离健康插件，完成或取消后释放容量。不同动作可以并行，仍受运行时每插件 16 槽位限制。

输入、输出都按既有 schema 校验和复制。动作最多等待 2 秒；初始化失败、崩溃、超时或非法输出隔离对应运行实例，用户可在设置里显式重试。动作失败不会执行其他动作。目录变化只影响可用列表，不触发动作。

## 取消与副作用

handler 接收本插件设置快照、`context.isCancelled()` 和 `context.onCancel(callback)`。相关设置变化、实例替换、参与者停用或拥有者停止会取消请求，拒绝迟到结果；无关插件变化不影响它。设置变化保持健康运行实例，由后续请求读取新快照。

**取消只撤销请求结果并通知运行时，不承诺回滚已经完成的状态变化。** handler 应主动停止可取消工作，不应把取消解释成“操作从未发生”。当前没有事务、幂等键、持久操作确认或跨插件状态回滚协议；涉及不可逆操作的后续扩展必须先补齐相应契约。搜索页面切换或隐藏会忽略旧结果；宿主 IPC 当前未提供页面级 AbortSignal 通道。

动作运行在签名包的独立沙箱，没有 Node、任意 IPC、外部网络、弹窗或跨插件资源权限。当前只由宿主内部调用 action；隔离插件页面和 runtime 没有任意调用别的插件 action 的公共 API。

## 搜索灵感试点

官方功能包公开 `lx.official-suite/search.suggestions.next@1.0.0`：

- 输入 `{source: string}`，最多 32 字符。
- 输出 `{suggestions: string[]}`，最多 12 项，每项最多 100 字符。
- 宿主白名单 IPC 为 `plugin_search_actions` 和 `plugin_run_search_action`，只接受宿主窗口发送。

默认关闭的 `lx.search-starters` 同时提供读取数据的 `suggest` 与动作 `next`。统一设置提供 `queries`（分号或换行分隔）和 `pageSize`（每组 1–12 项）。最多保留 64 个去重搜索词，默认 8 词、每组 4 词；“换一组”循环切换分组。读取、重绘或切换主题保持当前分组；搜索词或分组大小变化后回到第一组。重启或重新启用会重新创建运行实例，分组从第一组开始，不持久化这个临时状态。

共享搜索功能模型负责动作 busy、错误和旧响应保护；原版与潮汐等页面组件只显示相同的数据和按钮。连续点击在 UI 和宿主调度器两处限流，出错显示可读消息；已有手动搜索、热搜和历史搜索继续可用。插件禁用时移除按钮，恢复默认参数时实时显示默认第一组。

## 后续边界

本阶段实现 processor、provider、action 三类数据/行为扩展。通用 event、动态 renderer/slot/toolbar 注册、动态主题 assets/layout/motion、可选依赖、配置迁移与凭据存储仍待实施。不能将本阶段称为所有功能均可任意扩展。
