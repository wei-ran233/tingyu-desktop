# AI 电台开发与模型接入

[功能索引](README.md) · [开发指南](../guides/development.md)

> 本文从原项目首页迁入，保留已有功能说明。电台已迁入 `src/renderer/bundles/radio/` 与 `src/main/bundles/radio/`；服务地址、默认模型和界面入口以当前实现与服务端为准。下文历史接入说明不代表本轮重新执行了外部服务验证。


运行 `npm ci` 安装依赖，再运行 `npm run dev` 启动桌面开发环境。项目需要 Node.js 22 或更新版本；建议使用 npm 10 或更新版本。

在「AI 电台 → 设置 → 模型与 API」中选择服务商，填写 API Key 和模型名称，再点击「测试连接」。OpenAI 使用 Responses，Anthropic 使用 Messages，Google 使用 Gemini 协议；DeepSeek、Groq、通用兼容接口使用 Chat Completions，OpenRouter 根据模型目录选择协议。连接测试、动态建议与聊天均通过 [pi-ai 的 Models/Provider 接口](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md)调用。

OpenCode Go 在「模型服务商」中选择。填写 API Key 后会自动读取服务端 `/models` 列表，也可点击「刷新模型」；支持搜索、点击选择、查看协议与推理标签，网络异常时保留内置目录。默认地址为 `https://opencode.ai/zen/go/v1`，默认模型为 `glm-5.2`；也支持官方的 `https://opencode.ai/inference/go/v1` 地址和 `opencode-go/<model-id>` 格式。在线新增的已知协议模型可直接使用，并会在重启后按需重新发现；缺少协议资料的模型会显示为「协议待确认」，避免猜测请求格式。Go 接入支持 Chat Completions、Responses、Messages 和 Gemini 协议。会话使用应用自身的标识，并在同一聊天的后续请求中保留 `x-opencode-session`。

电台页面会显示连接、思考、生成、搜歌、播放和语音准备等执行阶段，失败消息支持重试。右上角「播放队列」可以查看稍后播放与当前目录；推荐卡片支持「稍后播」。清空或移除待播项仅影响待播队列，不删除原歌单歌曲。服务地址、本地引擎探测与并发配置收纳在「高级连接设置」中。

Ollama 与 LM Studio 无需填写 API Key。可以使用本地探测选择已安装模型，也可以填写服务地址和模型名；本地 API 根地址自动补全 `/v1`。通用接口可以粘贴 API 根地址或完整的 `/chat/completions` 地址。自定义模型仍需具备所选协议要求的能力，音乐操作需要支持工具调用。

未配置远程模型时保留本地音乐推荐；已配置模型的请求失败会直接显示错误，便于检查配置。停止生成会中止后续工具执行。音乐工具的搜索结果直接生成卡片，工具执行结果回传模型后再继续生成回复。

运行 `npm run test:dj` 可启动仅监听回环地址的模拟模型服务，验证真实 SDK 的协议选择、流式响应、工具循环、错误与取消行为，无需真实 API Key。

### 对话、历史与服务进程

AI 电台支持多行输入：Enter 发送，Shift+Enter 换行，中文输入法确认不会误发送。模型回复支持经过 HTML 转义的 Markdown（标题、列表、代码、引用和 http/https 链接），原始 HTML 不执行。推理默认折叠；向上滚动阅读时暂停自动跟随，可以点击「回到最新消息」。

历史记录按本地日期分为今天、昨天、更早和日期未知，支持搜索标题、歌手与消息正文，支持重命名且后续回复不会覆盖用户标题。DJ 对话与普通聊天分别保存；旧记录保留，不确定日期的记录不会被错误归入今天。

模型列表、连接测试、流式生成和网络 TTS 请求由 Electron 主进程统一处理，支持取消、请求超时和窗口关闭时清理。音乐搜索与播放器工具仍由界面中的播放器模块执行。浏览器原生语音继续由界面播放。

密钥通过 Electron safeStorage 与系统密钥环加密后写入用户数据目录，浏览器设置仅保存引用；保存失败时原配置保留。Linux 的 basic_text 后端不视为安全加密；未提供系统加密时新密钥仅在本次会话保存，设置页会显示该状态。导出配置不包含密钥，导入到新设备后需重新填写。密钥输入框不回显已保存密钥，可以输入新值替换。

运行 `npm run test:dj` 会同时执行模型协议与对话体验检查，不使用真实付费模型 Key。


## 源码与验证入口

功能与渲染见 [radio bundle](../../src/renderer/bundles/radio/)，模型与 IPC 见 [common/dj](../../src/common/dj/)，凭据与网络语音服务见 [主进程 radio bundle](../../src/main/bundles/radio/)。生命周期迁移记录见 [电台独立插件化](../records/电台独立插件化与生命周期优化-2026-10-20.md)。

本地模拟回归使用 `npm run test:dj` 和 `npm run test:radio`；真实模型、天气、语音播放按 [验证指南](../guides/validation.md) 单独验证。
