<template>
  <div
    :class="[
      $style.chatGptLayout,
      $style[mode],
      $style['weather-' + weatherType]
    ]"
  >
    <!-- 左侧侧边栏 -->
    <div :class="[$style.sidebar, { [$style.sidebarCollapsed]: !isSidebarOpen }]">
      <div :class="$style.sidebarHeader">
        <button :class="$style.newChatBtn" @click="startNewChat">
          <DjIcon name="plus" />
          <span v-if="isSidebarOpen">新建对话</span>
        </button>
      </div>

      <div v-if="isSidebarOpen" :class="$style.historyTabs">
        <button
          :class="[$style.historyTab, { [$style.activeHistoryTab]: historyCategory === 'dj' }]"
          @click="historyCategory = 'dj'"
        ><DjIcon name="radio" /> DJ 调频</button>
        <button
          :class="[$style.historyTab, { [$style.activeHistoryTab]: historyCategory === 'chat' }]"
          @click="historyCategory = 'chat'"
        ><DjIcon name="chat" /> 聊天历史</button>
        <button
          :class="[$style.historyTab, { [$style.activeHistoryTab]: historyCategory === 'recommend' }]"
          @click="historyCategory = 'recommend'"
        ><DjIcon name="music" /> 推荐点播</button>
      </div>

      <div v-if="isSidebarOpen" :class="$style.historySearch">
        <DjIcon name="search" />
        <input v-model="historyQuery" placeholder="搜索历史对话" aria-label="搜索历史对话" />
        <button v-if="historyQuery" type="button" :class="$style.clearQueryBtn" aria-label="清除搜索" @click="historyQuery = ''"><DjIcon name="close" /></button>
      </div>
      <div v-if="isSidebarOpen" :class="$style.historyList" class="scroll">
        <div v-if="groupedHistory.length && !historyQuery" :class="$style.historyListBar">
          <span>共 {{ currentHistoryList.length }} 条记录</span>
          <button type="button" :class="$style.clearCategoryBtn" title="清空当前分类历史" @click="clearCategoryHistory"><DjIcon name="trash" /> 清空</button>
        </div>
        <p v-if="!groupedHistory.length" :class="$style.historyEmpty">{{ historyQuery ? '没有匹配的记录' : '还没有记录，从一首歌开始新的对话' }}</p>
        <section v-for="group in groupedHistory" :key="group.label"><h3 :class="$style.historyGroup">{{ group.label }}</h3>
          <div
            v-for="item in group.items"
            :key="item.id"
            :class="[$style.historyItem, { [$style.activeHistoryItem]: activeHistoryId === item.id }]"
            @click="onSelectHistory(item)"
          >
            <span :class="$style.itemIcon"><DjIcon :name="item.type === 'recommend' ? 'music' : (item.mode === 'dj' ? 'radio' : 'chat')" /></span>
            <div :class="$style.itemMeta">
              <span :class="$style.itemTitle">
                <span :class="[$style.modeBadge, $style['badge-' + item.mode]]">
                  {{ item.type === 'recommend' ? '点播' : (item.mode === 'dj' ? 'DJ' : '聊天') }}
                </span>
                {{ item.title }}
              </span>
              <span :class="$style.itemDate">{{ item.singer ? `${item.singer} · ${item.date}` : item.date }}</span>
            </div>
            <div :class="$style.itemActions">
              <button v-if="item.type !== 'recommend'" type="button" :class="$style.directPlayBtn" title="重命名对话" @click.stop="beginRename(item)"><DjIcon name="edit" /></button>
              <button
                v-if="item.type === 'recommend'"
                :class="$style.directPlayBtn"
                title="直接播放"
                @click.stop="onDirectPlayHistory(item)"
              ><DjIcon name="play" /></button>
              <button
                :class="$style.deleteItemBtn"
                title="删除记录"
                @click.stop="deleteHistory(item)"
              ><DjIcon name="trash" /></button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- 右侧主交互区域 -->
    <div :class="$style.mainContent">
      <!-- 顶部工具栏 -->
      <div :class="$style.topBar">
        <div :class="$style.topBarLeft">
          <button
            :class="$style.sidebarToggleBtn"
            :title="isSidebarOpen ? '收起侧边栏' : '展开侧边栏'"
            @click="isSidebarOpen = !isSidebarOpen"
          ><DjIcon name="menu" /></button>
          <button type="button" :class="$style.activeModelBadge" title="配置当前模型" @click="showSettingModal = true">
            <span><DjIcon name="model" /></span>
            <span>{{ activeModelName }}</span>
          </button>
        </div>

        <div :class="$style.topBarCenter">
          <div :class="$style.modeTogglePills">
            <button
              :class="[$style.pillBtn, { [$style.activePill]: mode === 'dj' }]"
              @click="switchMode('dj')"
            ><DjIcon name="headphones" /> DJ 模式</button>
            <button
              :class="[$style.pillBtn, { [$style.activePill]: mode === 'chat' }]"
              @click="switchMode('chat')"
            ><DjIcon name="chat" /> 聊天模式</button>
          </div>
        </div>

        <div :class="$style.topBarRight">
          <button
            v-if="mode === 'dj'"
            type="button"
            :class="[$style.quickActionBtn, { [$style.quickActionActive]: djSettings.autoContinue }]"
            :aria-pressed="djSettings.autoContinue"
            :title="djSettings.autoContinue ? '自动连播已开启（点击切换）' : '自动连播已关闭（点击开启）'"
            @click="toggleAutoContinue"
          >
            <DjIcon name="radio" />
            <span>{{ djSettings.autoContinue ? '连播中' : '连播关' }}</span>
          </button>
          <button
            v-if="mode === 'dj'"
            type="button"
            :class="$style.quickActionBtn"
            :disabled="isGenerating"
            title="让 AI DJ 推荐并播放下一首"
            @click="requestNextDjSong"
          >
            <DjIcon name="skip" />
            <span>切歌推新</span>
          </button>
          <button
            type="button"
            :class="[$style.settingIconBtn, { [$style.iconBtnActive]: isSpeechEnabled }]"
            :aria-pressed="isSpeechEnabled"
            :title="isSpeechEnabled ? '语音播报已开启（点击静音）' : '语音播报已关闭（点击开启）'"
            @click="toggleSpeechEnabled"
          >
            <DjIcon :name="isSpeechEnabled ? 'volume' : 'mute'" />
          </button>
          <button :class="$style.settingIconBtn" title="AI DJ 设置" @click="showSettingModal = true">
            <DjIcon name="settings" />
          </button>
        </div>
      </div>

      <div v-if="generationStatus.text" :class="[$style.executionStatus, { [$style.statusError]: generationStatus.phase === 'error' }]" role="status" aria-live="polite"><span :class="{ [$style.statusBusy]: isGenerating }"></span>{{ generationStatus.text }}</div>

      <!-- 1. 居中新对话 Landing View -->
      <div v-if="!hasMessages" :class="$style.landingView">
        <div :class="$style.landingContainer">
          <div :class="$style.stationMark"><DjIcon name="record" /></div>
          <h1 :class="$style.landingTitle">{{ mode === 'dj' ? '为此刻，选一首歌' : '今天想聊些什么？' }}</h1>
          <p :class="$style.openingCopy">{{ aiOpeningGreeting }}</p>

          <div :class="$style.centerWeatherBadge">
            <span><DjIcon name="weather" /></span>
            <span>{{ currentDateStr }} | {{ city }}天气：<strong>{{ weatherDisplay }}</strong></span>
          </div>

          <div :class="$style.centerInputWrapper">
            <div :class="$style.inputBoxContainer">
              <div v-if="activeFeatureTag" :class="$style.activeTagChip">
                <span>{{ activeFeatureTag.label }}</span>
                <button :class="$style.removeTagBtn" aria-label="关闭" @click="activeFeatureTag = null"><DjIcon name="close" /></button>
              </div>

              <textarea
                v-model="inputMessage"
                rows="1"
                aria-label="消息内容"
                :placeholder="activeFeatureTag ? activeFeatureTag.placeholder : '输入想听的歌、歌手、心情或任何问题...'"
                :class="$style.chatInput"
                :disabled="isGenerating"
                @keydown="onComposerKeydown"
                @input="resizeComposer"
              ></textarea>

              <div :class="$style.plusMenuContainer">
                <button :class="$style.plusBtn" title="附加功能" @click="showPlusMenu = !showPlusMenu"><DjIcon name="plus" /></button>
                <transition name="fade">
                  <div v-if="showPlusMenu" :class="$style.plusDropdown" @mouseleave="showPlusMenu = false">
                    <button :class="$style.dropdownItem" @click="attachFeatureTag('search')"><DjIcon name="search" /> AI 聚合搜索</button>
                    <button :class="$style.dropdownItem" @click="attachFeatureTag('play')"><DjIcon name="music" /> 快捷点歌</button>
                  </div>
                </transition>
              </div>

              <button
                :class="$style.sendCircleBtn"
                :title="isGenerating ? '停止生成' : '发送'"
                @click="handleComposerButtonClick"
              >
                <DjIcon :name="isGenerating ? 'stop' : 'send'" />
              </button>
            </div>

            <div :class="$style.suggestionChips">
              <button
                v-for="(chipText, idx) in suggestionChips"
                :key="idx"
                :class="$style.chip"
                :title="chipText"
                @click="applySuggestion(chipText)"
              >{{ chipText }}</button>
              <button :class="[$style.chip, $style.refreshChip]" title="刷新推荐选项" @click="refreshSuggestions"><DjIcon name="refresh" /> 换一换</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. 对话流视图 -->
      <div v-else ref="streamRef" :class="$style.streamBody" class="scroll" aria-live="polite" aria-relevant="additions text" @scroll="onStreamScroll">
        <div :class="$style.streamWeatherHeader">
          <span><DjIcon name="weather" /> {{ currentDateStr }} | {{ city }}天气：{{ weatherDisplay }} | 当前模式：{{ mode === 'dj' ? 'DJ 电台' : '知心聊天' }}</span>
        </div>

        <div :class="$style.messagesStream">
          <div v-for="(msg, index) in messageList" :key="index" :class="[$style.messageRow, $style[msg.sender]]">
            <div :class="$style.avatar"><DjIcon :name="msg.sender === 'user' ? 'user' : (mode === 'dj' ? 'radio' : 'chat')" /></div>
            <div :class="$style.bubble">
              <div v-if="msg.sender === 'ai'" :class="$style.bubbleHeader">
                <span :class="[$style.bubbleTag, $style['tag-' + (mode === 'dj' ? 'dj' : 'chat')]]">
                  <DjIcon :name="mode === 'dj' ? 'headphones' : 'chat'" /> {{ mode === 'dj' ? 'AI 电台' : 'AI 助手' }}
                </span>
                <span v-if="isGenerating && index === messageList.length - 1" :class="$style.typingHint">{{ generationStatus.text }}</span>
              </div>

              <!-- 深度思考过程折叠组件 -->
              <div v-if="msg.thinkingText" :class="$style.thinkingBox">
                <div :class="$style.thinkingHeader" @click="msg.isThinkingFolded = !msg.isThinkingFolded">
                  <span :class="$style.thinkingTitle"><DjIcon name="thinking" /> 深度思考过程</span>
                  <span :class="$style.thinkingToggle">{{ msg.isThinkingFolded ? '展开 ▼' : '收起 ▲' }}</span>
                </div>
                <div v-show="!msg.isThinkingFolded" :class="$style.thinkingContent">
                  {{ msg.thinkingText }}
                </div>
              </div>

              <MessageContent v-if="msg.sender === 'ai'" :text="msg.text" />
              <p v-else>{{ msg.text }}</p>
              <button v-if="msg.failed && index === messageList.length - 1" type="button" :class="$style.retryBtn" :disabled="isGenerating" @click="retryMessage(index)"><DjIcon name="refresh" /> 重试这条消息</button>

              <!-- 音乐推荐卡片（单首纵向 / 多首横向滑动适配） -->
              <div v-if="msg.musicCards && msg.musicCards.length" :class="[$style.musicCardList, { [$style.musicCardListMulti]: msg.musicCards.length > 1 }]">
                <div v-for="(card, cardIdx) in msg.musicCards" :key="cardIdx" :class="[$style.musicCard, { [$style.musicCardPlaying]: isCardCurrentlyPlaying(card) }]">
                  <div :class="$style.vinylContainer">
                    <div :class="$style.albumCover">
                      <img v-if="card.pic || card.meta?.picUrl" :src="card.pic || card.meta?.picUrl" :class="$style.albumCoverImg" />
                      <span v-else><DjIcon name="music" /></span>
                    </div>
                    <div :class="[$style.vinylDisc, { [$style.spinning]: isCardCurrentlyPlaying(card) }]">
                      <div :class="$style.vinylCenterLabel"></div>
                    </div>
                  </div>
                  <div :class="$style.musicMeta">
                    <div :class="$style.songTitleRow">
                      <span :class="$style.songTitle">{{ card.name }}</span>
                      <span v-if="card.source" :class="$style.sourceBadge">{{ card.source.toUpperCase() }}</span>
                    </div>
                    <div :class="$style.artist">{{ card.singer }}</div>
                    <div v-if="card.reason" :class="$style.recommendReason"><DjIcon name="light" /> {{ card.reason }}</div>
                  </div>
                  <div :class="$style.musicActions">
                    <button :class="$style.playBtn" @click="toggleMusicPlay(card)"><DjIcon name="play" /> {{ isCardCurrentlyPlaying(card) ? '播放中' : '播放' }}</button>
                    <button :class="$style.queueSongBtn" title="加入稍后播放队列" @click="enqueueMusic(card)"><DjIcon name="plus" /> 稍后播</button>
                    <button
                      :class="[$style.favSongBtn, { [$style.favSongActive]: isMusicCardLoved(card) }]"
                      :title="isMusicCardLoved(card) ? '已在我的喜爱中' : '收藏到我的喜爱'"
                      :aria-label="isMusicCardLoved(card) ? '已在我的喜爱中' : '收藏到我的喜爱'"
                      :disabled="isMusicCardLoved(card)"
                      @click="onFavoriteMusic(card)"
                    >
                      <DjIcon name="heart" />
                    </button>
                  </div>
                </div>
              </div>

              <div :class="$style.messageToolbar">
                <button v-if="msg.text" type="button" :class="$style.msgActionBtn" title="复制消息内容" @click="copyMessageText(msg.text, index)">
                  <DjIcon :name="copiedMsgIndex === index ? 'check' : 'copy'" />
                  <span>{{ copiedMsgIndex === index ? '已复制' : '复制' }}</span>
                </button>
                <button v-if="msg.sender === 'ai' && msg.text && msg.text !== '...'" type="button" :class="$style.msgActionBtn" title="朗读此条回复" @click="speakMessageText(msg.text)">
                  <DjIcon name="voice" />
                  <span>朗读</span>
                </button>
                <button type="button" :class="[$style.msgActionBtn, $style.msgDeleteAction]" title="删除此条消息" @click="deleteMessage(index)">
                  <DjIcon name="trash" />
                  <span>删除</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button v-if="hasMessages && !followStream" type="button" :class="$style.latestBtn" @click="jumpToLatest">回到最新消息 <DjIcon name="send" /></button>
      <!-- 底部固定输入框 -->
      <div v-if="hasMessages" :class="$style.bottomInputArea">
        <div :class="$style.inputBoxContainer">
          <div v-if="activeFeatureTag" :class="$style.activeTagChip">
            <span>{{ activeFeatureTag.label }}</span>
            <button :class="$style.removeTagBtn" aria-label="关闭" @click="activeFeatureTag = null"><DjIcon name="close" /></button>
          </div>
          <textarea
            v-model="inputMessage"
            rows="1"
            aria-label="消息内容"
            :placeholder="activeFeatureTag ? activeFeatureTag.placeholder : '输入想听的歌、歌手、心情或任何问题...'"
            :class="$style.chatInput"
            :disabled="isGenerating"
            @keydown="onComposerKeydown"
            @input="resizeComposer"
          ></textarea>
          <div :class="$style.plusMenuContainer">
            <button :class="$style.plusBtn" title="附加功能" @click="showPlusMenu = !showPlusMenu"><DjIcon name="plus" /></button>
            <transition name="fade">
              <div v-if="showPlusMenu" :class="$style.plusDropdown" @mouseleave="showPlusMenu = false">
                <button :class="$style.dropdownItem" @click="attachFeatureTag('search')"><DjIcon name="search" /> AI 聚合搜索</button>
                <button :class="$style.dropdownItem" @click="attachFeatureTag('play')"><DjIcon name="music" /> 快捷点歌</button>
              </div>
            </transition>
          </div>
          <button
            :class="$style.sendCircleBtn"
            :title="isGenerating ? '停止生成' : '发送'"
            @click="handleComposerButtonClick"
          >
            <DjIcon :name="isGenerating ? 'stop' : 'send'" />
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body"><div v-if="renameTarget" :class="$style.renameOverlay" @click.self="renameTarget = null"><form :class="$style.renameDialog" role="dialog" aria-modal="true" aria-label="重命名对话" @submit.prevent="commitRename"><h3>重命名对话</h3><input v-model="renameTitle" maxlength="80" aria-label="对话名称" autofocus @keydown.esc="renameTarget = null" /><div><button type="button" @click="renameTarget = null">取消</button><button type="submit" :disabled="!renameTitle.trim()">保存名称</button></div></form></div></Teleport>
    <DjSettingModal v-model:visible="showSettingModal" @save="onSaveSetting" />
  </div>
</template>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

/* 全局布局与动态主题背景 */
.chatGptLayout {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--color-content-background);
  color: var(--color-font);
  overflow: hidden;
  position: relative;
  transition: background 0.4s ease;

  &.dj {
    background: var(--color-main-background);
    border: 1px solid var(--color-primary-light-500-alpha-300);
  }

  &.chat.weather-sunny {
    background: linear-gradient(180deg, rgba(254, 249, 231, 0.15) 0%, var(--color-content-background) 100%);
  }

  &.chat.weather-night {
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.25) 0%, var(--color-content-background) 100%);
  }
}

/* 左侧侧边栏 */
.sidebar {
  width: 208px;
  flex: none;
  background: var(--color-primary-light-900-alpha-300);
  border-right: 1px solid var(--color-primary-light-500-alpha-300);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  &.sidebarCollapsed {
    width: 60px;
    padding: 0;

    .historyTabs, .historyList { display: none; }
  }
}

.sidebarHeader { padding: 12px; }

.newChatBtn {
  width: 100%;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-primary-light-400-alpha-600);
  background: var(--color-content-background);
  color: var(--color-primary);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all @transition-fast;

  &:hover {
    background: var(--color-primary-light-800-alpha-400);
    border-style: solid;
  }
}

.historyTabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0 8px 8px;
  gap: 4px;
  > button:last-child { grid-column: 1 / -1; }
  border-bottom: 1px solid var(--color-primary-light-500-alpha-200);
}

.historyTab {
  flex: 1;
  border: none;
  background: transparent;
  padding: 5px 2px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--color-font-label);
  cursor: pointer;
  white-space: nowrap;

  &.activeHistoryTab {
    background: var(--color-primary-light-700-alpha-500);
    color: var(--color-primary);
    font-weight: 600;
  }
}

.historyList {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.historyItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background @transition-fast;
  position: relative;

  &:hover {
    background: var(--color-primary-light-800-alpha-300);
    .itemActions { opacity: 1; }
  }

  &.activeHistoryItem {
    background: var(--color-primary-light-700-alpha-500);
  }
}

.itemIcon { font-size: 13px; }

.itemMeta {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.itemTitle {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--color-font);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
}

.modeBadge {
  font-size: 9.5px;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 600;
  color: #fff;

  &.badge-dj { background: #9333ea; }
  &.badge-chat { background: var(--color-primary); }
}

.itemDate { font-size: 10.5px; color: var(--color-font-label); }

.itemActions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.7;
  transition: opacity @transition-fast;
}

.directPlayBtn {
  border: none;
  background: var(--color-primary);
  color: #fff;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover { opacity: 0.9; }
}

.deleteItemBtn {
  border: none;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;

  &:hover { background: var(--color-primary-light-700-alpha-600); }
}

/* 右侧主界面 */
.mainContent {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.topBar {
  min-height: 56px;
  flex: none;
  gap: 12px;
  border-bottom: 1px solid var(--color-primary-light-500-alpha-300);
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 10;
}

.topBarLeft {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sidebarToggleBtn {
  border: none;
  background: transparent;
  font-size: 18px;
  color: var(--color-font-label);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: background @transition-fast;

  &:hover {
    background: var(--color-primary-light-800-alpha-400);
    color: var(--color-font);
  }
}

.activeModelBadge {
  max-width: 220px;
  overflow: hidden;
  white-space: nowrap;
  span { overflow: hidden; text-overflow: ellipsis; }
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--color-primary-light-800-alpha-400);
  border-radius: 12px;
  font-size: 12px;
  color: var(--color-primary);
  border: 1px solid var(--color-primary-light-500-alpha-300);
}

.topBarCenter {
  flex: 1;
  display: flex;
  justify-content: center;
}

.modeTogglePills {
  display: flex;
  background: var(--color-primary-light-800-alpha-500);
  padding: 3px;
  border-radius: 20px;
}

.pillBtn {
  border: none;
  background: transparent;
  padding: 5px 18px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-font-label);
  cursor: pointer;
  transition: all @transition-fast;

  &.activePill {
    background: var(--color-primary-light-900);
    color: var(--color-font);
    box-shadow: inset 0 0 0 1px var(--lx-border);
  }
}

.settingIconBtn {
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  color: var(--color-font-label);

  &:hover {
    background: var(--color-primary-light-800-alpha-400);
    color: var(--color-font);
  }
}

/* Landing View */
.landingView {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.landingContainer {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.landingTitle {
  margin: 0;
  font-size: clamp(20px, 2.6vw, 28px);
  font-weight: 600;
  color: var(--color-font);
  text-align: center;
  line-height: 1.4;
}

.centerWeatherBadge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--color-primary-light-800-alpha-400);
  border-radius: 20px;
  border: 1px solid var(--color-primary-light-500-alpha-300);
  font-size: 13px;
  color: var(--color-font);

  strong { color: var(--color-primary); }
}

.centerInputWrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inputBoxContainer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--color-primary-light-400-alpha-600);
  background: var(--color-content-background);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  position: relative;

  &:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  }
}

.activeTagChip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 14px;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;

  .removeTagBtn {
    border: none;
    background: transparent;
    color: #fff;
    cursor: pointer;
    font-size: 11px;
    padding: 0;
  }
}

.chatInput {
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-font);
  font-size: 14px;
  outline: none;
  padding: 6px 4px;
}

.plusMenuContainer { position: relative; }

.plusBtn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--color-primary-light-800-alpha-500);
  color: var(--color-font);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all @transition-fast;

  &:hover {
    background: var(--color-primary);
    color: #fff;
  }
}

.plusDropdown {
  position: absolute;
  bottom: 42px;
  left: 0;
  background: var(--color-content-background);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  border: 1px solid var(--color-primary-light-400-alpha-500);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 100;
  min-width: 160px;
}

.dropdownItem {
  border: none;
  background: transparent;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-font);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: var(--color-primary-light-800-alpha-400);
    color: var(--color-primary);
  }
}

.sendCircleBtn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity @transition-fast;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.9; }
}

.suggestionChips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 100%;
}

.chip {
  padding: 6px 12px;
  border-radius: 16px;
  border: 1px solid var(--color-primary-light-400-alpha-500);
  background: var(--color-primary-light-900-alpha-300);
  color: var(--color-font);
  font-size: 11.5px;
  line-height: 1.3;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: all @transition-fast;

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-light-800-alpha-400);
  }
}

.refreshChip {
  background: transparent;
  border-style: dashed;
  color: var(--color-primary);
  max-width: none;
}

.musicCardList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  width: 100%;

  /* 多首推荐：横向滑动展示，避免把气泡撑得很高 */
  &.musicCardListMulti {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
    scroll-snap-type: x mandatory;

    .musicCard {
      flex: none;
      width: 220px;
      scroll-snap-align: start;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .vinylContainer {
      width: 100%;
      height: 44px;
    }

    .playBtn {
      align-self: stretch;
    }
  }
}

/* 对话流视图 */
.streamBody {
  min-height: 0;
  flex: 1;
  padding: 16px 40px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.streamWeatherHeader {
  font-size: 12px;
  color: var(--color-font-label);
  text-align: center;
}

.messagesStream {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
}

.messageRow {
  max-width: 100%;
  display: flex;
  gap: 12px;

  &.user {
    align-self: flex-end;
    flex-direction: row-reverse;

    .bubble {
  min-width: 0;
  overflow-wrap: anywhere;
      background: var(--color-primary);
      color: #fff;
      border-radius: 18px 18px 2px 18px;
    }
  }

  &.ai {
    align-self: flex-start;

    .bubble {
      background: var(--color-primary-light-900-alpha-400);
      color: var(--color-font);
      border-radius: 18px 18px 18px 2px;
      border: 1px solid var(--color-primary-light-500-alpha-200);
    }
  }
}

.avatar {
  font-size: 18px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary-light-800-alpha-500);
  display: flex;
  align-items: center;
  justify-content: center;
}

.bubble {
  padding: 12px 16px;
  max-width: 600px;
  position: relative;

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  &:hover .deleteMsgBtn { opacity: 1; }
}

.bubbleHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.bubbleTag {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 8px;
  color: #fff;

  &.tag-dj { background: var(--color-primary); }
  &.tag-chat { background: var(--color-primary); }
}

.typingHint {
  font-size: 11px;
  color: var(--color-font-label);
  animation: blinkHint 1.2s ease-in-out infinite;
}

@keyframes blinkHint {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.deleteMsgBtn {
  position: absolute;
  top: 4px;
  right: -28px;
  border: none;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity @transition-fast;
}

.musicCard {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  background: var(--color-content-background);
  border-radius: 12px;
  border: 1px solid var(--color-primary-light-400-alpha-500);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.vinylContainer {
  position: relative;
  width: 44px;
  height: 44px;
}

.albumCover {
  position: absolute;
  top: 0;
  left: 0;
  width: 40px;
  height: 40px;
  background: var(--color-primary-light-700-alpha-600);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  z-index: 2;
  box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.albumCoverImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}

.vinylDisc {
  position: absolute;
  top: 2px;
  left: 12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: radial-gradient(circle, #111 20%, #333 21%, #111 40%, #222 60%, #111 100%);
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);

  &.spinning { animation: spinVinyl 3s linear infinite; }
}

.vinylCenterLabel {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary);
}

@keyframes spinVinyl {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.musicMeta { flex: 1; }

.songTitle {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-primary);
}

.artist { font-size: 12px; color: var(--color-font-label); }

.recommendReason {
  font-size: 11.5px;
  color: var(--color-primary);
  margin-top: 3px;
  line-height: 1.35;
  background: var(--color-primary-light-900-alpha-200);
  padding: 4px 8px;
  border-radius: 6px;
  border-left: 2px solid var(--color-primary);
}

.playBtn {
  border: none;
  background: var(--color-primary);
  color: #fff;
  padding: 6px 14px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover { opacity: 0.9; }
}

.bottomInputArea {
  box-sizing: border-box;
  flex: none;
  padding: 12px 40px 20px 40px;
  background: transparent;
  max-width: 760px;
  margin: 0 auto;
  width: 100%;
}

.thinkingBox {
  margin: 6px 0 10px 0;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  border-left: 3px solid var(--color-primary-alpha-500);
  font-size: 12px;
  transition: all 0.2s ease;
}

.thinkingHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
  font-weight: 500;
  color: var(--color-font-label);
}

.thinkingTitle {
  display: flex;
  align-items: center;
  gap: 4px;
}

.thinkingToggle {
  font-size: 11px;
  opacity: 0.7;
  &:hover { opacity: 1; }
}

.thinkingContent {
  margin-top: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-font-label);
  line-height: 1.5;
  max-height: 240px;
  overflow-y: auto;
  border-top: 1px dashed rgba(0, 0, 0, 0.08);
  padding-top: 6px;
}

.stationMark {
  width: 82px;
  height: 82px;
  display: grid;
  place-items: center;
  color: var(--color-primary);
  font-size: 70px;
  margin-bottom: 2px;
}
.historyEmpty {
  padding: 24px 12px;
  font-size: 12px;
  color: var(--color-font-label);
  line-height: 1.8;
  text-align: center;
}
.chatGptLayout button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 3px;
}
@media (max-width: 1050px) {
  .sidebar { width: 176px; }
  .topBar { flex-wrap: wrap; padding: 8px 12px; }
  .topBarLeft { gap: 6px; }
  .activeModelBadge { max-width: 140px; }
  .pillBtn { padding: 6px 9px; }
  .landingView { padding: 20px 16px; }
  .streamBody { padding: 16px; }
  .bottomInputArea { padding: 12px 16px; }
}
@media (max-width: 760px) {
  .sidebar { width: 148px; }
  .topBarCenter { order: 3; flex-basis: 100%; }
  .landingContainer { gap: 14px; }
  .stationMark { width: 56px; height: 56px; font-size: 48px; }
  .centerWeatherBadge { padding: 6px 8px; font-size: 11px; }
  .chip { max-width: 160px; }
}
@media (prefers-reduced-motion: reduce) {
  .chatGptLayout, .chatGptLayout * { animation: none !important; transition: none !important; }
}

.topBarRight { display: flex; align-items: center; gap: 6px; }
.quickActionBtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 14px;
  border: 1px solid var(--color-primary-light-500-alpha-400);
  background: var(--color-primary-light-900-alpha-300);
  color: var(--color-font);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all @transition-fast;

  &:hover:not(:disabled) {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-light-800-alpha-400);
  }
  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
.quickActionActive {
  background: var(--color-primary-light-800-alpha-500);
  border-color: var(--color-primary);
  color: var(--color-primary);
  font-weight: 600;
}
.iconBtnActive {
  color: var(--color-primary);
  background: var(--color-primary-light-900-alpha-300);
}
.activeModelBadge { cursor: pointer; font-family: inherit; }
.openingCopy { margin: -6px 0 0; max-width: 52ch; color: var(--color-font-label); font-size: 12px; line-height: 1.8; text-align: center; }
.executionStatus { display: flex; align-items: center; gap: 8px; padding: 8px 20px; font-size: 12px; line-height: 1.5; color: var(--color-primary); background: var(--color-primary-light-900-alpha-500); color: var(--color-font); flex: none; > span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; } &.statusError { color: #b44338; background: rgba(180,67,56,.06); } }
.statusBusy { animation: statusPulse 1.3s ease-in-out infinite; }
@keyframes statusPulse { 50% { opacity: .25; } }
.songTitleRow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sourceBadge {
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-primary-light-800-alpha-500);
  color: var(--color-primary);
  font-weight: 600;
}
.musicCardPlaying {
  border-color: var(--color-primary);
  box-shadow: 0 4px 18px var(--color-primary-light-700-alpha-500);
}
.musicActions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.queueSongBtn, .retryBtn, .favSongBtn { border: 1px solid var(--color-primary-alpha-300); background: transparent; color: var(--color-primary); border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer; transition: all @transition-fast; }
.favSongBtn {
  padding: 6px 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-font-label);
  border-color: var(--color-primary-light-500-alpha-300);
  &:hover { color: var(--color-primary); border-color: var(--color-primary); }
}
.favSongActive {
  color: var(--color-primary);
  border-color: var(--color-primary);
  background: var(--color-primary-alpha-900);
}
.retryBtn { margin-top: 10px; &:disabled { opacity: .5; } }
.messageToolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid rgba(127, 127, 127, 0.12);
  opacity: 0.65;
  transition: opacity @transition-fast;
}
.bubble:hover .messageToolbar { opacity: 1; }
.msgActionBtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.8;
  transition: all @transition-fast;
  &:hover { opacity: 1; background: rgba(127, 127, 127, 0.12); }
}
.msgDeleteAction:hover {
  color: #e74c3c;
}

.chatInput { resize: none; max-height: 144px; min-height: 24px; line-height: 1.6; font-family: inherit; box-sizing: border-box; }
.historySearch { display: flex; align-items: center; gap: 6px; margin: 4px 12px 8px; padding: 7px 8px; border: 1px solid var(--lx-border); border-radius: 6px; color: var(--color-primary); input { min-width: 0; width: 100%; background: transparent; border: none; color: var(--color-font); outline: none; font-size: 12px; } }
.clearQueryBtn {
  border: none;
  background: transparent;
  color: var(--color-font-label);
  cursor: pointer;
  padding: 0 2px;
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  &:hover { color: var(--color-font); }
}
.historyListBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 8px 4px;
  font-size: 11px;
  color: var(--color-font-label);
}
.clearCategoryBtn {
  border: none;
  background: transparent;
  color: var(--color-font-label);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  &:hover {
    color: #e74c3c;
    background: rgba(231, 76, 60, 0.08);
  }
}
.historyGroup { margin: 12px 10px 6px; font-size: 11px; font-weight: 500; color: var(--color-font-label); }
.latestBtn { position: absolute; right: 28px; bottom: 96px; z-index: 12; border: 1px solid var(--color-primary-alpha-300); border-radius: 14px; padding: 7px 12px; background: var(--color-main-background); color: var(--color-primary); cursor: pointer; font-size: 12px; }
.renameOverlay { position: fixed; inset: 0; z-index: 10001; display: grid; place-items: center; background: rgba(0,0,0,.35); }
.renameDialog { width: min(360px, 90vw); padding: 24px; border-radius: 12px; box-sizing: border-box; background: var(--color-main-background); color: var(--color-font); h3 { font-size: 16px; margin: 0 0 16px; } input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid var(--color-primary); border-radius: 6px; color: inherit; background: transparent; } div { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; } button { padding: 7px 12px; border-radius: 6px; color: var(--color-primary); background: transparent; border: 1px solid var(--color-primary-alpha-300); cursor: pointer; } }
</style>
