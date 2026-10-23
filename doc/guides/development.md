# 开发与构建

[指南索引](README.md) · [验证指南](validation.md)

以下命令在仓库根目录执行，依据当前 [package.json](../../package.json)、[开发启动器](../../build-config/runner-dev.js) 和 [构建入口](../../build-config/pack.js) 整理。

## 环境与开发启动

- Node.js：`>=22`；npm：`>=8.5.2`，以 `package.json.engines` 为准。
- 使用仓库的 `package-lock.json` 安装依赖。Electron 与原生依赖版本由仓库锁定，不单独升级系统中的 Electron 来替代。
- Electron 窗口测试需要可用的图形会话；无图形环境只能完成相应的静态或 Node 检查。

```bash
npm ci
npm run dev
```

`npm ci` 会运行项目的 `postinstall`，处理 Electron 原生依赖。`predev` 会先生成开发插件包，随后开发启动器编译并启动应用。涉及日常配置的验证请按测试脚本或临时 profile 进行，不直接将日常应用数据作为实验对象。

## 分项生产编译

这些入口可用于定位编译问题；它们不会生成系统安装包。

```bash
npm run build:main
npm run build:renderer
npm run build:renderer-lyric
npm run build:renderer-scripts
```

`build:main` 与 `build:renderer` 的前置脚本会生成开发插件包。分项产物位于 `dist/`，正式全量构建会清理 `dist/` 和 `build/`，因此不要把唯一的验收证据或手工文件保存在这些目录中。

开发插件构建会更新 `src/static/plugins/` 中的包、公共信任资料及原生整合包的构建身份。它是有文件写入的操作；只做文档核对时无须执行。机制见 [插件构建器](../../build-config/plugins/build-plugin-packages.js)。

## 全量构建与签名门禁

```bash
npm run build
```

全量构建通过 `build-config/pack.js` 先执行插件构建器的 `--release`，再编译主进程、主渲染、桌面歌词和脚本入口。它要求 `LX_PLUGIN_SIGNING_KEY` 指向外部 Ed25519 正式私钥，且拒绝使用仓库公开的示例密钥。没有正式签名环境时，门禁失败应如实报告，不能将开发签名冒充发行产物。

`npm run build:plugins` 用于开发包；`npm run build:plugins:release` 单独运行正式插件构建。两者都只产生本地文件，不代表已发布。正式私钥不要写入仓库、日志或文档。

## 安装包入口

下列平台打包脚本需要已有匹配的完整构建产物和对应平台环境：

| 命令 | 目标 |
| --- | --- |
| `npm run pack:linux:deb:amd64` | Linux amd64 DEB |
| `npm run pack:linux:appImage` | Linux x64 AppImage |
| `npm run pack:win:setup:x64` | Windows x64 安装包 |
| `npm run pack:mac:dmg` | macOS x64 DMG |

平台配置和输出位置定义在 [build-pack.js](../../build-config/build-pack.js)，当前安装包输出到 `build/`。`pack`、`pack:linux`、`pack:win` 等组合命令会先执行全量构建；某些 `publish:*` 脚本含 `publish=always`，执行前必须确认任务确实授权发布。

包已构建、包已安装、系统启动器已指向新版本是三个独立事实。安装或替换日常程序之后，应检查实际进程、版本和真实窗口行为。

## 听域独立仓库

显式隔离运行可传入 `--user-data-dir=/tmp/tingyu-test-profile`，不要指向日常配置目录。

当前产品维护与发行仓库为`wei-ran233/tingyu-desktop`，主分支为`main`。CI只做源码检查与开发签名构建，不自动触发上游发布、COS上传或跨仓库版本通知。正式安装包须配置本项目自己的发行密钥并按上述签名门禁操作；当前README中的Releases链接不表示已有听域发行文件。上游来源和原始协议见[声明目录](../legal/README.md)。
