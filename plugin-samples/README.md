# 插件样例索引

本目录是插件清单、沙箱页面、运行时扩展和签名打包的可执行样例。完整的插件模型、权限与开发流程见 [插件系统与示例指南](../doc/plugins/README.md)。

## 样例分类

| 样例 | 用途 | 扩展类型与入口 | 默认启用边界 |
| --- | --- | --- | --- |
| [official-suite](./official-suite/manifest.json) | 官方功能整合包，承载搜索、列表、歌单、排行榜、下载、播放和设置等原版功能。 | `nativeBundle`；声明 `search.query`、`search.suggestions` 和搜索动作扩展点。清单入口 `main: index.html` 只作为包内说明页，实际功能来自编译后的原生 bundle。 | 未声明 `defaultEnabled`，按内置包默认启用。 |
| [radio](./radio/manifest.json) | 独立电台功能，包括对话、推荐、语音、天气和偏好设置。 | `nativeBundle`；运行时与页面由原生 bundle 提供。 | 未声明 `defaultEnabled`，按内置包默认启用；声明依赖 `lx.official-suite`。 |
| [official-collection-list](./official-collection-list/manifest.json) | 覆盖搜索、歌单、列表和排行榜的原版集合视图。 | `collection.providers`；共享列表 SDK 入口为 `index.html -> shared/app.js`。 | 未声明 `defaultEnabled`，按内置包默认启用。 |
| [card-gallery](./card-gallery/manifest.json) | 演示卡片式集合视图，并通过同一命令网关执行播放、选择、排序等操作。 | `collection.providers`、`pages`、`themes`、`settings`；示例页和主题入口均由清单声明。 | 未声明 `defaultEnabled`，按内置包默认启用。 |
| [theme-studio](./theme-studio/manifest.json) | 演示潮汐、信号、花间三套主题及其布局、背景、播放详情和页面视图覆盖。 | `themes` 与 `theme.appearance`；每个主题可声明 `tokens`、`appearance` 和按页面分配的 view。 | 未声明 `defaultEnabled`，按内置包默认启用；声明依赖 `lx.official-suite`。 |
| [search-cleaner](./search-cleaner/manifest.json) | 可选搜索增强：整理重复空白、换行和全角空格。 | 沙箱 `runtime.entry: runtime.html`；`extensions.process` processor，目标是 `lx.official-suite/search.query`。 | 明确 `defaultEnabled: false`；用户启用且依赖满足后才生效。 |
| [search-starters](./search-starters/manifest.json) | 可选搜索灵感：提供可编辑的搜索词，并暴露“换一组”动作。 | 沙箱 `runtime.entry: runtime.html`；同时演示 provider、action 和 suggestions.changed 事件发布；订阅清单见 [SDK 1.6](../doc/plugins/插件事件扩展SDK-1.6.md)。 | 明确 `defaultEnabled: false`；用户启用且依赖满足后才生效。 |
| [search-layouts](./search-layouts/manifest.json) | 搜索灵感的列表、卡片、说明和工具栏；全部使用同一功能快照。 | 沙箱 runtime + extensions.render，输出受限JSON；见 [SDK 1.7](../doc/plugins/插件声明式UI扩展SDK-1.7.md)。 | 明确 defaultEnabled: false；启用后仍需手动选择各呈现。 |
| [paper-theme](./paper-theme/manifest.json) | 自定义paper身份的日光/夜读主题，无需新增宿主映射。 | API1.8 theme.resources：包内PNG、path图标、有界布局与宿主动效；见 [SDK1.8](../doc/plugins/主题资源SDK-1.8.md)。 | 默认关闭；启用后到主题与外观选择。 |

内置包导入时，`defaultEnabled !== false` 即默认为启用；依赖、API 版本、签名和原生 bundle 哈希仍会决定插件是否实际可用，见 [service.ts](../src/main/modules/plugin/service.ts#L169-L190)。因此表中的“默认启用”表示启用偏好，不保证依赖满足后的运行成功。

## 清单与 SDK 入口

- 每个插件必须有 `manifest.json`，其中 `id`、`name`、`version`、`apiVersion`、`main` 和 `permissions` 是基础字段。当前宿主 API 版本为 `1.10.0`，见 [types.ts](../src/common/plugin/types.ts#L5-L31) 和 [security.ts](../src/common/plugin/security.ts#L67-L86)。
- 普通页面由 `main` 进入；集合 provider 和插件页面还可分别声明 `entry`。需要后台处理器时增加 `runtime.entry`，该 HTML 只能使用沙箱运行时桥。
- 普通插件页面通过受限的 `window.lxPlugin` API 访问身份、快照、命令、主题、导航、限定范围的存储和设置，桥接定义见 [preload.ts](../src/main/modules/plugin/renderer/preload.ts#L31-L58)。[shared/app.js](./shared/app.js#L1-L20) 是两个集合视图共用的 SDK 演示。
- 扩展运行时通过 `window.lxRuntime.start()` 注册生命周期和 handler，桥接定义见 [runtimePreload.ts](../src/main/modules/plugin/renderer/runtimePreload.ts#L34-L39)。运行时无 Node、任意 IPC、网络、弹窗或跨插件资源能力，见 [runtimeHost.ts](../src/main/modules/plugin/runtimeHost.ts#L32-L99)。
- 非原生 bundle 的样例在打包时会自动合并 `shared/`；原生 bundle 不合并共享页面，而是加入对应的 `bundle.json`，见 [build-plugin-packages.js](../build-config/plugins/build-plugin-packages.js#L83-L110)。

## 签名与构建

在仓库根目录运行：

```bash
npm run build:plugins
LX_PLUGIN_SIGNING_KEY=/path/to/release-ed25519-private.pem npm run build:plugins:release
```

- `build:plugins` 读取 `plugin-samples/keys/sample-private.pem`，缺少该文件时会生成样例密钥。
- `build:plugins:release` 必须通过 `LX_PLUGIN_SIGNING_KEY` 指向仓库外的 Ed25519 私钥；脚本会拒绝样例密钥，并把公钥指纹写入 [bundledKeys.json](../src/common/plugin/bundledKeys.json)。规则见 [build-plugin-packages.js](../build-config/plugins/build-plugin-packages.js#L18-L55) 和 [trustedKeys.ts](../src/main/modules/plugin/trustedKeys.ts#L3-L10)。
- 构建结果写入 `src/static/plugins/<plugin-id>.lxplugin`。签名覆盖规范化清单以及除 `manifest.json` 外每个文件的 SHA-256，宿主只接受 Ed25519 签名，见 [signature.ts](../src/main/modules/plugin/signature.ts#L42-L77)。
- `official-suite` 和 `radio` 的 `buildHash` 由 bundle 描述、inventory 和对应主进程/渲染进程源码计算；修改原生 bundle 后必须重新运行插件构建，宿主会拒绝与当前应用构建不匹配的包，见 [build-plugin-packages.js](../build-config/plugins/build-plugin-packages.js#L73-L80) 和 [service.ts](../src/main/modules/plugin/service.ts#L26-L33)。
- `npm run build` 会在清理 `dist/build` 前调用 `build-plugin-packages.js --release`，所以它也需要正式签名密钥；只想做本地开发时应使用 `npm run dev` 或 `npm run build:plugins`，构建顺序见 [pack.js](../build-config/pack.js#L19-L25)。

样例私钥只用于仓库内演示和开发验证。生成发布包时不要把正式私钥放入仓库，也不要把样例密钥当作生产信任根。

可选依赖与冲突关系见 [SDK1.9](../doc/plugins/插件可选依赖与冲突SDK-1.9.md)。对应可运行签名夹具由 `build-config/tests/plugin-optional-app.cjs` 在临时 profile 中生成，未增加默认开启的样例。

搜索词整理的普通布尔参数`collapseSpaces`在API1.10显式允许备份；仅这类声明字段显示参数导入导出。协议和边界见[SDK1.10](../doc/plugins/插件参数导入导出SDK-1.10.md)，自动迁移与凭据不包含在备份中。
