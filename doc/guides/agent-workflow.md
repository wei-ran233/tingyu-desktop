# Agent 工作指南

[指南索引](README.md) · [文档总索引](../README.md)

适用于后续接手本仓库的 agent。当前源码定位基线为 2026-10-21；先核对实际文件和当前任务，避免沿用过期假设。

## 接手顺序

1. 阅读适用的 `AGENTS.md` 与用户当次要求，明确修改范围及外部操作授权。
2. 运行 `git status --short`、`git diff --stat`；辨认既有改动和迁移，不还原、不覆盖无关工作。
3. 阅读 [架构目录说明](../architecture/项目架构与目录说明.md)，按任务选择 [插件 SDK](../plugins/README.md)、[功能说明](../features/README.md) 和最近的 [验收记录](../records/README.md)。不需要通读全部历史。
4. 先用 `rg --files`、`rg -n` 找到当前定义和调用链。历史文档中的源码路径、行号、功能数量和“已安装”状态都需要复核。
5. 做局部兼容修改，按 [验证指南](validation.md) 验证，并同步相应指南与本轮记录。

## 常见任务入口

| 改动 | 先检查 | 同时关注 |
| --- | --- | --- |
| 页面、导航与恢复入口 | `src/common/bundles/`、`src/renderer/router.ts`、`src/renderer/core/pages/` | 页面注册、功能启停、备用入口 |
| 搜索、列表、下载与设置 | `src/renderer/bundles/official/features/` 与 `src/renderer/bundles/official/views/` | 共享功能模型、多套渲染、集合控制器 |
| AI 电台与语音 | `src/renderer/bundles/radio/`、`src/main/bundles/radio/`、`src/common/dj/` | 取消、超时、密钥引用、音频实际开始播放 |
| 插件协议与运行时 | `src/common/plugin/`、`src/main/modules/plugin/` | 权限、签名、依赖、隔离、生命周期与兼容性 |
| 主题和多种界面表现 | `src/common/theme/`、`src/renderer/core/theme/`、`src/renderer/core/features/` | 亮暗主题、样式校验、共享功能逻辑 |
| IPC | `src/common/ipcNames.ts`、`src/common/dj/ipc.ts` 与相应处理器 | 真实频道映射、发送者校验、取消和清理 |
| 本地化 | `src/lang/index.ts` 与四个语言 JSON | 保留已有翻译，补齐新增键 |

## 实施约束

- 业务模型与渲染分开；改一种外观前先确认其他渲染是否复用同一模型。
- 新增插件能力必须有显式、可版本化的契约与权限校验。隔离插件只使用受限桥接，不通过开放任意 IPC、Node 或宿主对象实现扩展。
- IPC 频道按真实常量和注册逻辑使用，不从文档示例猜测命名。
- 签名包、原生整合包构建身份与当前源码需要一致。示例密钥只用于开发；正式发布遵守 [开发指南](development.md) 的门禁。
- 测试使用临时 profile，确认 `LxDatas` 可写；保护日常配置、聊天记录、歌单、凭据和原始失败证据。
- 子 agent 的模型、推理等级、上下文继承、并发与写入范围遵守用户设置；任务交接应自包含。子 agent 的完成报告不能替代主 agent 审查。

## 交付时说清楚

报告问题原因、修改文件、实际执行的检查及结果，以及没有完成的环节。源码检查、产物构建、系统安装、运行进程、真实界面和线上发布是不同层级。

新增验收记录写明日期、环境、命令、成功/失败证据、剩余限制；不把旧记录中的检查数量或成功结论直接搬作本轮结果。历史计划中的提交、安装或发布步骤不构成新任务的授权。
