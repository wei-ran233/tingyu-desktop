# 测试入口与验证边界

本目录同时包含纯契约测试和真实 Electron 测试。完整验收顺序、安装包验证和发布门槛见 [测试与验收指南](../../doc/guides/validation.md)；本页只索引关键入口和事实边界。

## 环境前提

- 仓库要求 Node.js `>= 22`、npm `>= 8.5.2`；当前 `electron` 开发依赖为 `41.2.0`。安装依赖后会自动执行 `electron-builder install-app-deps`，见 [package.json](../../package.json)。
- `*:app`、`*:live` 和 `test:plugins:electron` 使用 `electron --ozone-platform=x11`，需要可用的图形会话与 X11/XWayland。
- 加载 `dist/main.js` 的测试要求先完成本地 webpack 构建。`npm run build` 当前会以正式签名模式构建插件并要求 `LX_PLUGIN_SIGNING_KEY`；本地准备测试产物时应分别运行 `build:main`、`build:renderer`、`build:renderer-lyric` 和 `build:renderer-scripts`，见 [pack.js](../pack.js#L19-L25) 与 [package.json](../../package.json#L58-L90)。
- `test:collection` 有自动前置步骤：`pretest:collection` 会先运行 `npm run build:plugins`。这会生成 `src/static/plugins/*.lxplugin`、`src/common/plugin/bundledKeys.json` 和原生 bundle 的 build 元数据，见 [package.json](../../package.json#L73-L80) 与 [build-plugin-packages.js](../plugins/build-plugin-packages.js)。

## 关键入口

| npm 入口 | 环境与输入 | 网络 / Electron 边界 | 能证明什么 |
| --- | --- | --- | --- |
| `npm run test:collection` | Node、webpack、`ts-loader`；先签样例包，再把入口编译到 `dist/tests/collection-tests.js`，最后运行 adapters 测试。 | 纯 Node；不使用真实 Electron 或外部服务。测试代码使用临时目录和合成 fixture。 | 集合协议、插件清单/安装、扩展生命周期、签名包可读性和 adapter 契约。入口与收集范围见 [webpack.config.js](./webpack.config.js#L3-L39) 和 [collection-tests.ts](./collection-tests.ts#L1-L35)。 |
| `npm run test:features` | Node、TypeScript transpile、Vue 自定义 renderer。 | 无 Electron、无网络；测试文件明确使用实际 renderer/registry 代码与内存节点。 | 功能注册、独立 view、主题 view 临时覆盖、状态保留、回退和卸载。见 [feature-runtime.test.cjs](./feature-runtime.test.cjs#L1-L28)。 |
| `npm run test:radio` | Node、Vue、TypeScript transpile；IPC、播放扩展和天气 `fetch` 均为 mock。 | 无真实 provider、无外部请求。 | 电台功能跟随所属 bundle、播放扩展解除、IPC 取消、天气请求取消和合并。见 [radio-plugin.test.cjs](./radio-plugin.test.cjs#L1-L25)。 |
| `npm run test:music-api` | Node；`needle`、`fetch` 和 vault 依赖均为 fixture/mock。 | 无真实音乐源、天气服务或安全存储。 | 请求错误会 settle、搜索重试有界、天气草稿参数隔离、凭据解密失败时给出可操作错误。见 [music-api-boundaries.test.cjs](./music-api-boundaries.test.cjs#L16-L82)。 |
| `npm run test:plugins:electron` | 真实 Electron 进程，但直接加载/转译源码；使用临时 profile、临时 host 页面和 `src/static/plugins` 中的签名样例。 | 真实 sandbox、preload、自定义 `lxplugin://` 协议和 `WebContentsView`；数据与导航用内存 adapter 替代，不访问外部网络。 | 列表/卡片视图真实渲染、虚拟化、真实 IPC 命令、view 复用、owner 隐藏和主题推送。见 [plugin-electron-smoke.cjs](./plugin-electron-smoke.cjs#L1-L59)。 |
| `npm run test:collection:app` | 加载现有 `dist/main.js`；临时 userData、真实 SQLite、120 首本地 fixture，并使用样例插件包。 | 真实 Electron + 应用主窗口；使用本地 SQLite，不调用外部音乐服务。 | 构建后应用能挂载 Vue、运行真实列表 adapter、切换列表/卡片 provider，并保持选择、遮罩和路由状态。见 [collection-app-smoke.cjs](./collection-app-smoke.cjs#L1-L36)。 |
| `npm run test:plugin-settings:app` | 加载现有 `dist/main.js`；临时 userData、样例插件包和真实设置 IPC。 | 真实 Electron；验证插件页面/设置/存储，不访问外部服务。 | 设置字段持久化、跨宿主编排、隔离页读写、实时推送、重置默认值和依赖阻塞。见 [plugin-settings-app.cjs](./plugin-settings-app.cjs#L1-L22)。 |
| `npm run test:plugin-lifecycle:app` | 加载现有 `dist/main.js`；临时 userData，并在临时目录动态生成签名插件 fixture。 | 真实 Electron 沙箱；测试明确断言插件网络、跨插件资源和弹窗均不可用。 | 依赖顺序、超时、崩溃隔离、请求取消、背压、设置实时刷新和 provider/action 生命周期。见 [plugin-lifecycle-app.cjs](./plugin-lifecycle-app.cjs#L1-L50)。 |
| `npm run test:api:live` | 真实 Electron、现有 `dist`、本机 LX Music 配置和凭据；可筛选源、媒体、TTS、天气或代理。 | 会按当前配置访问真实音乐源；配置了 AI/TTS 时还会调用相应外部服务，可能产生费用。 | 只用于外部服务连通性探针，不是稳定离线 CI。结果写入 `.runtime/api-live-20261020`，失败/空结果/超时可能以退出码 `2` 结束。见 [api-live-smoke.cjs](./api-live-smoke.cjs#L1-L35)。 |
| `npm run test:play-detail:live` | 真实 Electron、现有 `dist`、本机 `~/.config/lx-music-desktop/LxDatas` 中的源配置和 `user_api.json`。 | 默认真实联网搜索五个源并请求歌词/评论；可用 `LX_DETAIL_API_ONLY`、`LX_DETAIL_UI_ONLY` 分离 API 与 UI。 | 生产 SDK、播放详情、歌词与评论的真实链路，可选 `LX_DETAIL_THEME=tide\|signal\|petals` 做主题验收。见 [play-detail-live.cjs](./play-detail-live.cjs#L1-L59)。 |

其他未展开的入口包括：`npm run test:play-detail`（Node + mock SDK）、`npm run test:theme`（主题契约和内存 DOM）、`npm run test:theme:app`（构建后主题 UI）、`npm run test:dj`（多个 DJ 单元/集成脚本）。

## 证据层级

1. **源码契约**：`test:collection`、`test:features`、`test:radio`、`test:music-api`、`test:play-detail`、`test:theme` 转译源码并在 Node/Vue 环境运行，网络和外部依赖通常被替换。
2. **源级真实 Electron**：`test:plugins:electron` 使用真实 Electron 安全边界和协议，但模块仍从源码转译，不能替代构建产物验证。
3. **构建产物 Electron**：`test:collection:app`、`test:plugin-settings:app`、`test:plugin-lifecycle:app`、`test:theme:app` 加载 webpack 生成的 `dist/main.js`，覆盖真实主进程、renderer IPC、SQLite 和沙箱 runtime。
4. **真实外部服务**：`test:api:live` 与 `test:play-detail:live` 证明指定时刻、网络和账号配置下的外部链路；结果会受服务、地区、代理、额度和凭据影响。
5. **未由这些脚本覆盖**：Linux DEB/AppImage/RPM/Pacman 等安装包安装、从安装包启动、GNOME 桌面集成、正式 release 密钥信任根和发布资产上传，需要另做安装包/发布验收。

所有 Electron 测试都通过 `app.setPath('userData', mkdtempSync(...))` 使用一次性 profile；示例见 [collection-app-smoke.cjs](./collection-app-smoke.cjs#L7-L14) 和 [plugin-lifecycle-app.cjs](./plugin-lifecycle-app.cjs#L4-L7)。这些测试以 Electron 测试入口启动，通常处于 `app.isPackaged === false`，因此允许开发/样例密钥；它们不能证明正式安装包会接受样例签名，允许开发密钥的条件见 [index.ts](../../src/main/modules/plugin/index.ts#L43-L50)。

## 临时配置与真实联网

- 构建产物 Electron 测试会写入仓库内的 `.runtime/<验证主题>` 证据目录；部分脚本支持相应的 `*_EVIDENCE_DIR` 环境变量，另一些使用固定路径，运行前应读取脚本确认并保留已有证据。测试结束后临时 userData profile 通常会被删除。
- `test:api:live` 默认真实访问 `kw,kg,tx,wy,mg`，可用 `LX_LIVE_SOURCES` 缩小范围，用 `--services`、`--media`、`--tts`、`--weather` 分离阶段；`LX_LIVE_TEST_PROXY` 只改变网络路径。它会复制本机 `config_v2.json`、`user_api.json`、主窗口 Local Storage 和 `dj-credentials.json` 的适用部分到临时 profile，见 [api-live-smoke.cjs](./api-live-smoke.cjs#L8-L32)。
- `test:api:live` 的 probe 错误信息会把 HTTP(S) URL 替换为 `[endpoint]`；`configuration.json` 只记录 provider/model、接口 origin 和“是否配置”等布尔信息。即便如此，它仍会搜索外部音乐源、执行固定提示词并可能调用已配置的付费接口。
- `test:play-detail:live` 同样读取真实配置并访问网络；建议先运行 `npm run test:play-detail`，再用 `LX_DETAIL_API_ONLY` 验证接口，最后才做默认 UI 验收。配置来源和开关见 [play-detail-live.cjs](./play-detail-live.cjs#L4-L22)。
- 真实联网测试失败不能直接判为代码失败；先记录 DNS、代理、HTTP 状态、服务额度、地区限制和账号配置，再与离线契约或构建产物测试结果交叉判断。

## 声明式事件增量

`plugin-event-tests.ts` 由 collection-tests 接入；`npm run test:plugin-events:app` 使用当前生产构建、临时 profile 与签名夹具验证发布者身份、声明订阅、FIFO、容量、隔离与撤销。证据目录可用 `LX_PLUGIN_EVENTS_EVIDENCE_DIR` 指定，避免覆盖旧验收。协议见 [SDK 1.6](../../doc/plugins/插件事件扩展SDK-1.6.md)。

## 声明式 UI 增量

`plugin-ui-tests.ts` 由 collection-tests 接入；`npm run test:plugin-ui:app` 用临时profile和生产构建检查三种扩展点的选择、共享模型、文本安全、主题和恢复。证据目录可用 `LX_PLUGIN_UI_EVIDENCE_DIR` 指定。协议见 [SDK 1.7](../../doc/plugins/插件声明式UI扩展SDK-1.7.md)。

## 主题资源增量

`theme-resource-tests.ts`由collection-tests接入，覆盖版本/权限/路径/图标与PNG头约束；`test:theme`另有主题选择竞态门闩回归。`npm run test:theme-resources:app`在临时profile内验证实际解码、图片图标、亮暗、动效与停用恢复；证据目录由`LX_THEME_RESOURCES_EVIDENCE_DIR`指定。协议见 [SDK1.8](../../doc/plugins/主题资源SDK-1.8.md)。

## 可选依赖与冲突增量

`plugin-optional-contract-tests.ts` 与 `plugin-optional-lifecycle-tests.ts` 由 collection-tests 接入，覆盖声明/范围/冲突传播/循环与核心保持、在途取消和恢复。`npm run test:plugin-optional:app` 使用当前生产构建、真实签名夹具、临时 profile，检查事件集成、版本升级/回滚、停用/卸载/崩溃、冲突与 Vue 状态；可用 `LX_PLUGIN_OPTIONAL_EVIDENCE_DIR` 指定新的证据目录，避免覆盖旧结果。见 [SDK1.9](../../doc/plugins/插件可选依赖与冲突SDK-1.9.md)。

## 参数导入导出增量

`plugin-settings-transfer-tests.ts` 与 `plugin-settings-transfer-service-tests.ts` 由collection-tests接入，检查API门控、文件身份/schema/值约束、默认禁止导出、事务合并与失败保护。`npm run test:plugin-settings-transfer:app`使用生产构建、临时profile与真实签名包验证实际Vue按钮、原生文件选择/差异确认、取消、非法文件、并发修改和实时通知；证据目录用`LX_PLUGIN_SETTINGS_TRANSFER_EVIDENCE_DIR`指定。见[SDK1.10](../../doc/plugins/插件参数导入导出SDK-1.10.md)。

## 设置自动迁移增量

`plugin-settings-migration-tests.ts`、`plugin-settings-snapshot-tests.ts` 和 `plugin-settings-migration-service-tests.ts` 由 collection-tests 接入，检查声明门控、纯迁移、路径/大小/值约束、升级事务、读写屏障和回滚。生产 main/renderer 构建后运行 `npm run test:plugin-settings-migration:app`，通过真实签名包与临时 profile 验证迁移、失败恢复、现有 Vue 表单刷新、导入/重置和快照清理。证据目录用 `LX_PLUGIN_SETTINGS_MIGRATION_EVIDENCE_DIR` 指定。脚本自动提供原生对话框结果，实际参数/包持久化及隔离运行时走生产实现；不验证操作系统对话框外观。见 [SDK1.11](../../doc/plugins/插件设置自动迁移SDK-1.11.md)。

## 凭据存储增量

`plugin-credential-tests.ts`、`plugin-credential-vault-tests.ts` 和 `plugin-credential-service-tests.ts` 由collection-tests接入，覆盖声明、加密文件、命名空间、失败事务和服务授权。生产main/renderer构建后运行 `npm run test:plugin-credentials:app`；以 `LX_PLUGIN_CREDENTIALS_EVIDENCE_DIR` 指定独立目录，使用虚构凭据和临时profile。脚本先检查实际safeStorage；不可用时验证拒绝，再在测试进程注入AES适配器完成其他流程，结果必须区分实际系统密钥环与测试适配器。见[SDK1.12](../../doc/plugins/插件凭据存储SDK-1.12.md)。

## 听域身份与安装预览

`npm run test:identity:app` 在一次性 appData 下验证首启、独立应用身份、主窗口和关于页。`npm run test:update` 检查更新事件的状态映射及监听清理。`npm run test:plugin-impact:app` 使用临时 profile 和真实签名包，验证安装预览、过期审批、包字节改变、Vue 确认/取消与依赖变化。证据目录分别使用 `TINGYU_IDENTITY_EVIDENCE_DIR`、`TINGYU_PLUGIN_IMPACT_EVIDENCE_DIR` 指定。
