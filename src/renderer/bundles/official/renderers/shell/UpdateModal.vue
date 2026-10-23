<template lang="pug">
material-modal(:show="versionInfo.showModal" max-width="60%" @close="handleClose")
  main(v-if="versionInfo.isLatest" :class="$style.main")
    h2
      SvgIcon(name="record")
      |  已是最新版本
    div.scroll.select(:class="$style.info")
      div(:class="$style.current")
        h3 最新版本：{{ versionInfo.newVersion?.version }}
        h3 当前版本：{{ versionInfo.version }}
        h3 版本变化：
        pre(:class="$style.desc" v-text="versionInfo.newVersion?.desc")
    div(:class="$style.footer")
      div(:class="$style.btns")
        base-btn(v-if="versionInfo.status == 'checking'" :class="$style.btn" disabled) 检查更新中...
        base-btn(v-else :class="$style.btn" @click="handleCheckUpdate") 重新检查更新
  main(v-else-if="versionInfo.isUnknown" :class="$style.main")
    h2
      SvgIcon(name="light")
      |  获取最新版本信息失败
    div.scroll.select(:class="$style.info")
      div(:class="$style.current")
        h3 当前版本：{{ versionInfo.version }}
        div(:class="$style.desc")
          p 更新信息获取失败，可能是无法访问 GitHub 导致的，请手动检查更新！
          p
            | 检查方法：打开
            base-btn(min aria-label="点击打开" @click="handleOpenUrl('https://github.com/wei-ran233/tingyu-desktop/releases')") 软件发布页
            | ，查看「Latest」发布的
            strong 版本号
            | 与当前版本({{ versionInfo.version }})对比是否一致。
          p 若一致则不必理会该弹窗，直接关闭即可；否则请手动下载新版本更新。
    div(:class="$style.footer")
      div(:class="$style.btns")
        base-btn(v-if="versionInfo.status == 'error'" :class="$style.btn2" @click="handleCheckUpdate") 重新检查更新
        base-btn(v-else :class="$style.btn2" disabled) 检查更新中...
        base-btn(:disabled="disabledIgnoreFailBtn" :class="$style.btn2" @click="handleIgnoreFailTipClick") 一个星期内不再提醒
  main(v-else-if="versionInfo.status == 'downloaded'" :class="$style.main")
    h2
      SvgIcon(name="upload")
      |  程序更新

    div.scroll.select(:class="$style.info")
      div(:class="$style.current")
        h3 最新版本：{{ versionInfo.newVersion?.version }}
        h3 当前版本：{{ versionInfo.version }}
        h3 版本变化：
        pre(:class="$style.desc" v-text="versionInfo.newVersion?.desc")
      div(v-if="history.length" :class="[$style.history, $style.desc]")
        h3 历史版本：
        div(v-for="(ver, index) in history" :key="index" :class="$style.item")
          h4 v{{ ver.version }}
          pre(v-text="ver.desc")
    div(:class="$style.footer")
      div(:class="$style.desc")
        p 新版本已下载完毕，
        p
          | 你可以选择
          strong 立即重启更新
          | 或稍后
          strong 关闭程序时
          | 自动更新~
      div(:class="$style.btns")
        base-btn(:class="$style.btn" @click="handleRestartClick") 立即重启更新
  main(v-else :class="$style.main")
    h2
      SvgIcon(name="light")
      |  发现新版本
    div.scroll.select(:class="$style.info")
      div(:class="$style.current")
        h3 最新版本：{{ versionInfo.newVersion?.version }}
        h3 当前版本：{{ versionInfo.version }}
        h3 版本变化：
        pre(:class="$style.desc" v-text="versionInfo.newVersion?.desc")
      div(v-if="history.length" :class="[$style.history, $style.desc]")
        h3 历史版本：
        div(v-for="(ver, index) in history" :key="index" :class="$style.item")
          h4 v{{ ver.version }}
          pre(v-text="ver.desc")

    div(:class="$style.footer")
      div(:class="$style.desc")
        p 发现有新版本啦，你可以选择自动更新或手动更新。
        p 手动更新可以去&nbsp;
          strong.hover.underline(aria-label="点击打开" @click="handleOpenUrl('https://github.com/wei-ran233/tingyu-desktop/releases')") 软件发布页
          | 下载。
        p 若遇到问题可以阅读
          strong.hover.underline(aria-label="点击打开" @click="handleOpenUrl('https://github.com/wei-ran233/tingyu-desktop/tree/main/doc')") 听域文档
          | 。
        p(v-if="progress") 当前下载进度：{{ progress }}
        p(v-else) &nbsp;
      div(:class="$style.btns")
        base-btn(:class="$style.btn2" @click="handleIgnoreClick") {{ isIgnored ? '取消忽略' : '忽略更新该版本' }}
        base-btn(v-if="versionInfo.status == 'downloading'" :class="$style.btn2" disabled) 下载更新中...
        base-btn(v-else :class="$style.btn2" @click="handleDownloadClick") 下载更新
</template>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.main {
  position: relative;
  padding: 15px 0;
  // max-width: 450px;
  min-width: 300px;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  overflow: hidden;
  // overflow-y: auto;
  * {
    box-sizing: border-box;
  }
  h2 {
    flex: 0 0 none;
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
    margin-bottom: 15px;
  }
  h3 {
    font-size: 14px;
    line-height: 1.3;
  }
  pre {
    white-space: pre-wrap;
    text-align: justify;
    margin-top: 10px;
  }
}

.info {
  flex: 1 1 auto;
  font-size: 14px;
  line-height: 1.5;
  overflow-y: auto;
  height: 100%;
  padding: 0 15px;
}
.current {
  > p {
    padding-left: 15px;
  }
}

.desc {
  h3, h4 {
    font-weight: bold;
  }
  h3 {
    padding: 5px 0 3px;
  }
  ul {
    list-style: initial;
    padding-inline-start: 30px;
  }
  p {
    font-size: 14px;
    line-height: 1.5;
  }
}

.history {
  h3 {
    padding-top: 15px;
  }

  .item {
    h3 {
      padding: 5px 0 3px;
    }
    padding: 0 15px;
    + .item {
      padding-top: 15px;
    }
    h4 {
      font-weight: 700;
    }
    > p {
      padding-left: 15px;
    }
  }

}
.footer {
  flex: 0 0 none;
  padding: 0 15px;
  .desc {
    padding-top: 10px;
    font-size: 13px;
    color: var(--color-primary-font);
    line-height: 1.25;

    p {
      font-size: 13px;
      color: var(--color-primary-font);
      line-height: 1.25;
    }
  }
}
.btns {
  display: flex;
  flex-flow: row nowrap;
  gap: 15px;
}

.btn {
  margin-top: 10px;
  display: block;
  width: 100%;
}
.btn2 {
  margin-top: 10px;
  display: block;
  width: 50%;
}

</style>

