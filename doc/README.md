# 文档总索引

本目录按用途组织项目文档，供开发者与后续 agent 按需阅读。目录与入口于 **2026-10-21** 按当前工作区核对；日期记录描述的是对应轮次的结果，不能替代当前复测。

## 从哪里开始

| 任务 | 首选入口 | 下一步 |
| --- | --- | --- |
| 第一次接手仓库 | [Agent 工作指南](guides/agent-workflow.md) | [当前架构与目录](architecture/项目架构与目录说明.md) |
| 启动开发、构建或排错 | [开发指南](guides/development.md) | [验证指南](guides/validation.md) |
| 改页面、播放器、设置或电台 | [架构分类](architecture/README.md) | [功能分类](features/README.md) |
| 开发或维护插件 | [插件 SDK 分类](plugins/README.md) | [插件样例索引](../plugin-samples/README.md) |
| 查设计动机和待办 | [当前计划状态](plans/当前计划状态与后续实施清单-2026-10-21.md) | [计划分类](plans/README.md)、对应验收记录与当前实现 |
| 查已经做过的测试与限制 | [验收与实施记录](records/README.md) | 按需重跑测试，核对本轮证据 |
| 新增文档或查旧文件路径 | [文档维护约定](guides/documentation-maintenance.md) | 更新所属分类 README |

## 分类目录

| 目录 | 内容 | 使用方式 |
| --- | --- | --- |
| [guides/](guides/README.md) | 接手流程、开发命令、验证与文档维护 | 操作前阅读，随代码更新 |
| [architecture/](architecture/README.md) | 当前模块边界、源码入口和变更定位 | 判断代码应改在哪里 |
| [plugins/](plugins/README.md) | processor、provider、action、event 与声明式 UI 的版本化 SDK | 结合类型、校验器和样例使用 |
| [features/](features/README.md) | 电台、语音、音乐偏好等功能说明 | 了解行为和排障入口 |
| [plans/](plans/README.md) | 原始方案、分阶段计划和建议 | 追溯目标，不据此认定已实现 |
| [records/](records/README.md) | 按日期保留的审计、实施和验收证据 | 追溯结论及其适用范围 |
| [legal/](legal/README.md) | 许可证、来源、归属与原始协议 | 保留上游通知，区分产品身份和来源 |
| [images/](images/README.md) | 项目图标与 README 截图 | 保留资源路径及截图语义 |

## 阅读时如何判断有效性

- **当前实现**：由当前代码、配置和本轮实际验证共同确认。架构指南提供查找入口，不承诺所有能力都已验收。
- **SDK**：按 API 版本增量阅读。当前 `PLUGIN_API_VERSION` 为 `1.12.0`，以 [types.ts](../src/common/plugin/types.ts) 和清单校验为准；旧版文档中的“尚未提供”应结合后续版本判断。
- **计划与建议**：包括原始约束和分工，不自动代表当前授权或完成状态。
- **实施与验收记录**：保留当时环境、失败与成功、剩余问题。记录中的 `.runtime/` 或 `/tmp/` 路径可能仅存在于原机器，不是仓库内保证随附的证据。

根目录另保留 [项目首页](../README.md)、[FAQ 历史入口](../FAQ.md)、[上游变更记录](../CHANGELOG.md) 与 [许可证](../LICENSE)。语言贡献说明在 [src/lang/Readme.md](../src/lang/Readme.md)。第三方源码附带的 README 与许可证留在原目录，避免混入项目设计文档。
