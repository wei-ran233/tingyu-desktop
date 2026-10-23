# 插件运行时与功能增强 SDK 1.3

## 清单与加载

插件必须先通过签名与文件摘要验证。后台运行时可选，入口为本包内的 HTML，页面必须引用本包脚本；CSP 禁止内联脚本、远程脚本与网络。依赖不会授予对其他包资源、宿主对象或文件系统的访问权。

```json
{
  "id": "example.search-enhancer",
  "name": "搜索增强",
  "version": "1.0.0",
  "apiVersion": "1.3.0",
  "main": "index.html",
  "permissions": ["extensions.process"],
  "dependencies": [{ "id": "lx.official-suite", "minVersion": "1.0.0", "maxVersionExclusive": "2.0.0" }],
  "runtime": { "entry": "runtime.html", "timeoutMs": 3000 },
  "extensions": [{ "id": "clean", "target": "lx.official-suite/search.query", "version": "1.0.0", "handler": "clean", "priority": 0 }]
}
```

签名、公钥字段由打包工具填写；样例开发签名不用于正式发行。`defaultEnabled:false` 只影响第一次导入随应用捆绑的包，后续更新保留用户开关；手动安装仍走安装授权流程。

## 运行时脚本

`runtime.html`：

```html
<!doctype html><html><meta charset="utf-8"><script src="runtime.js"></script></html>
```

`runtime.js`：

```js
void window.lxRuntime.start({
  async activate(context) {
    if (context.isCancelled()) throw new Error('Cancelled')
    // 等待本模块准备完成。依赖者只能在此 Promise 完成后启动。
  },
  async deactivate() {
    // 清理本模块的定时器与其他本地资源；宿主有超时与强制销毁边界。
  },
  handlers: {
    async clean(input, context) {
      if (context.isCancelled()) throw new Error('Cancelled')
      return { text: input.text.trim() }
    },
  },
})
```

context 包含本插件声明的设置快照、`isCancelled()`、`onCancel(callback)`。每次调用重新读取设置；onCancel 返回取消订阅函数。不要保留过期参数或在取消后继续产生结果。运行时没有 `require`、通用 ipcRenderer、存储或管理接口；需要的能力通过后续明确的契约扩展，而非任意宿主调用。

start 只能调用一次。处理器必须是可重复应用的纯数据处理，避免依赖 DOM 或页面渲染；宿主会克隆输入输出并校验。当前 `search.query` 接收和返回 `{text:string}`，字符串长度不超过 4096，不接受其他字段。用户原始路由参数保持原样，有效处理结果交给搜索模型，避免通过反复路由重定向重复处理。

## 提供扩展点

```json
{
  "extensionPoints": [{
    "id": "search.query",
    "version": "1.0.0",
    "kind": "processor",
    "input": { "type": "object", "properties": { "text": { "type": "string", "maxLength": 4096 } } },
    "output": { "type": "object", "properties": { "text": { "type": "string", "maxLength": 4096 } } }
  }]
}
```

声明本身不会把第三方代码注入另一个插件。当前功能入口由受信任宿主调用处理链，试点只接入官方搜索；任意插件间的 RPC、provider/action/event 与 UI 扩展点尚未开放。新增点需要提供方显式接入调用边界并审核数据范围。

## 故障和重试

- A 的依赖 B 未准备好时 A 不启动；缺少点、版本冲突或权限缺失时 A 阻塞。
- 初始化失败、崩溃、超时或非法输出隔离该插件；停止其依赖者，不自动重复拉起。重新启用或更新可重试。
- 停用 B 时先取消受影响请求，再以 A→B 顺序等待清理并销毁沙箱。
- 搜索调用边界在扩展失败时保留原搜索输入，错误被记录；它不会接受失败处理器的部分输出。
- 管理、主题、集合和页面继续检查 active 与依赖状态，后台模块失败时不会留下可调用的页面贡献。

## 验证

`npm run test:collection` 含通用生命周期与 schema 契约；`npm run test:plugin-lifecycle:app` 使用生产 Electron、签名样例及临时配置，检查真实隔离、异步初始化、处理效果、两种渲染、逆序撤销、取消、超时与崩溃恢复。不会修改实际用户的插件开关或参数。

## 2026-10-21 稳定性约定

处理请求仅随参与的拥有者或处理链变化失效；切换无关插件不会取消在途请求。旧运行实例的迟到错误不得影响新实例。对象 schema 比较忽略属性声明顺序，仍严格比较字段和类型约束。包变更等待已提交中的设置写入完成；已启用但失败的插件可在设置中点击“重新初始化插件”，保留现有参数后重新检查依赖并启动。详见 [稳定性优化记录](../records/插件运行时稳定性优化-2026-10-21.md)。

## 2026-10-21：API 1.4 数据提供器

已新增通用 provider、extensions.provide 权限和有上限的数组 schema，并接入默认关闭的搜索灵感插件。旧版 processor 契约继续兼容；provider 允许不同输入输出，并按优先级只选择一个实现。详见 [SDK 1.4](插件数据提供器SDK-1.4.md) 和 [本轮验收](../records/插件数据提供器验收-2026-10-21.md)。通用 action/event、动态渲染插槽与主题协议等仍待实施。
