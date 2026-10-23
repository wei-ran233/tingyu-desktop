import { Type, type Tool } from '@earendil-works/pi-ai'

/**
 * 搜索并播放歌曲工具
 * 供模型在识别到用户明确或模糊的点歌/推歌意图时调用
 */
export const searchAndPlayTool: Tool = {
  name: 'search_and_play',
  description: '在听域音乐库中搜索歌曲。支持按歌名、歌手搜索，并附带推荐理由与场景说明',
  parameters: Type.Object({
    keyword: Type.String({ description: '歌曲名称或搜索关键词（如 "晴天"、"夜曲"）' }),
    singer: Type.Optional(Type.String({ description: '歌手姓名，用于辅助精准匹配原唱' })),
    genre: Type.Optional(Type.String({ description: '音乐风格，如流行、爵士、R&B、摇滚' })),
    reason: Type.Optional(Type.String({ description: '推荐此歌曲的原因、场景匹配或与用户心情的共鸣' })),
    immediatePlay: Type.Optional(Type.Boolean({ description: '是否立即播放该歌曲，DJ 模式下建议为 true', default: true })),
  }, { additionalProperties: false }),
  constrainedSampling: { type: 'json_schema', strict: 'prefer' },
}

/**
 * 查询用户喜爱歌单工具
 * 从本地"我的喜爱"收藏夹中挑选匹配歌曲
 */
export const getFavoritesTool: Tool = {
  name: 'get_user_favorites',
  description: '查询用户在本地"我的喜爱"收藏夹中的歌曲列表，可按情绪或风格过滤',
  parameters: Type.Object({
    moodOrGenre: Type.Optional(Type.String({ description: '希望筛选的情绪或曲风标签，如"治愈"、"欢快"、"流行"' })),
    limit: Type.Optional(Type.Integer({ description: '返回的最大歌曲数量，默认 5 首', default: 5 })),
  }, { additionalProperties: false }),
}

/**
 * 播放器控制工具
 * 控制当前正在播放的音乐状态
 */
export const controlPlayerTool: Tool = {
  name: 'control_player',
  description: '控制当前音乐播放器的播放状态（播放、暂停、切歌）',
  parameters: Type.Object({
    action: Type.Union([
      Type.Literal('play'),
      Type.Literal('pause'),
      Type.Literal('next'),
      Type.Literal('prev'),
    ], { description: '播放器指令: play(继续播放), pause(暂停), next(下一首), prev(上一首)' }),
  }, { additionalProperties: false }),
}

/** 所有可用工具列表 */
export const DJ_TOOLS: Tool[] = [
  searchAndPlayTool,
  getFavoritesTool,
  controlPlayerTool,
]
