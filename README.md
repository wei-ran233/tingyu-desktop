<p align="center"><img src="doc/images/tingyu-header.svg" alt="听域 Tingyu：音乐、对话与开放扩展的桌面空间" width="100%"></p>

# 听域 · Tingyu

一个可扩展的桌面音乐工作台。把音乐播放、AI 电台和插件能力放在同一个安静、清晰的界面里，让功能可以独立演进，也让用户保留对数据和配置的控制。

[项目文档](doc/README.md) · [发行版本](https://github.com/wei-ran233/tingyu-desktop/releases) · [反馈问题](https://github.com/wei-ran233/tingyu-desktop/issues) · [开发进度](doc/plans/当前计划状态与后续实施清单-2026-10-21.md)

## 可以做什么

| 能力 | 当前范围 |
| --- | --- |
| 音乐与媒体库 | 搜索、歌单、我的列表、排行榜、播放队列、歌词、评论和下载，共享功能模型与多种界面渲染 |
| AI 电台 | 对话、音乐推荐、历史、偏好与语音；模型及服务由用户自行配置 |
| 开放扩展 | 签名插件、隔离页面、processor/provider/action/event、受限声明式 UI，以及安装前的权限与依赖影响预览；业务公开扩展点逐项增加 |
| 主题与外观 | 多种界面表现、亮暗主题、有界主题资源、图标、尺寸与动效参数 |
| 参数与凭据 | 参数导入导出、声明式设置迁移与回滚快照；独立系统加密凭据存储，凭据不进入参数备份 |

插件接口当前为 **1.12.0**，以[类型定义](src/common/plugin/types.ts)和[版本化 SDK](doc/plugins/README.md)为准。原生整合包与隔离第三方插件的能力不同；功能迁入整合包不等于已开放第三方扩展。剩余工作和验证边界见[实施清单](doc/plans/当前计划状态与后续实施清单-2026-10-21.md)。

## 安装与使用

发行文件仅通过[听域 Releases](https://github.com/wei-ran233/tingyu-desktop/releases)提供。当前源码沿用既有开发版本号；仓库创建、源码构建、系统安装和正式发行是不同阶段，未发布的源码不表示已有对应安装包。

听域不附带可用的第三方服务凭据或私人音乐源。AI 模型、语音与其他外部服务按[功能说明](doc/features/README.md)配置；部分服务可能产生调用费用。音乐内容和可用性取决于用户选择的来源，请遵守适用规则并尊重内容版权。

独立产品使用自己的应用身份。现有软件的数据不会在本轮自动迁移或覆盖；需要迁移时先保留备份，再通过显式导入功能操作。

## 本地开发

使用 Node.js `>=22`、npm `>=8.5.2`：

```bash
git clone https://github.com/wei-ran233/tingyu-desktop.git
cd tingyu-desktop
npm ci
npm run dev
```

开发启动会生成开发签名插件。开发密钥仅用于本地测试，不能作为正式发行身份。正式构建、平台打包和签名配置见[开发指南](doc/guides/development.md)。

常用验证入口：

```bash
npm run test:collection
npm run build:main
npm run build:renderer
npm run build:renderer-scripts
```

真实 Electron 检查使用临时配置，与源码、类型和模拟测试分别记录。命令适用范围见[验证指南](doc/guides/validation.md)；不要让联网测试读取或发布私人凭据。

## 文档入口

| 任务 | 文档 |
| --- | --- |
| 理解项目 | [文档总索引](doc/README.md)、[当前架构](doc/architecture/README.md) |
| 编写插件 | [SDK 索引](doc/plugins/README.md)、[样例](plugin-samples/README.md) |
| 配置电台与语音 | [功能说明](doc/features/README.md) |
| 继续开发 | [AGENTS.md](AGENTS.md)、[工作指南](doc/guides/agent-workflow.md)、[后续清单](doc/plans/当前计划状态与后续实施清单-2026-10-21.md) |
| 核对测试结果 | [验收记录](doc/records/README.md)、[测试目录](build-config/tests/README.md) |

## 参与维护

欢迎提交可复现的问题和范围清楚的改进。请写明应用版本、平台、触发步骤及预期行为；截图和日志先移除令牌、私人地址与聊天内容。功能修改同时说明兼容影响与实际执行的检查，区分源码通过、安装生效和外部服务验收。

## 来源与许可声明

听域是在 [LX Music Desktop](https://github.com/lyswhut/lx-music-desktop) 及[既有修改版本](https://github.com/wei-ran233/lx-music-desktop-style-change)基础上独立维护的衍生项目，保留原提交历史与作者归属。新的普通 GitHub 仓库和产品品牌不表示代码完全原创，也不表示获得上游官方背书。听域的问题、维护和发行均由本仓库负责。

[Apache License 2.0](LICENSE)、[NOTICE](NOTICE)和[上游补充协议及归属说明](doc/legal/README.md)随源码保留；第三方代码与资源仍遵循各自许可证。上游名称在文档中用于说明来源，软件产品使用听域 / Tingyu 品牌。
