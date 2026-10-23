# 主题资源 SDK 1.8

[SDK索引](README.md) · [实施计划](../plans/主题资源扩展实现计划-2026-10-21.md)

API1.8在theme.contribute/theme.appearance上增加theme.resources权限及包内资源声明。旧包保留原有限身份、布局、动效与签名格式。新增主题可组合宿主预设和有界数据，不需新增主题专属源代码。

## 声明示例

下面是theme条目片段，完整清单仍需id/name/version/main/apiVersion、权限及签名。资源随.lxplugin签名，路径相对于本插件根目录。

```json
{
  "id": "paper-light",
  "name": "纸间 · 日光",
  "tokens": { "--lx-accent": "#a46b39" },
  "appearance": {
    "identity": "paper", "layout": "sidebar", "background": "image",
    "detail": "sleeve", "content": "full",
    "metrics": { "sidebarWidth": 176, "radius": 18, "spacing": 12 },
    "motion": { "durationMs": 8000, "enabled": true }
  },
  "resources": {
    "background": "assets/paper.png",
    "icons": {
      "search": { "path": "M5 5h12v12H5ZM16 16l5 5" },
      "brand": { "path": "M4 3h12l4 4v14H4Z" }
    }
  }
}
```

resources需要theme.resources和theme.contribute；appearance仍需theme.appearance。新资源字段、自定义身份、image/none背景、metrics和motion需API1.8。identity为最多64字符的安全小写ID，禁止原型保留名；主题名称/说明来自清单。legacy tide/signal/petals保持已有专属表现，新身份不会误用它们的组件或图标。

## 图片与图标边界

- background只允许安全相对.png路径，不允许绝对路径、目录穿越、反斜杠、协议、query或fragment。字段省略表示无图片；显式null拒绝。
- 背景经主窗口主frame的白名单请求读取，调用方只传pluginId/themeId，不能传文件路径。插件运行时/隔离页面没有资源读取新接口。
- 读取前检查插件有效状态和权限，资源从签名摘要校验路径读取，读取后再次确认包身份；替换或停用中的结果拒绝。
- PNG压缩字节与重编码结果各最多2MiB，边长最多4096，像素最多8388608。先检查头和chunk边界，拒绝动画PNG及缺失结束块，再用nativeImage解码重编码。坏图片无法应用；不把“PNG头看似正确”作为解码成功。
- 宿主仅接收生成的data:image/png，不将插件原始字节当HTML/CSS/SVG注入，不开放外网。
- icons最多32项，名称为安全字母开头的字母/数字/连字符ID，禁止constructor/prototype等保留名。每项只有path和可选filled，path最多2048字符，只能包含SVG d命令及数字分隔符，不允许markup、URL或任意属性。宿主生成symbol/path。
- 常见图标名可覆盖search/play/pause等；brand用于品牌图形。没声明的图标继续使用原版，legacy主题可叠加覆盖。

## 布局、动效与恢复

布局仍采用宿主拥有的sidebar/rail/topbar、cinema/sleeve/poster、full/focus等预设。metrics必须完整包含sidebarWidth(56..240px)、radius(0..32px)、spacing(0..24px)，仅影响宿主指定的侧栏布局尺寸；rail/topbar不自动继承sidebarWidth。motion必须完整包含durationMs(1000..120000)和enabled布尔，仅作用于宿主已有背景动画。

全局动效关闭优先于主题enabled；系统prefers-reduced-motion减少动效规则优先。静态PNG本身不产生动画。隐藏页面暂停背景动画，恢复可见后按当前设置处理。

选择时先准备资源与渲染，然后原子提交；旧异步选择不得覆盖新主题。应用新主题失败时保留此前可用主题；当前已选资源重载失败时恢复宿主。停用/卸载/不可用会清理图片、动态图标、身份与布局变量，并恢复宿主外观。主题偏好和日常数据按已有保存语义处理，本轮不增加凭据能力。

## 样例与验收

[paper-theme](../../plugin-samples/paper-theme/manifest.json)默认关闭，提供日光/夜读两款，使用同一包内PNG和两个图标，通过清单组合外观；无需新增paper专属宿主分支。

契约入口`npm run test:collection`，legacy主题控制器`npm run test:theme`，真实图片/界面`npm run test:theme-resources:app`。实际结果见[实现与验收](../records/主题资源扩展实现与验收-2026-10-22.md)。

本版仍不支持任意CSS、字体、SVG文件、远程资源、可执行布局或新动画关键帧。E3已交付的是受限资源与参数协议，不等同于任意主题引擎。
