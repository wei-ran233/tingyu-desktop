# 插件可选依赖与冲突 SDK 1.9

[插件 SDK 索引](README.md) · [运行时 SDK 1.3](插件运行时与功能增强SDK-1.3.md)

本协议在 API `1.9.0` 引入；包的 `version`、宿主最低 `apiVersion` 与扩展点 `version` 各自独立。已有必需依赖、processor/provider/action/event 和受限 UI 契约继续适用。

## 声明

```json
{
  "id": "example.enhancer",
  "apiVersion": "1.9.0",
  "dependencies": [{ "id": "example.core", "minVersion": "1.0.0" }],
  "optionalDependencies": [
    { "id": "example.search", "minVersion": "1.0.0", "maxVersionExclusive": "2.0.0" }
  ],
  "conflicts": [{ "id": "example.legacy", "maxVersionExclusive": "3.0.0" }],
  "extensions": [
    { "id": "normalize", "target": "example.search/query", "version": "1.0.0", "handler": "normalize" }
  ]
}
```

这里只展示关系字段，实际包还必须有入口、权限、签名等完整字段。各关系最多 32 项，只接受 `id`、`minVersion`、`maxVersionExclusive`；最小版本包含，最大版本不包含，忽略构建元数据并按 SemVer 优先级比较预发布版本。禁止自身、同类重复及三类之间重复 ID；空数组也需要 API1.9。符合合法版本语法的旧包无需补字段或重新签名；包版本及关系范围均要求有界严格SemVer，曾被宽松解析误接受的非法版本需要修正。

`extensions.target` 的拥有者必须在必需或可选依赖中声明，不能通过冲突声明获得调用关系。每项扩展仍需原有运行时、权限与扩展点精确版本。

## 核心与集成

| 情形 | A 的核心 | A 对 B 的集成 |
| --- | --- | --- |
| 必需 B 缺失、范围不符或不可用 | 阻塞，A 的必需依赖者也受影响 | 不接入 |
| 可选 B 缺失、范围不符、停用或失败 | 继续运行 | 撤下，并给出原因 |
| B 活跃且版本、扩展点和权限匹配 | 继续运行 | 自动接入 |
| 可选 B 更新或卸载 | 保持原实例 | 旧请求取消，依据新目录重新检查 |
| 可选 B 恢复或回滚到兼容版本 | 保持原实例 | 自动重新接入 |
| 可选 B 目标中的任一声明扩展不匹配 | 继续运行 | 该拥有者的整组集成不接入 |

可选依赖只控制**已有声明式扩展贡献**；不提供任意对象访问、额外权限、跨插件私有 IPC 或自定义连接钩子。只声明可选依赖但没有扩展时，状态表示目标就绪与包版本匹配，不产生额外调用能力。核心 `activate` 不等待可选依赖，不能假定它已启动；不要在核心激活阶段依赖可选集成结果。

可选边不参与拓扑排序，双方可选依赖成环时，核心按稳定顺序启动，双方就绪后贡献可用。必需边仍参与排序，纯必需循环继续阻塞。核心/集成状态由宿主目录反映，`optionalDependencyStates` 是宿主生成的只读结果，不能写进清单覆盖。

请求绑定拥有者与贡献者的当前实例及设置快照。B 撤销时取消在途调用，晚结果不能提交；A 的其他集成与独立运行时继续。A 自己执行处理器/订阅器时返回非法结果、超时或崩溃，仍沿用原有运行时隔离与显式重试规则。

## 冲突

任一方声明的冲突范围命中对方包版本，且双方都启用并兼容时，宿主同时阻塞双方及其必需依赖者。单向声明即可生效，安装先后顺序不决定赢家；宿主保留两个启用开关，不自动停用或卸载任何一方。关闭其中一个即可恢复另一个；升级到范围之外也解除冲突。已启用且兼容的声明者即使因其他必需依赖受阻，仍参与冲突判断，避免循环选择与结果振荡。

## 可见状态与安装

`PluginPublicInfo` 增加原始关系数组及 `optionalDependencyStates: { id, available, reason? }[]`。只有 A 核心活跃、B 活跃且这一组声明扩展通过检查时，`available` 才为 true；可选状态失败不等于 A 的 `available=false`。设置页展示范围和未接入原因，管理页展示可选状态与冲突声明。安装确认展示三类关系；完整升级影响分析属于后续 E6。

安装预览仍以包哈希与一次性确认令牌绑定已检查内容，关系字段同样受包签名保护。该版本不新增用户授权范围。

## 实现与复现

权威入口为 [类型](../../src/common/plugin/types.ts)、[清单校验](../../src/common/plugin/security.ts)、[依赖解析](../../src/common/plugin/dependencies.ts)、[生命周期](../../src/main/modules/plugin/lifecycle.ts) 和 [服务目录](../../src/main/modules/plugin/service.ts)。

执行 `npm run test:collection` 验证契约与生命周期，生产构建后执行 `npm run test:plugin-optional:app` 验证真实签名安装、隔离运行时和 Vue 状态。实机脚本使用临时 profile，可用 `LX_PLUGIN_OPTIONAL_EVIDENCE_DIR` 指定新的证据目录。实际结果与剩余工作见 [本轮验收](../records/插件可选依赖与冲突实现与验收-2026-10-22.md)。
