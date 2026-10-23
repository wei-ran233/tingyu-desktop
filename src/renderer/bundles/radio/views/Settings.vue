<template>
  <settings-form>
    <div :class="$style.contentPanel" class="radio-settings-fields" :data-radio-section="activeCategory">
            <!--  模型与 API -->
            <div v-if="activeCategory === 'llm'" :class="$style.section">
              <h4 :class="$style.sectionTitle"><DjIcon name="model" /> 模型连接</h4>
              <div :class="$style.formGroup">
                <label>模型服务商</label>
                <select v-model="form.selectedModel" :class="$style.select" @change="onModelSelectChange">
                  <option value="openai-compatible">OpenAI 兼容接口（通用）</option>
                  <option value="openai">OpenAI（Responses）</option>
                  <option value="anthropic">Anthropic（Messages）</option>
                  <option value="google">Google Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="opencode-go">OpenCode Go（订阅）</option>
                  <option value="deepseek">DeepSeek (深度求索)</option>
                  <option value="ollama">Ollama 本地引擎 (免 Key)</option>
                  <option value="lmstudio">LM Studio 本地引擎 (免 Key)</option>
                  <option value="glm-4.7-flash">智谱 GLM-4.7-Flash</option>
                  <option value="qwen-turbo">阿里通义千问 Qwen-Turbo</option>
                  <option value="custom">自定义模型</option>
                </select>
              </div>

              <div :class="$style.quickPresets">
                <span :class="$style.quickLabel">一键预设：</span>
                <button
                  v-for="preset in quickPresets"
                  :key="preset.id"
                  type="button"
                  :class="[$style.quickBtn, { [$style.quickBtnActive]: form.selectedModel === preset.id }]"
                  @click="applyQuickPreset(preset.id)"
                >
                  {{ preset.label }}
                </button>
              </div>

              <div v-if="isLocalProvider" :class="$style.localEngineBox">
                <div :class="$style.localEngineHeader">
                  <span><DjIcon name="server" /> 本地模型自发现 (Ollama / LM Studio)</span>
                  <button
                    type="button"
                    :class="$style.detectBtn"
                    :disabled="detectingLocal"
                    @click="scanLocalModels"
                  >
                    <DjIcon name="search" /> {{ detectingLocal ? '探测中...' : '探测本地模型' }}
                  </button>
                </div>
                <div v-if="localDiscoveredModels.length > 0" :class="$style.discoveredChips">
                  <span :class="$style.discoveredLabel">已发现模型（点击选用）：</span>
                  <button
                    v-for="m in localDiscoveredModels"
                    :key="m.source + m.id"
                    type="button"
                    :class="[$style.discoveredChip, { [$style.activeDiscoveredChip]: form.customModelName === m.id }]"
                    @click="selectDiscoveredModel(m)"
                  >
                    {{ m.name }} {{ m.size ? `(${m.size})` : '' }}
                  </button>
                </div>
                <p v-else-if="detectStatusText" :class="$style.detectStatusTip">
                  {{ detectStatusText }}
                </p>
              </div>

              <p v-if="form.selectedModel === 'opencode-go'" :class="$style.fieldTip">填写 Go API Key 后会自动读取在线模型列表。选择模型后，协议和接口路径自动匹配。</p>
              <div v-if="!isLocalProvider" :class="$style.formGroup">
                <label>API Key</label>
                <div :class="$style.inputWithBtn">
                  <input
                    :value="form.apiKey.startsWith('lx-vault:') ? '' : form.apiKey"
                    :type="showApiKey ? 'text' : 'password'"
                    :placeholder="form.apiKey.startsWith('lx-vault:') ? '已安全保存，输入新 Key 可替换' : '输入你的 API Key'"
                    :class="$style.input"
                    @input="form.apiKey = $event.target.value"
                  />
                  <button :class="$style.iconBtn" type="button" :aria-label="showApiKey ? '隐藏 API Key' : '显示 API Key'" @click="showApiKey = !showApiKey">
                    <DjIcon :name="showApiKey ? 'hidden' : 'eye'" />
                  </button>
                </div>
              </div>

              <div :class="$style.connectionRow">
                <button :class="$style.testBtn" type="button" :disabled="testing" @click="testConnection">
                  <DjIcon name="server" /> {{ testing ? '测试中...' : '测试连接' }}
                </button>
                <span v-if="testResult" :class="[$style.testResult, testResult.ok ? $style.testOk : $style.testFail]">
                  {{ testResult.msg }}
                </span>
              </div>

              <p :class="$style.fieldTip" role="status">{{ credentialStorage === 'system' ? '密钥已由系统密钥环保护，配置备份不包含密钥。' : credentialStorage === 'session' ? '系统密钥环不可用：新密钥仅保留在本次运行内，重启后需重新输入。' : '正在连接密钥存储；原配置会在安全迁移成功后更新。' }}</p>
              <ModelPicker v-model="form.customModelName" :settings="form" />
              <details :class="$style.advancedSettings">
                <summary>高级连接设置</summary>
                <div :class="$style.formGroup">
                  <label>API Base URL</label>
                  <input v-model="form.baseUrl" type="text" placeholder="https://api.openai.com/v1/" :class="$style.input" />
                  <p :class="$style.fieldTip">填写服务商 API 根地址；本地引擎会自动补全 /v1，连接测试与对话使用相同协议</p>
                </div>

                <div :class="$style.formGroup">
                  <label>请求并发限制</label>
                  <div :class="$style.sliderRow">
                    <input v-model.number="form.concurrencyLimit" type="range" min="1" max="10" :class="$style.slider" />
                    <span>{{ form.concurrencyLimit }} 次</span>
                  </div>
                  <p :class="$style.fieldTip">控制同时进行的请求数量；较低的数值可减少接口限流</p>
                </div>
              </details>
            </div>

            <!--  DJ 人设 -->
            <div v-if="activeCategory === 'djPrompt'" :class="$style.section">
              <h4 :class="$style.sectionTitle"><DjIcon name="headphones" /> DJ 模式人设</h4>
              <p :class="$style.fieldTip">不配置时使用内置模板，留空即可。</p>

              <div v-for="field in djPromptFields" :key="field.key" :class="$style.formGroup">
                <div :class="$style.labelRow">
                  <label>{{ field.label }}</label>
                  <button :class="$style.resetBtn" type="button" @click="resetField('dj', field.key)">↺ 恢复默认</button>
                </div>
                <textarea
                  :value="form[field.key]"
                  :rows="field.rows"
                  :placeholder="field.placeholder"
                  :class="$style.textarea"
                  @input="form[field.key] = $event.target.value"
                ></textarea>
              </div>
            </div>

            <!--  聊天人设 -->
            <div v-if="activeCategory === 'chatPrompt'" :class="$style.section">
              <h4 :class="$style.sectionTitle"><DjIcon name="chat" /> 聊天模式人设</h4>
              <p :class="$style.fieldTip">不配置时使用内置模板，留空即可。</p>

              <div v-for="field in chatPromptFields" :key="field.key" :class="$style.formGroup">
                <div :class="$style.labelRow">
                  <label>{{ field.label }}</label>
                  <button :class="$style.resetBtn" type="button" @click="resetField('chat', field.key)">↺ 恢复默认</button>
                </div>
                <textarea
                  :value="form[field.key]"
                  :rows="field.rows"
                  :placeholder="field.placeholder"
                  :class="$style.textarea"
                  @input="form[field.key] = $event.target.value"
                ></textarea>
              </div>
            </div>

            <!--  语音播报 -->
            <div v-if="activeCategory === 'tts'" :class="$style.section">
              <h4 :class="$style.sectionTitle"><DjIcon name="voice" /> 语音播报</h4>

              <!-- 渠道选择（类似模型选择器） -->
              <div :class="$style.formGroup">
                <label>选择播报渠道</label>
                <select v-model="form.ttsEngine" :class="$style.select">
                  <option v-for="ch in ttsChannels" :key="ch.id" :value="ch.id">{{ ch.label }}</option>
                </select>
                <p :class="$style.fieldTip">{{ ttsChannelHint }}</p>
              </div>

              <div :class="$style.formGroup">
                <label>播报语言</label>
                <select v-model="form.ttsLang" :class="$style.select">
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁体中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
              <div :class="$style.formGroup">
                <button type="button" :class="$style.cancelBtn" :disabled="ttsTesting" @click="testTts">{{ ttsTesting ? '正在测试…' : '测试语音' }}</button>
                <p v-if="ttsTestResult" role="status" :class="$style.fieldTip">{{ ttsTestResult }}</p>
                <p :class="$style.fieldTip">使用当前填写的配置测试。云端播报由 AI 合成。</p>
              </div>
              <template v-if="form.ttsEngine === 'volcengine-v3-tts'">
                <div :class="$style.formGroup">
                  <label>火山官方音色（豆包 2.0）</label>
                  <button type="button" :class="$style.cancelBtn" :disabled="voiceCatalogLoading" @click="refreshVoiceCatalog">{{ voiceCatalogLoading ? '正在读取官网…' : '刷新官方音色' }}</button>
                  <p role="status" :class="$style.fieldTip">{{ voiceCatalogStatus }}</p>
                  <input v-model="voiceCatalogQuery" type="search" placeholder="搜索音色名称、语言或 ID" aria-label="搜索火山音色" :class="$style.input" />
                  <select v-model="form.ttsVoice" aria-label="火山音色列表" :class="$style.select">
                    <option value="">Vivi 2.0（默认）</option>
                    <option v-for="voice in visibleVolcengineVoices" :key="voice.id" :value="voice.id">{{ voice.name }}</option>
                    <option v-if="form.ttsVoice && !volcengineVoices.some(v => v.id === form.ttsVoice)" :value="form.ttsVoice">自定义：{{ form.ttsVoice }}</option>
                  </select>
                  <p :class="$style.fieldTip">已载入 {{ volcengineVoices.length }} 个官方公开音色。选中后点击“测试语音”试听，实际可用性以账号资源权限为准。</p>
                </div>
                <div :class="$style.formGroup">
                  <label>Resource ID（资源模型）</label>
                  <input v-model="form.ttsResourceId" type="text" placeholder="seed-tts-2.0" :class="$style.input" />
                </div>
              </template>
              <!-- 发音人选择（大部分渠道通用） -->
              <div v-if="form.ttsEngine !== 'youdao-tts'" :class="$style.formGroup">
                <label>播报发音人</label>
                <input
                  v-model="form.ttsVoice"
                  type="text"
                  :placeholder="voicePlaceholder"
                  :class="$style.input"
                />
              </div>

              <!-- 渠道专属配置 -->
              <template v-if="needsApiKey">
                <div :class="$style.formGroup">
                  <label>API Key</label>
                  <input v-model="form.ttsApiKey" type="password" placeholder="输入 TTS API Key" :class="$style.input" />
                </div>
              </template>

              <template v-if="form.ttsEngine === 'azure-tts'">
                <div :class="$style.formGroup">
                  <label>Region（区域）</label>
                  <input v-model="form.ttsRegion" type="text" placeholder="eastasia" :class="$style.input" />
                  <p :class="$style.fieldTip">Azure 语音服务的区域，如 eastasia / eastus</p>
                </div>
              </template>

              <template v-if="form.ttsEngine === 'iflytek-tts'">
                <div :class="$style.formGroup">
                  <label>App ID</label>
                  <input v-model="form.ttsAppId" type="text" placeholder="讯飞开放平台 AppID" :class="$style.input" />
                </div>
                <div :class="$style.formGroup">
                  <label>API Secret</label>
                  <input v-model="form.ttsCustomUrl" type="password" placeholder="讯飞 APISecret" :class="$style.input" />
                </div>
              </template>

              <template v-if="form.ttsEngine === 'volcengine-tts'">
                <div :class="$style.formGroup">
                  <label>App ID</label>
                  <input v-model="form.ttsAppId" type="text" placeholder="火山引擎应用 ID" :class="$style.input" />
                </div>
              </template>

              <template v-if="form.ttsEngine === 'custom-tts'">
                <div :class="$style.formGroup">
                  <label>自定义 API Endpoint</label>
                  <input v-model="form.ttsCustomUrl" type="text" placeholder="https://your-tts-service.com/v1/audio/speech" :class="$style.input" />
                </div>
              </template>

              <!-- 语速 / 音调（部分渠道） -->
              <div v-if="form.ttsEngine !== 'youdao-tts'" :class="$style.twoCol">
                <div :class="$style.formGroup">
                  <label>语速 {{ form.ttsSpeed }}x</label>
                  <input v-model.number="form.ttsSpeed" type="range" min="0.5" max="2" step="0.1" :class="$style.slider" />
                </div>
                <div :class="$style.formGroup">
                  <label>音调 {{ form.ttsPitch }}x（系统 / Azure）</label>
                  <input v-model.number="form.ttsPitch" :disabled="!['web-speech', 'azure-tts'].includes(form.ttsEngine)" type="range" min="0.5" max="2" step="0.1" :class="$style.slider" />
                </div>
              </div>

              <!-- Switch 风格开关 -->
              <div :class="$style.switchList">
                <div :class="$style.switchItem">
                  <div :class="$style.switchText">
                    <span :class="$style.switchTitle"><DjIcon name="chat" /> 聊天播报</span>
                    <span :class="$style.switchDesc">聊天回复时播放语音</span>
                  </div>
                  <button
                    :class="[$style.switch, { [$style.switchOn]: form.enableChatSpeech }]"
                    @click="form.enableChatSpeech = !form.enableChatSpeech"
                  >
                    <span :class="$style.switchThumb"></span>
                  </button>
                </div>
                <div :class="$style.switchItem">
                  <div :class="$style.switchText">
                    <span :class="$style.switchTitle"><DjIcon name="headphones" /> DJ 串场播报</span>
                    <span :class="$style.switchDesc">切歌推荐时播放 DJ 语音</span>
                  </div>
                  <button
                    :class="[$style.switch, { [$style.switchOn]: form.enableDjSpeech }]"
                    @click="form.enableDjSpeech = !form.enableDjSpeech"
                  >
                    <span :class="$style.switchThumb"></span>
                  </button>
                </div>
                <div :class="$style.switchItem">
                  <div :class="$style.switchText">
                    <span :class="$style.switchTitle"><DjIcon name="music" /> 自动连播</span>
                    <span :class="$style.switchDesc">一首歌播完后自动推荐并播放下一首</span>
                  </div>
                  <button
                    :class="[$style.switch, { [$style.switchOn]: form.autoContinue }]"
                    @click="form.autoContinue = !form.autoContinue"
                  >
                    <span :class="$style.switchThumb"></span>
                  </button>
                </div>
                <div :class="$style.switchItem">
                  <div :class="$style.switchText">
                    <span :class="$style.switchTitle"><DjIcon name="headphones" /> 推荐即播</span>
                    <span :class="$style.switchDesc">DJ 推荐歌曲后立即切换播放（无需手动点击）</span>
                  </div>
                  <button
                    :class="[$style.switch, { [$style.switchOn]: form.djAutoPlay }]"
                    @click="form.djAutoPlay = !form.djAutoPlay"
                  >
                    <span :class="$style.switchThumb"></span>
                  </button>
                </div>
              </div>

              <div :class="$style.formGroup">
                <label>语音闪避音量（播报时音乐自动压低）</label>
                <div :class="$style.sliderRow">
                  <input v-model.number="form.duckingVolume" type="range" min="5" max="50" :class="$style.slider" />
                  <span>{{ form.duckingVolume }}%</span>
                </div>
              </div>
            </div>

            <!--  天气设置 -->
            <div v-if="activeCategory === 'weather'" :class="$style.section">
              <h4 :class="$style.sectionTitle"><DjIcon name="weather" /> 环境与天气</h4>

              <div :class="$style.formGroup">
                <label>所在城市</label>
                <div :class="$style.inputWithBtn">
                  <input
                    v-model="form.city"
                    type="text"
                    placeholder="例如：北京 / 上海 / 广州 / 成都"
                    :class="$style.input"
                    @input="onCityInput"
                    @focus="onCityFocus"
                  />
                  <button :class="$style.iconBtn" type="button" title="常用城市" @click="showPopularCity = !showPopularCity">
                    <DjIcon name="city" />
                  </button>
                </div>
                <div v-if="showPopularCity" :class="$style.popularCities">
                  <button v-for="c in popularCities" :key="c" :class="$style.cityChip" @click="form.city = c">
                    {{ c }}
                  </button>
                </div>
                <transition name="fade">
                  <div v-if="showCityDropdown && cityResults.length > 0" :class="$style.cityDropdown">
                    <div
                      v-for="item in cityResults"
                      :key="item.id"
                      :class="$style.cityDropdownItem"
                      @click="selectCity(item)"
                    >
                      <span :class="$style.cityName">{{ item.name }}</span>
                      <span :class="$style.cityRegion">{{ item.displayLabel }}</span>
                    </div>
                  </div>
                </transition>
              </div>

              <div :class="$style.formGroup">
                <label>和风天气 API Key（可选）</label>
                <input v-model="form.weatherApiKey" type="password" placeholder="填入 key 可自动感知天气" :class="$style.input" />
                <p :class="$style.fieldTip">留空时自动使用免费天气接口，无需 Key</p>
              </div>
              <div :class="$style.formGroup">
                <label>和风天气 API Host</label>
                <input v-model="form.weatherApiHost" placeholder="控制台 → 设置中的专属域名，如 xxx.qweatherapi.com" :class="$style.input" />
                <p :class="$style.fieldTip">使用 API Key 时请同时填写专属 API Host，旧公共域名正在停用。</p>
                <button type="button" :class="$style.secondaryBtn" :disabled="weatherTesting" @click="testWeather">{{ weatherTesting ? '正在测试…' : '保存并测试天气' }}</button>
                <p v-if="weatherTestResult" role="status" :class="$style.fieldTip">{{ weatherTestResult }}</p>
              </div>
            </div>

            <!--  数据与备份 -->
            <div v-if="activeCategory === 'data'" :class="$style.section">
              <h4 :class="$style.sectionTitle"><DjIcon name="download" /> 数据与备份</h4>
              <p :class="$style.fieldTip">导出或恢复电台设置、对话历史与本地偏好学习数据。API 密钥和语音密钥不会写入备份文件。</p>
              <div :class="$style.backupRow">
                <button :class="$style.exportBtn" type="button" @click="exportDjData"><DjIcon name="upload" /> 导出配置</button>
                <button :class="$style.importBtn" type="button" @click="importDjData"><DjIcon name="download" /> 导入配置</button>
              </div>
            </div>

    </div>
    <template #actions>
      <span class="settings-save-hint" role="status">{{ saveStatus }}</span>
      <button v-if="!embedded" :class="$style.cancelBtn" type="button" @click="close">取消</button>
      <button :class="$style.saveBtn" type="button" @click="save">保存配置</button>
    </template>
  </settings-form>
</template>
<style lang="less" module>
@import '@renderer/assets/styles/layout.less';
.contentPanel { min-width: 0; }

.section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sectionTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-font);
  border-bottom: 1px solid var(--color-primary-light-500-alpha-300);
  padding-bottom: 6px;
}

.subTitle {
  margin: 12px 0 6px 0;
  font-size: 13.5px;
  color: var(--color-primary);
}

.formGroup {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label { font-size: 13px; font-weight: 500; color: var(--color-font); }
}

.fieldTip {
  font-size: 12px;
  color: var(--color-font-label);
  margin: 0;
}

.input, .select, .textarea {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--color-primary-light-400-alpha-600);
  background: var(--color-content-background);
  color: var(--color-font);
  outline: none;
  font-size: 13px;
  font-family: inherit;
  transition: border-color @transition-fast, box-shadow @transition-fast;

  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light-800-alpha-500);
  }
}

.textarea { line-height: 1.5; resize: vertical; }

/* 输入框 + 按钮组合 */
.inputWithBtn {
  display: flex;
  gap: 6px;
  align-items: stretch;

  .input { flex: 1; }
}

.iconBtn {
  flex: none;
  width: 36px;
  border-radius: 8px;
  border: 1px solid var(--color-primary-light-400-alpha-600);
  background: var(--color-primary-light-900-alpha-300);
  color: var(--color-font);
  font-size: 13px;
  cursor: pointer;
  transition: all @transition-fast;

  &:hover {
    background: var(--color-primary-light-800-alpha-400);
    border-color: var(--color-primary);
  }
}

/* 快速预设 */
.quickPresets {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.quickLabel { font-size: 12px; color: var(--color-font-label); }

.quickBtn {
  padding: 4px 12px;
  border-radius: 14px;
  border: 1px dashed var(--color-primary-light-400-alpha-600);
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all @transition-fast;

  &:hover, &.quickBtnActive {
    background: var(--color-primary);
    color: #fff;
    border-style: solid;
  }
}

.connectionRow {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 本地模型探测面板 */
.localEngineBox {
  margin-top: 10px;
  padding: 10px 14px;
  background: var(--color-primary-light-900-alpha-200);
  border-radius: 10px;
  border: 1px solid var(--color-primary-light-400-alpha-400);
}

.localEngineHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary);
}

.detectBtn {
  padding: 4px 10px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  transition: all @transition-fast;

  &:hover {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.discoveredChips {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.discoveredLabel {
  font-size: 11.5px;
  color: var(--color-font-label);
  width: 100%;
}

.discoveredChip {
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid var(--color-primary);
  background: transparent;
  color: var(--color-primary);
  font-size: 11px;
  cursor: pointer;
  transition: all @transition-fast;

  &:hover {
    background: var(--color-primary);
    color: #fff;
  }
}

.activeDiscoveredChip {
  background: var(--color-primary);
  color: #fff;
}

.detectStatusTip {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--color-font-label);
}

/* 测试连接 */
.testBtn {
  align-self: flex-start;
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity @transition-fast;

  &:disabled { opacity: 0.6; cursor: not-allowed; }
}

.testResult { font-size: 12px; }
.testOk { color: #2ecc71; }
.testFail { color: #e74c3c; }

/* 标签行（label + 恢复默认） */
.labelRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;

  label { font-size: 13px; font-weight: 500; color: var(--color-font); }
}

.resetBtn {
  border: none;
  background: transparent;
  color: var(--color-font-label);
  font-size: 11.5px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  white-space: nowrap;
  transition: all @transition-fast;

  &:hover {
    color: var(--color-primary);
    background: var(--color-primary-light-800-alpha-400);
  }
}

/* 两列布局 */
.twoCol {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

/* Switch 开关列表 */
.switchList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.switchItem {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--color-primary-light-900-alpha-300);
  border-radius: 10px;
  border: 1px solid var(--color-primary-light-500-alpha-300);
}

.switchText {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.switchTitle { font-size: 13px; font-weight: 500; color: var(--color-font); }
.switchDesc { font-size: 11.5px; color: var(--color-font-label); }

.switch {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: none;
  background: var(--color-font-label);
  opacity: 0.4;
  cursor: pointer;
  transition: background @transition-fast, opacity @transition-fast;
  flex: none;

  &.switchOn {
    background: var(--color-primary);
    opacity: 1;

    .switchThumb {
      transform: translateX(18px);
    }
  }
}

.switchThumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform @transition-fast;
}

/* 常用城市 */
.popularCities {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cityChip {
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid var(--color-primary-light-400-alpha-500);
  background: var(--color-primary-light-900-alpha-300);
  color: var(--color-font);
  font-size: 12px;
  cursor: pointer;
  transition: all @transition-fast;

  &:hover {
    background: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
  }
}

/* 用户画像卡片 */
.profileCard {
  padding: 14px;
  background: var(--color-primary-light-900-alpha-300);
  border-radius: 12px;
  border: 1px solid var(--color-primary-light-500-alpha-300);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.profileBlock {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profileLabel {
  font-size: 12.5px;
  color: var(--color-font-label);
  font-weight: 500;
}

.profileSample {
  font-size: 12.5px;
  color: var(--color-font);
}

.tagCloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 3px 10px;
  border-radius: 12px;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
}

.tagEditable {
  cursor: pointer;
  transition: all @transition-fast;

  &:hover {
    background: #e74c3c;
    text-decoration: line-through;
  }
}

.tagEmpty {
  font-size: 12px;
  color: var(--color-font-label);
}

.tagInputRow {
  display: flex;
  gap: 6px;
  margin-top: 4px;

  .input { flex: 1; }
}

/* 导入导出 */
.backupRow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.exportBtn, .importBtn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-primary-light-400-alpha-600);
  background: var(--color-primary-light-800-alpha-400);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all @transition-fast;

  &:hover {
    background: var(--color-primary);
    color: #fff;
  }
}

.backupTip {
  font-size: 11.5px;
  color: var(--color-font-label);
}

.addTagBtn {
  flex: none;
  padding: 0 12px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary-light-800-alpha-500);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all @transition-fast;

  &:hover {
    background: var(--color-primary);
    color: #fff;
  }
}

/* 曲风占比条 */
.distList {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.distItem {
  display: flex;
  align-items: center;
  gap: 10px;
}

.distName {
  flex: none;
  width: 56px;
  font-size: 12px;
  color: var(--color-font);
  text-align: right;
}

.distBarWrap {
  flex: 1;
  height: 8px;
  background: var(--color-primary-light-800-alpha-400);
  border-radius: 4px;
  overflow: hidden;
}

.distBar {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light-300-alpha-600));
  transition: width 0.4s ease;
}

.distPct {
  flex: none;
  width: 40px;
  font-size: 11.5px;
  color: var(--color-primary);
  font-weight: 600;
}

.tagMood {
  background: #e67e22;
}

.tagLang {
  background: #16a085;
}

.logHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logEmpty {
  font-size: 12px;
  color: var(--color-font-label);
  text-align: center;
  padding: 8px;
}

.cityDropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-content-background);
  border: 1px solid var(--color-primary-light-400-alpha-600);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  max-height: 200px;
  overflow-y: auto;
  z-index: 999;
  margin-top: 4px;
  padding: 4px;
}

.cityDropdownItem {
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background @transition-fast;

  &:hover {
    background: var(--color-primary-light-800-alpha-400);
    .cityName { color: var(--color-primary); }
  }
}

.cityName { font-weight: 600; font-size: 13px; color: var(--color-font); }
.cityRegion { font-size: 11.5px; color: var(--color-font-label); }

.sliderRow {
  display: flex;
  align-items: center;
  gap: 12px;

  span { font-size: 13px; font-weight: 600; color: var(--color-primary); }
}

.slider { flex: 1; cursor: pointer; accent-color: var(--color-primary); }

.logTimeline {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--color-primary-light-900-alpha-200);
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--color-primary-light-400-alpha-400);
}

.logItem {
  display: flex;
  gap: 10px;
  font-size: 12px;
}

.logTime { color: var(--color-font-label); font-family: monospace; }

.cancelBtn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-primary-light-400-alpha-600);
  background: transparent;
  color: var(--color-font);
  cursor: pointer;
}

.saveBtn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.contentPanel button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
@media (max-width: 760px) {
  .localEngineHeader { flex-wrap: wrap; gap: 8px; }
}
.advancedSettings { border-top: 1px solid var(--color-primary-alpha-200); padding-top: 12px; summary { cursor: pointer; font-size: 12px; color: var(--color-font-label); padding-bottom: 12px; } > div { margin-bottom: 16px; } }

.artistEvidence { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 0; }
.artistEvidence .distName { width: auto; max-width: 100%; text-align: left; overflow-wrap: anywhere; }
.artistEvidence .fieldTip { margin: 0; flex: 1; min-width: 160px; }
.periodGroup { margin: 8px 0; border: 1px solid var(--color-primary-alpha-200); border-radius: 8px; padding: 8px 10px; }
.periodGroup summary { cursor: pointer; font-size: 12px; color: var(--color-font); }
.periodSong { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0 0; font-size: 12px; line-height: 1.5; }
.periodSong small { color: var(--color-font-label); }


</style>
