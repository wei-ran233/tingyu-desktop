# 插件 SDK 与扩展契约

[返回文档总索引](../README.md) · [插件样例](../../plugin-samples/README.md)

当前 [PLUGIN_API_VERSION](../../src/common/plugin/types.ts) 为 **1.12.0**。这些文档是逐版增量说明，开发者应先理解运行时，再选择 provider、action、event 或声明式 UI。旧版“尚未开放”的描述属于当时范围；当前能力由最新类型、校验器及调用点共同确认。

## 阅读顺序

| 顺序 | 文档 | 重点 |
| --- | --- | --- |
| 1 | [运行时与功能增强 SDK 1.3](插件运行时与功能增强SDK-1.3.md) | 清单、依赖、设置、隔离运行时与 processor |
| 2 | [数据提供器 SDK 1.4](插件数据提供器SDK-1.4.md) | provider 选择、输入输出、设置快照与请求一致性 |
| 3 | [动作扩展 SDK 1.5](插件动作扩展SDK-1.5.md) | 显式动作选择、权限、取消及副作用边界 |
| 4 | [事件扩展 SDK 1.6](插件事件扩展SDK-1.6.md) | 拥有者发布、声明订阅、顺序、背压与生命周期撤销 |
| 5 | [声明式 UI SDK 1.7](插件声明式UI扩展SDK-1.7.md) | renderer/slot/toolbar、固定快照、安全绘制、能力引用与回退 |
| 6 | [主题资源 SDK 1.8](主题资源SDK-1.8.md) | 包内PNG、动态图标、自定义身份、有界布局和动效、恢复 |
| 7 | [可选依赖与冲突 SDK 1.9](插件可选依赖与冲突SDK-1.9.md) | 核心与集成分离、对称冲突、范围与恢复 |
| 8 | [参数导入导出 SDK 1.10](插件参数导入导出SDK-1.10.md) | 显式允许备份、身份/schema绑定、原子合并与通知 |
| 9 | [设置自动迁移 SDK 1.11](插件设置自动迁移SDK-1.11.md) | 有界重命名/删除、原子快照指针、升级失败保护与回滚 |
| 10 | [凭据存储 SDK 1.12](插件凭据存储SDK-1.12.md) | 独立系统加密存储、签名者隔离、宿主管理与运行时受限读取 |

| 扩展类型 | 用途 | 调用特点 |
| --- | --- | --- |
| processor | 按顺序变换已有数据 | 提供方显式接入处理链 |
| provider | 从一个实现获取数据 | 按契约选择实现，同一次调用不悄悄换源 |
| action | 执行一次明确操作 | 按 `pluginId/extensionId` 选定，不能以读取目录代替执行动作 |
| event | 通知已发生的变化 | 发布时 active 订阅快照、每拥有者 FIFO、有界并行投递与故障隔离 |
| renderer / slot / toolbar | 贡献受限布局数据 | 明确选择实现，宿主绘制文本与快照能力按钮 |

API 版本、插件包版本、扩展点版本是不同字段；扩展点要求精确版本，依赖可以约束包版本范围。旧包签名兼容性需要独立验证。

## 源码与样例入口

| 内容 | 权威入口 |
| --- | --- |
| 类型与 API 版本 | [types.ts](../../src/common/plugin/types.ts) |
| 清单、安全、依赖与有界 schema 校验 | [security.ts](../../src/common/plugin/security.ts)、[extensions.ts](../../src/common/plugin/extensions.ts)、[dependencies.ts](../../src/common/plugin/dependencies.ts) |
| 参数与请求契约 | [settings.ts](../../src/common/plugin/settings.ts)、[requests.ts](../../src/common/plugin/requests.ts) |
| 启停、超时、取消与隔离 | [lifecycle.ts](../../src/main/modules/plugin/lifecycle.ts) |
| 安装、服务与桥接 | [插件主进程目录](../../src/main/modules/plugin/)、[宿主扩展调用](../../src/renderer/core/pluginExtensions.ts) |
| 签名与包生成 | [build-plugin-packages.js](../../build-config/plugins/build-plugin-packages.js)、[开发构建说明](../guides/development.md) |
| 可读样例 | [plugin-samples/](../../plugin-samples/README.md) |

原生整合包由源码编译进入宿主，第三方运行时包在隔离环境中通过受限契约工作。不能由原生包具备某项能力推断第三方包也拥有同样权限。

## 相关计划与验收

后续方向见 [插件依赖与统一设置计划](../plans/插件依赖与统一设置扩展计划-2026-10-20.md)。已完成增量及其边界分别见 [稳定性](../records/插件运行时稳定性优化-2026-10-21.md)、[provider](../records/插件数据提供器验收-2026-10-21.md)、[设置同步](../records/插件设置实时同步与请求一致性-2026-10-21.md)、[恢复默认与请求合并](../records/插件参数恢复默认与请求合并验收-2026-10-21.md)、[action](../records/插件动作扩展实现与验收-2026-10-21.md)、[event](../records/插件事件扩展实现与验收-2026-10-21.md)。

添加新能力时更新类型、校验、权限、运行时、宿主调用、样例、测试和 SDK 文档；搜索灵感区域的声明式UI试点已接入；其他业务的UI挂载点和更丰富布局仍待迁移，不能仅凭计划存在就声明可用。

[插件安装与升级影响预览](插件安装影响预览.md)：Host 管理能力、审批绑定及声明预估边界，公共运行时 API 保持 1.12.0。
