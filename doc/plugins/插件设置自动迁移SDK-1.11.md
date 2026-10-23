# 插件设置自动迁移 SDK 1.11

[插件 SDK 索引](README.md) · [实施计划](../plans/插件设置自动迁移实现计划-2026-10-22.md)

API `1.11.0` 为已签名插件包增加有界的声明式设置迁移，以及与包回滚绑定的参数快照。这是 E5b；文件导入仍遵循 [SDK 1.10](插件参数导入导出SDK-1.10.md) 的精确版本和 schema 匹配规则。

## 清单声明

```json
{
  "apiVersion": "1.11.0",
  "permissions": ["settings.scoped"],
  "settingsVersion": 3,
  "settings": [
    { "key": "label", "title": "标题", "type": "string", "default": "音乐", "maxLength": 100 },
    { "key": "compact", "title": "紧凑显示", "type": "boolean", "default": false }
  ],
  "settingsMigrations": [
    { "fromVersion": 1, "toVersion": 2, "rename": { "title": "intermediateTitle" }, "remove": ["legacyOption"] },
    { "fromVersion": 2, "toVersion": 3, "rename": { "intermediateTitle": "label" } }
  ]
}
```

示例省略插件 ID、入口和签名等既有必填项。显式声明 `settingsMigrations`（包括空数组）要求 API 主版本 1、最低版本 1.11、`settings.scoped` 和显式 `settingsVersion`。未使用新字段的旧清单不会补入迁移字段，原有 canonical 签名载荷保持。

每个迁移步骤只接受 `fromVersion`、`toVersion`、`rename`、`remove`。最多 16 步；版本为 1 至 1000000 的整数，`fromVersion < toVersion <= settingsVersion`，同一 `fromVersion` 只能出现一次。每步最多 64 个重命名和 64 个删除项，沿用设置键的长度和字符规则，拒绝原型键、重复删除、重复目标、同名重命名，以及删除项与重命名源/目标重叠。

从已安装版本沿唯一 `fromVersion` 链执行至目标版本，不要求声明顺序与执行顺序相同；缺失路径直接拒绝升级。重命名在每一步内同时执行，支持交换两个键；目标覆盖该步仍保留的其他键则拒绝。不存在的源/删除键不引入新值；新增字段使用最终声明的默认值。最终残留未知键或值不符合当前字段约束时拒绝，原参数不变。

字段值仅允许合法的字符串、数字、布尔值。协议不执行插件 JS，不提供任意类型转换、条件逻辑或跨插件读取。作者需要保留可支持旧版本的迁移链；移除旧链后，对应旧版不能直接升级。

## 升级与回滚

首次出现迁移声明、设置版本发生变化，或已安装包拥有快照指针时，进入快照管理。全新安装直接使用当前默认值，不执行历史迁移；没有新声明且设置版本不变的旧插件继续使用原有扁平文件语义。

1. 验证签名、包资源和迁移声明，读取升级前已声明参数并补入旧默认值。旧文件缺失视为旧默认值；损坏 JSON、非法值、未知键、非普通文件及超过 2 MiB 的文件拒绝迁移。支持 `O_NOFOLLOW` 的平台拒绝读取末级符号链接。
2. 在当前插件命名空间内独占创建随机命名、权限 0600 的新参数文件，再准备新包。包注册表通过一次原子 rename 同时选择包版本与 `settingsFile` 指针；公开内存目录在持久化成功后才发布候选版本，提交期间列表、schema 和页面仍取旧包。提交失败清理新暂存内容，旧参数文件不被覆盖；这是应用事务验证，不是断电或磁盘损坏恢复保证。
3. 成功后设置读取、单字段保存、导入和恢复默认都定位当前指针。包变更与设置写入共享每插件锁；公开读取等待正在提交的变更，避免读取尚未提交的参数。表单和新运行实例接收新的参数。
4. 只保留当前包和一次回滚所需的参数文件。再次升级后清理不再引用的旧文件，卸载时删除当前与 previous 参数文件。

回滚恢复升级前包和当时的参数快照；不根据新版值推测逆向转换。用户在新版期间的修改不会写回旧版快照，执行回滚后新版快照会被清理。首次从旧扁平文件迁移时，回滚指向原扁平文件。

快照管理中，同一个 `settingsVersion` 必须保持完整设置声明一致；标题、顺序、默认值和约束变化也需要提升版本，并可用空操作步骤 `{ "fromVersion": 3, "toVersion": 4 }` 明确迁移。直接安装较低设置版本被拒绝，请使用已保存的回滚版本。未签名开发目录不执行迁移，也不能覆盖已有快照管理的包；开发验证需生成签名测试包。

## 兼容与复现

`settingsVersion` 独立于包版本、宿主 API 版本和扩展点版本。迁移声明属于签名清单；注册表 `settingsFile` 是宿主内部字段，不由插件自行指定。当前规则不自动转换旧备份文件；旧 schema 文件导入仍拒绝。第三方专门凭据存储、复杂转换和多历史版本恢复继续待实现。

权威实现：[类型](../../src/common/plugin/types.ts)、[声明校验](../../src/common/plugin/security.ts)、[纯迁移器](../../src/common/plugin/settingsMigration.ts)、[快照准备](../../src/main/modules/plugin/settingsSnapshots.ts)、[安装器](../../src/main/modules/plugin/installer.ts) 与 [设置服务](../../src/main/modules/plugin/service.ts)。

运行 `npm run test:collection` 验证契约、持久化和失败保护；生产 main/renderer 构建后运行 `npm run test:plugin-settings-migration:app`。使用 `LX_PLUGIN_SETTINGS_MIGRATION_EVIDENCE_DIR` 指定独立证据目录，脚本使用真实签名夹具和临时 profile。结果与限制见 [本轮验收记录](../records/插件设置自动迁移实现与验收-2026-10-22.md)。
