# 插件声明式 UI 扩展 SDK 1.7

[SDK 索引](README.md) · [实施计划](../plans/插件声明式UI扩展实现计划-2026-10-21.md)

API1.7新增renderer、slot、toolbar扩展点，运行时插件通过JSON数据贡献呈现。宿主绘制组件，插件不能传Vue组件、DOM、HTML、CSS、URL或脚本。原生功能模型保留在宿主；本轮搜索灵感试点不向插件暴露历史、歌单、凭据或任意功能对象。

## 清单

提供方以extensionPoints声明三种kind之一。input/output必须与[ui.ts](../../src/common/plugin/ui.ts)中的PLUGIN_UI_INPUT_SCHEMA/PLUGIN_UI_SCHEMA严格等价，属性顺序无关。固定schema是本版最小呈现协议；不能自行放宽字段或加入执行代码。

增强方声明必需依赖、extensions.render权限、runtime及extensions。以下是清单片段：

```json
{
  "apiVersion": "1.7.0",
  "permissions": ["extensions.render"],
  "dependencies": [{ "id": "lx.official-suite", "minVersion": "1.0.0", "maxVersionExclusive": "2.0.0" }],
  "runtime": { "entry": "runtime.html" },
  "extensions": [{ "id": "cards", "target": "lx.official-suite/search.suggestions.renderer", "version": "1.0.0", "handler": "cards", "title": "卡片" }]
}
```

title为纯文本名称，继承已有长度限制。API1.6及以下不允许UI kind或extensions.render。完整清单仍需基础字段和签名，运行时保留既有Node、网络、IPC和跨插件资源隔离。

## 数据与交互

宿主提供快照：

```js
{
  source: 'kw',                          // string <=32
  suggestions: ['雨天爵士'],              // <=12项，每项<=100
  actions: [{ id: 'lx.search-starters/next-set', title: '换一组' }] // <=12项
}
```

handler返回：

```js
window.lxRuntime.start({ handlers: {
  cards: input => ({
    layout: 'grid',
    heading: '发现下一首',
    items: input.suggestions.map(value => ({ label: value, command: 'search', value })),
  }),
} })
```

输出严格JSON：layout只能list/grid/row，heading最多100字符，items最多24项，每项label最多100字符，command最多8字符，value最多129字符。不接受非普通JSON容器、隐藏属性、访问器、symbol或额外字段。

| command | value约束 | 行为 |
| --- | --- | --- |
| text | 必须空字符串 | 只显示label |
| search | 必须是输入快照中的suggestions之一 | 宿主调用当前搜索功能模型 |
| action | 必须是输入快照中的actions.id之一 | 宿主调用已有动作路径，沿用busy/错误/取消逻辑 |

文本以Vue插值显示，类似HTML的字符串只显示字面内容。宿主在点击时再次按当前模型校验引用，隐藏页或动作busy时按钮不可执行。插件不能通过输出添加未公开动作或任意导航。

## 选择与生命周期

- listRenderers只读取active拥有者与active贡献目录，不执行handler。
- render按pluginId/extensionId明确选择，绝不因优先级自动换实现。同target/id仅1次在途，满则busy且不隔离。
- 依赖、精确点版本、权限、2秒超时、settings变化取消及旧实例拒绝沿用生命周期。非法输出会隔离故障运行时及依赖者，宿主呈现回退不等于自动执行其他第三方实现。
- 搜索三点分别保存用户选择；默认原生，不因安装或启用新插件自动选中。主题切换保留用户选择，不用主题覆盖第三方偏好。不可用时保留偏好但显示原生，恢复后重新加载。
- 宿主只切换该区域呈现，不重新初始化搜索模型。source/可见性/快照变化使旧结果失效；组件卸载清理监听和待加载结果。当前不提供跨IPC页面AbortSignal，废弃响应由宿主忽略，生命周期仍可取消。

## 当前试点与限制

官方整合包公开search.suggestions.renderer、search.suggestions.slot、search.suggestions.toolbar@1.0.0。默认关闭的[search-layouts](../../plugin-samples/search-layouts/manifest.json)提供列表、卡片、说明、工具栏；在“设置 → 维护与扩展”启用后，到空白搜索页分别选择。通常配合默认关闭的search-starters提供可编辑搜索词。

本版支持的是受限JSON呈现和三个实际宿主接入点。它不代表所有页面均已有插槽，不支持任意第三方组件、布局脚本、动态主题资源，也不替代原生feature注册器。为其他业务公开UI前应显式定义快照与能力，并增加宿主挂载位置和验收。

契约入口为`npm run test:collection`，真实应用入口为`npm run test:plugin-ui:app`。实际结果见[实现与验收](../records/插件声明式UI扩展实现与验收-2026-10-21.md)。
