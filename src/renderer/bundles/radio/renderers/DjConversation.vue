<template>
  <div class="suite-dj-conversation">
    <header class="music-page-heading">
      <h2>AI DJ</h2><span class="suite-dj-model">{{ activeModelName }}</span>
      <button type="button" @click="startNewChat">新对话</button>
      <button type="button" @click="showSettingModal = true">模型与语音设置</button>
    </header>
    <div ref="streamRef" class="suite-dj-stream scroll" @scroll="onStreamScroll">
      <div v-if="!hasMessages" class="suite-dj-welcome"><DjIcon name="radio" /><h3>听域 AI DJ</h3><p>{{ aiOpeningGreeting }}</p></div>
      <article v-for="(message, index) in messageList" :key="index" :data-sender="message.sender">
        <strong>{{ message.sender === 'ai' ? 'DJ' : '我' }}</strong>
        <MessageContent v-if="message.sender === 'ai'" :text="message.text" />
        <p v-else>{{ message.text }}</p>
        <div v-for="(card, cardIndex) in message.musicCards || []" :key="cardIndex" class="suite-dj-song">
          <span>{{ card.name }} · {{ card.singer }}</span>
          <button type="button" @click="toggleMusicPlay(card)">播放</button>
          <button type="button" @click="enqueueMusic(card)">稍后播放</button>
        </div>
        <button type="button" @click="deleteMessage(index)">删除消息</button>
      </article>
    </div>
    <form class="suite-dj-composer" @submit.prevent="handleSendClick">
      <textarea v-model="inputMessage" aria-label="消息内容" placeholder="聊聊你想听的音乐…" :disabled="isGenerating" @keydown="onComposerKeydown" />
      <button type="button" @click="handleComposerButtonClick">{{ isGenerating ? '停止' : '发送' }}</button>
    </form>
    <DjSettingModal v-model:visible="showSettingModal" @save="onSaveSetting" />
  </div>
</template>
<style>
.suite-dj-conversation { display: flex; flex-direction: column; min-width: 0; height: 100%; color: var(--color-font); }
.suite-dj-conversation header { flex-wrap: wrap; }
.suite-dj-model { flex: 1; min-width: 40px; font-size: 12px; opacity: .7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.suite-dj-stream { flex: 1; min-height: 0; overflow: auto; padding: 24px max(24px, calc((100% - 760px) / 2)); }
.suite-dj-welcome { height: 100%; min-height: 180px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.suite-dj-welcome > svg { width: 36px; height: 36px; color: var(--color-primary); margin-bottom: 16px; }
.suite-dj-welcome h3 { font-size: 20px; font-weight: 600; }
.suite-dj-welcome p { max-width: 480px; font-size: 13px; opacity: .75; }
.suite-dj-stream article { padding: 16px 20px; margin-bottom: 20px; border: 1px solid var(--lx-border); border-radius: 12px; }
.suite-dj-stream article > strong { font-size: 12px; color: var(--color-font); }
.suite-dj-stream article[data-sender="user"] { margin-left: 48px; background: var(--color-primary-light-900-alpha-500); }
.suite-dj-conversation p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.8; margin: 8px 0; }
.suite-dj-composer { display: flex; align-items: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--lx-border); }
.suite-dj-conversation textarea { flex: 1; min-width: 0; min-height: 56px; max-height: 160px; box-sizing: border-box; padding: 12px; resize: vertical; color: inherit; background: transparent; border: 1px solid var(--lx-border); border-radius: 10px; font: inherit; font-size: 13px; line-height: 1.6; }
.suite-dj-conversation button { min-height: 32px; color: inherit; font-size: 12px; background: var(--color-button-background); border: 1px solid var(--lx-border); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.suite-dj-conversation textarea:focus-visible, .suite-dj-conversation button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.suite-dj-song { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 12px 0; padding: 12px; background: var(--color-primary-light-900-alpha-500); border-radius: 8px; font-size: 13px; }
.suite-dj-song > span { flex: 1; min-width: 120px; }
@media (max-width: 920px) { .suite-dj-stream { padding: 16px; } .suite-dj-composer { padding: 12px 16px; } }
</style>
