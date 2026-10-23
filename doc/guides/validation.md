# 验证与证据边界

[指南索引](README.md) · [测试目录说明](../../build-config/tests/README.md)

按实际变更选择检查。此页列出可执行入口和证据含义，**不声明本轮已运行或已通过这些应用测试**。完整脚本以 [package.json](../../package.json) 与 [build-config/tests/](../../build-config/tests/) 为准。

## 验证层级

| 层级 | 典型检查 | 能确认什么 |
| --- | --- | --- |
| 文档与静态检查 | 链接、路径、命令核对，`git diff --check` | 文档引用、格式和工作区差异 |
| Node / 契约 | `test:collection`、`test:features`、`test:dj` 等 | 对应模型、协议、取消或模拟场景 |
| 编译 | 分项 webpack、TypeScript | 所选入口可编译、类型检查结果 |
| Electron 应用 | `test:plugin-settings:app` 等 | 构建产物中的真实窗口、IPC 和对应交互 |
| 外部接口 | `test:api:live`、`test:play-detail:live` | 当时网络、凭据和来源条件下的接口结果 |
| 安装与桌面 | 安装后真实启动、交互及版本检查 | 用户实际运行的程序生效 |

Node 模拟、生产构建或单个窗口测试都不能覆盖所有在线来源、真实语音播放和完整插件生态。

## 按改动选择入口

| 改动 | 优先检查 | 按需补充 |
| --- | --- | --- |
| 集合、插件契约与生命周期 | `npm run test:collection` | `test:plugins:electron`、`test:collection:app`、`test:plugin-lifecycle:app` |
| 功能与原生整合包 | `npm run test:features` | `npm run test:radio`、对应页面实机 |
| 电台、模型、TTS 和画像 | `npm run test:dj`、`npm run test:radio` | 隔离 profile 中真实聊天、取消及音频开始播放 |
| 音乐接口与播放详情 | `npm run test:music-api`、`npm run test:play-detail` | `test:api:live`、`test:play-detail:live` |
| 主题 | `npm run test:theme` | `npm run test:theme:app`，亮暗主题和恢复入口 |
| 插件设置、恢复默认、请求合并 | `npm run test:collection` | `npm run test:plugin-settings:app`、`test:plugin-lifecycle:app` |
| 文档分类与索引 | 本地链接、相对资源、npm 命令和差异检查 | 核对历史正文及已有非文档修改未被覆盖 |

`test:collection` 的前置脚本会生成开发插件包，并通过 webpack 运行集合及其引入的插件契约检查；单个测试文件是否被纳入执行，应读取测试入口确认。不能因目录中存在测试文件就宣称已执行。

## 静态与编译检查

```bash
git diff --check
npm run lint
npx tsc -p src/common/tsconfig.json --noEmit
npx tsc -p src/main/tsconfig.json --noEmit
npx tsc -p src/renderer/tsconfig.json --noEmit
```

根据修改范围选择 TypeScript 项目。`lint:fix` 会改写源码；只验证时用 `lint`，不要意外格式化整个脏工作区。超时、被中断、未执行和通过需要分别报告。

编译与插件生成方式见 [开发指南](development.md)。加载 `dist/main.js` 的 Electron 脚本需要当前完整的主进程、渲染、桌面歌词和脚本产物；避免加载旧构建后误判源码效果。读取测试文件头部，核对 profile、环境变量与证据输出目录。

## 真实应用与联网验证

使用一次性 profile，并确保其 `LxDatas` 目录可写。不要因测试初始化失败就删除日常数据库或改变用户配置。不要把 `--no-sandbox` 当作默认启动选项；启动错误应记录并区分环境与代码问题。

真实联网脚本可能读取本机配置并调用模型、天气、音乐源或 TTS。先检查脚本中 profile 来源和外部请求范围，按当次授权执行；日志不保存密钥、签名播放地址或私人聊天。TTS 响应成功与 `audio.play()` 真正开始分别验证。

保留原始失败日志和后续成功记录。新增证据应使用本轮独立目录；已有脚本可能默认写入固定的 `.runtime/` 路径，运行前确认是否支持证据目录环境变量，避免覆盖之前的报告。

## 记录格式

在 [records/](../records/README.md) 新建日期文档，写清目标、代码与配置基线、实际执行命令、环境、结果、证据位置和剩余限制。构建、安装、推送和发布分别列出实际完成情况；链接到相关计划与 SDK。
