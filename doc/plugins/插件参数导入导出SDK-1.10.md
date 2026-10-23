# 插件参数导入导出 SDK 1.10

[插件SDK索引](README.md) · [实施计划](../plans/插件参数导入导出实现计划-2026-10-22.md)

API `1.10.0` 增加可迁移参数的文件导入/导出。这是E5a；不会执行自动schema迁移，也不提供第三方凭据vault。已有`settings.scoped`读取、单字段保存与实时通知继续适用。

## 声明与默认行为

```json
{
  "apiVersion": "1.10.0",
  "permissions": ["settings.scoped"],
  "settingsVersion": 1,
  "settings": [
    { "key": "title", "title": "标题", "type": "string", "default": "音乐", "maxLength": 100, "exportable": true },
    { "key": "localOnly", "title": "本机参数", "type": "string", "default": "" }
  ]
}
```

示例省略了插件ID、入口和签名等既有必填项。`settingsVersion` 显式声明时为1至1000000的整数，缺省1；它与包版本、宿主API和扩展点版本分别独立。`exportable` 只接受boolean，缺省false；即使显式false也要求API1.10。新字段要求主版本1、最低API1.10及`settings.scoped`。

只有 `exportable === true` 的字段可写入备份、可从备份覆盖。未声明参数仍可在已有表单正常保存，但不开放文件迁移。插件作者必须保证可导出字段不含账号密钥、令牌等敏感数据；不要因为宿主提供开关就将凭据标成可导出。原生电台已有凭据引用语义保持，凭据不包含在这套文件协议中。

没有使用新字段的旧清单不被自动补入字段，canonical签名载荷不变。样例 `lx.search-cleaner` 仅将普通布尔参数 `collapseSpaces` 显式允许备份，保持默认关闭。

## 文件格式

```json
{
  "format": "lxplugin-settings/1",
  "pluginId": "example.plugin",
  "signerFingerprint": "<当前插件签名者SHA256>",
  "settingsVersion": 1,
  "schemaFingerprint": "<当前schema的SHA256>",
  "values": { "title": "我的音乐" }
}
```

所有六个字段必须存在，不接受额外顶层字段。`schemaFingerprint` 是 `{settingsVersion,fields}` 的canonical JSON SHA256，其中fields为当前完整设置声明；因此字段、顺序、标题、默认值、约束或exportable变化都会使旧文件不兼容。相同schema的包补丁升级仍可在重新预览后导入。

文件并非数字签名的不可编辑文档；签名者指纹用于核对目标插件的身份命名空间，不能证明文件作者或内容真实性。用户可以编辑允许的参数值，宿主在导入时逐项验证并显示差异。文件名和路径不作为身份依据。

最大256KiB UTF-8 JSON、64个values键；每个值只能是已声明可导出字段的合法primitive，沿用长度、数值范围和选项约束。拒绝未知键、原型键、对象/数组值、额外属性以及ID/签名者/版本/schema失配。导出使用紧凑JSON，以保证宿主生成的文件同样符合读取字节上限；文件权限0600。

## 用户流程与事务

设置页在存在可导出字段时显示“导出参数”和“导入参数”；整个插件必须可用且来自已验证签名的包。未签名开发目录源不提供文件迁移，普通参数编辑保持可用；没有真实签名者身份时不会生成空指纹备份。只有宿主窗口可调用这两个操作，隔离页面和运行时没有文件选取、任意路径读写或导入导出API。

- 导出：读取一致的参数快照，用户选择目标文件；写入前重查当前插件仍接受同一schema，以同目录随机暂存文件和rename提交。取消或写入失败不破坏原目标文件。
- 导入：用户选取普通文件，主进程有界读取和完整校验，再显示允许字段的旧值/新值，默认选择取消。读取后使用内存中的已预览数据；后续文件被替换不会改变已批准的内容。
- 确认时重新核对包签名及当前有效设置hash。当前包或参数与预览不一致则拒绝，要求重新导入。检查与提交共享现有每插件设置写入锁。
- 只合并values列出的参数，保留其余已声明本机参数；不导入storage、权限或启用状态。整份合法后才一次原子提交，不会逐字段部分生效。错误与取消不发送成功提示。
- 有实际变化时调用现有设置通知：打开的表单刷新，旧设置快照的扩展请求取消，新的请求使用新值；不重启运行时。无变化导入不重写、不发送变更通知。

原生文件对话框和确认期间全宿主最多一个参数传输操作；并发请求直接报忙，结束后释放容量。现有包安装/回滚操作不因文件确认长期持锁，确认绑定会阻止过期导入。

## 边界与复现

本增量严格拒绝跨schema自动转换；自动版本迁移、升降级回退状态、普通参数之外的专门凭据存储仍是E5后续工作。哈希匹配不是修改历史审计，也不检测值先变化又恢复的历史；它验证确认时的当前状态。

权威实现为 [settings.ts](../../src/common/plugin/settings.ts)、[security.ts](../../src/common/plugin/security.ts)、[service.ts](../../src/main/modules/plugin/service.ts) 和 [host IPC](../../src/main/modules/plugin/index.ts)。执行 `npm run test:collection` 验证契约与持久化；生产构建后执行 `npm run test:plugin-settings-transfer:app`，使用真实签名夹具与临时profile。证据目录可由 `LX_PLUGIN_SETTINGS_TRANSFER_EVIDENCE_DIR` 指定新路径。实际执行结果见 [验收记录](../records/插件参数导入导出实现与验收-2026-10-22.md)。
