<template lang="pug">
dt#about {{ $t('setting__about') }}
dd
  .p.small
    | 听域（Tingyu）完全免费，代码已开源。开源地址：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/wei-ran233/tingyu-desktop')") https://github.com/wei-ran233/tingyu-desktop
  .p.small
    | 最新版下载地址：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/wei-ran233/tingyu-desktop/releases')") GitHub Releases
  .p.small
    | 软件的常见问题可转至：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/wei-ran233/tingyu-desktop/tree/main/doc')") 听域文档
  .p.small
    strong 本软件没有客服
    | ，但我们整理了一些常见的使用问题。
    strong 仔细、仔细、仔细
    | 地阅读常见问题后，
  .p.small
    | 仍有问题可到&nbsp;GitHub&nbsp;
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/wei-ran233/tingyu-desktop/issues')") 提交&nbsp;Issue
    | 。
  br
  .p.small 由于软件开发的初衷仅是为了对新技术的学习与研究，因此软件直至停止维护都将会一直保持纯净。
  .p.small
    | 目前本项目的原始发布地址
    strong 只有&nbsp;GitHub
    | ，其他渠道均为第三方转载发布，可信度请自行鉴别。
  .p.small
    strong 本项目没有微信公众号之类的所谓「官方账号」，谨防被骗！

  .p.small
    | 你已签署本软件的
    base-btn(min @click="handleShowPact") 许可协议
    | ，协议的在线版本在
    strong.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/wei-ran233/tingyu-desktop/tree/main/doc/legal')") 这里
    | 。
  br

  .p.small
    | 维护者：&nbsp;
    strong wei-ran233
</template>


