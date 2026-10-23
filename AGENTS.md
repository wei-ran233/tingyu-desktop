# Agent 阅读入口

本文只补充本仓库的定位与阅读顺序；用户当次指令及其子 agent 规则优先。

1. 先运行 `git status --short`，识别已有修改，保留未提交工作。
2. 阅读 [文档总索引](doc/README.md) 和 [Agent 工作指南](doc/guides/agent-workflow.md)。
3. 按任务进入 [当前架构](doc/architecture/README.md)、[插件 SDK](doc/plugins/README.md) 或 [功能说明](doc/features/README.md)，再定向读源码。
4. 涉及历史决策时查 [计划](doc/plans/README.md) 与 [验收记录](doc/records/README.md)，不要把计划、旧路径或旧测试结果当作当前事实。
5. 按 [验证指南](doc/guides/validation.md) 选择检查，明确报告源码、构建、安装和真实界面验证分别完成到哪一步。

当前业务已迁入 `src/renderer/bundles/official/` 与 `src/renderer/bundles/radio/`；不要按旧文档重建 `src/renderer/views/Dj/` 等目录。插件 API 的权威定义在 `src/common/plugin/`，页面与原生功能清单在 `src/common/bundles/`。

文档新增、分类、状态标记及旧路径对照见 [文档维护约定](doc/guides/documentation-maintenance.md)。构建、安装、发布、真实配置变更应遵从当前任务授权，不能由历史计划中的操作记录推导授权。
