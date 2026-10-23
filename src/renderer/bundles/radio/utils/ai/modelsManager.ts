import type { Context, AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { djRequest } from '../serviceBridge'
import type { ModelSettings, ActiveModelResolution, ProviderModelOption } from '@common/dj/models'
export { getProviderModels, hasLlmConfiguration, isLocalModel, normalizeBaseUrl } from '@common/dj/models'
export type { ModelSettings, ProviderModelOption } from '@common/dj/models'

export const fetchProviderModels = async(settings: ModelSettings, signal?: AbortSignal): Promise<ProviderModelOption[]> => djRequest('models', { settings }, signal)
export const completeModelText = async(settings: ModelSettings, prompt: string, signal?: AbortSignal): Promise<string> => djRequest('complete', { settings, prompt }, signal)
export const resolveConfiguredModel = async(settings: ModelSettings, signal?: AbortSignal): Promise<Pick<ActiveModelResolution, 'model'>> => djRequest('resolve', { settings }, signal)
export const streamModelTurn = async(settings: ModelSettings, context: Context, sessionId: string, signal: AbortSignal | undefined, onEvent: (event: AssistantMessageEvent) => void): Promise<AssistantMessage> => djRequest('stream', { settings, context, sessionId }, signal, onEvent)
