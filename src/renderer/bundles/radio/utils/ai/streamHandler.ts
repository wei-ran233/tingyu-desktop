import { validateToolCall, type Context, type Message } from '@earendil-works/pi-ai'
import { DJ_TOOLS } from './tools'
import { resolveConfiguredModel, streamModelTurn, type ModelSettings } from './modelsManager'
import { executeToolAction, type ToolExecutionContext } from './toolExecutor'
import type { DjMode, StreamCallbacks, ToolCall, WeatherType, GenerationStatus } from '@renderer/bundles/radio/utils/types'

export interface AiConversationOptions {
  sessionId?: string
  settings: ModelSettings
  mode: DjMode
  weatherStr: string
  weatherType: WeatherType
  systemPrompt: string
  messages: Array<{ role: 'user' | 'assistant', content: string }>
  callbacks: StreamCallbacks
  signal?: AbortSignal
  onFoundMusicCard?: (card: any) => void
  excludedSongNames?: string[]
}

/**
 * 运行基于 @earendil-works/pi-ai 的全流程 Agent 对话与工具调用闭环
 */
export async function runPiAiConversation(options: AiConversationOptions): Promise<void> {
  const { mode, weatherType, systemPrompt, messages, callbacks, signal, onFoundMusicCard } = options
  const { model } = await resolveConfiguredModel(options.settings, signal)

  // 构造标准 pi-ai 格式的初始上下文
  const contextMessages: Message[] = messages.map(m => m.role === 'user'
    ? { role: 'user', content: m.content, timestamp: Date.now() }
    : {
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: Date.now(),
      })

  const context: Context = {
    systemPrompt,
    messages: contextMessages,
    tools: DJ_TOOLS,
  }

  const toolExecCtx: ToolExecutionContext = {
    mode,
    excludedSongNames: new Set(options.excludedSongNames ?? []),
    weatherType,
    onFoundMusicCard,
    signal,
    onStatus: callbacks.onStatus,
  }

  const sessionId = options.sessionId ?? crypto.randomUUID()
  let lastPhase = ''
  const notify = (phase: GenerationStatus['phase'], text: string) => {
    if (phase === lastPhase) return
    lastPhase = phase
    callbacks.onStatus?.({ phase, text })
  }
  let accumulatedText = ''
  let lastExecutedToolCall: ToolCall | undefined
  const MAX_AGENT_TURNS = 6
  let turn = 0

  while (turn < MAX_AGENT_TURNS) {
    if (signal?.aborted) {
      const abortErr = new Error('请求已取消')
      abortErr.name = 'AbortError'
      throw abortErr
    }
    turn++

    notify('connecting', turn === 1 ? '正在连接模型' : '正在整理工具执行结果')
    const finalMessage = await streamModelTurn(options.settings, context, sessionId, signal, event => {
      if (signal?.aborted) return

      switch (event.type) {
        case 'text_delta':
          notify('generating', '正在生成回复')
          accumulatedText += event.delta
          callbacks.onToken(event.delta)
          break

        case 'thinking_delta':
          notify('thinking', '模型正在思考')
          callbacks.onThinkingDelta?.(event.delta)
          break

        case 'thinking_end':
          callbacks.onThinkingEnd?.()
          break

        case 'toolcall_end':
          // 捕获到了一个完整工具调用
          lastExecutedToolCall = {
            name: event.toolCall.name,
            arguments: event.toolCall.arguments || {},
          }
          void callbacks.onToolCall?.(lastExecutedToolCall)
          break

        case 'error':
          throw new Error(event.error.errorMessage ?? 'AI 生成异常')
      }
    })

    if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' })

    if (finalMessage.stopReason === 'error' || finalMessage.stopReason === 'aborted') {
      throw Object.assign(new Error(finalMessage.errorMessage ?? 'AI 生成中断'), { name: finalMessage.stopReason === 'aborted' ? 'AbortError' : 'Error' })
    }
    context.messages.push(finalMessage)

    // 检查模型回复中是否触发了工具调用
    const toolCalls = finalMessage.content.filter(b => b.type === 'toolCall')
    if (!toolCalls || toolCalls.length === 0) {
      // 无工具调用，本轮对话自然完成
      break
    }

    if (turn === MAX_AGENT_TURNS) throw new Error('工具调用次数已达上限，请缩小问题范围后重试')

    // 执行所有触发的工具，并将结果作为 toolResult 回填上下文
    for (const call of toolCalls) {
      if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' })
      let resultText = ''
      let isError = false
      try {
        const validatedArgs = validateToolCall(context.tools!, call)
        notify(call.name === 'control_player' ? 'playing' : 'searching', call.name === 'control_player' ? '正在操作播放器' : call.name === 'get_user_favorites' ? '正在读取收藏偏好' : '正在搜索歌曲')
        const execResult = await executeToolAction(call.name, validatedArgs, toolExecCtx)
        resultText = JSON.stringify(execResult)
      } catch (toolErr: any) {
        if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' })
        resultText = JSON.stringify({ error: toolErr.message || '执行失败' })
        isError = true
      }

      context.messages.push({
        role: 'toolResult',
        toolCallId: call.id,
        toolName: call.name,
        content: [{ type: 'text', text: resultText }],
        isError,
        timestamp: Date.now(),
      })
    }
    // 循环继续，进入下一轮让模型根据工具执行结果生成总结/串词
  }

  await callbacks.onComplete(accumulatedText, lastExecutedToolCall)
}
