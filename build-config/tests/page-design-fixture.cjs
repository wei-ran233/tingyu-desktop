/* Real Electron layout checks. Only the disposable test profile uses fixture SDK responses. */
const assert = require('node:assert/strict')
const path = require('node:path')
const { promises: fs } = require('node:fs')
module.exports = async({ run, navigate, waitFor, host, evidence, settleFrame, songs }) => {
  await run('Array.from(document.querySelectorAll(\'.feature-management button\')).find(button=>button.textContent.includes(\'恢复默认功能和原版布局\')).click()')
  const sdk = await run(`(()=>{
    window.webpackChunklx_music_desktop.push([[Date.now()],{},req=>window.__fixtureRequire=req]);
    const req=window.__fixtureRequire;
    for(const [id, factory] of Object.entries(req.m)) {
      const code=factory.toString(); if(!code.includes('酷我音乐') || !code.includes('searchMusic')) continue;
      const exports=req(id); const sdk=Object.values(exports).find(value=>value?.kw && value?.sources && value?.searchMusic);
      if(sdk){window.__fixtureSdk=sdk;return {id,sources:sdk.sources.length};}
    }
    return null;
  })()`)
  assert.ok(sdk, 'locate the already loaded music SDK for deterministic fixture responses')
  await run(`(()=>{
    const sdk=window.__fixtureSdk;
    const cover = (color, title) => 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="'+color+'"/><circle cx="120" cy="108" r="58" fill="white" opacity=".14"/><path d="M105 65v92m0-80 45-12v80" fill="none" stroke="white" stroke-width="5"/><text x="20" y="217" fill="white" font-size="16">'+title+'</text></svg>');
    const names=['午后轻听','城市漫游','慢一点也没关系','窗外的雨','旧唱片里的夏天','给夜晚留一首歌','清晨出发','无声的远方','日落之前'];
    const colors=['#5f8274','#627b93','#967965','#7a7892','#9b8265','#5c7d89','#80906a','#a07071','#797f9c'];
    window.__fixtureTracks=Array.from({length:36},(_,i)=>({name:names[i%names.length]+' '+(i+1),singer:['陈一','林听','徐远'][i%3],source:'kw',songmid:'design-'+i,interval:'03:28',albumName:'日常的声音',img:cover(colors[i%9],names[i%9]),types:[{type:'128k',size:'3.2M'}],_types:{'128k':{size:'3.2M'}}}));
    window.__fixtureLists=names.map((name,i)=>({id:'design-list-'+i,name,source:'kw',author:['音乐编辑部','听见生活','独立音乐人'][i%3],time:'2026-10-20',img:cover(colors[i],name),total:'36',play_count:'1.2万',desc:'把日常的片刻，留给喜欢的音乐。'}));
    for(const {id} of sdk.sources){ const api=sdk[id]; if(!api)continue;
      if(api.musicSearch) api.musicSearch.search=async()=>({list:window.__fixtureTracks,source:'kw',total:36,limit:36,allPage:1});
      if(api.songList){ api.songList.getTags=async()=>({source:id,hotTag:[{id:'design',name:'轻音乐',source:id}],tags:[]});
        api.songList.search=async()=>({source:id,list:window.__fixtureLists,total:9,limit:30,allPage:1});
        api.songList.getList=async()=>({source:id,list:window.__fixtureLists,total:9,limit:30,page:1});
        api.songList.getListDetail=async()=>({source:id,list:window.__fixtureTracks,total:36,limit:36,page:1,info:{name:'午后轻听',desc:'把日常的片刻，留给喜欢的音乐。',img:window.__fixtureLists[0].img}}); }
      if(api.leaderboard){api.leaderboard.getBoards=async()=>({source:id,list:['热歌榜','新歌榜','飙升榜','原创榜'].map((name,i)=>({id:id+'__design-'+i,bangid:'design-'+i,name}))});
        api.leaderboard.getList=async()=>({source:id,list:window.__fixtureTracks,total:36,limit:36,page:1});}
    }
  })()`)
  const layouts = []
  const capture = async(name) => {
    await settleFrame()
    await new Promise(resolve => setTimeout(resolve, 250))
    const layout = await run('(()=>{ const page=document.querySelector(\'#view > .view-container\')||document.querySelector(\'[data-feature="\'+window.__suiteRoute()?.$?.type?.name+\'"]\')||document.getElementById(\'view\'); const r=page.getBoundingClientRect();return {width:innerWidth,viewWidth:r.width,scrollWidth:page.scrollWidth,clientWidth:page.clientWidth,title:document.querySelector(\'.music-page-heading h2\')?.textContent,headingRect:document.querySelector(\'.music-page-heading\')?.getBoundingClientRect().toJSON(),html:document.querySelector(\'[data-feature]\')?.outerHTML.slice(0,800)};})()')
    assert.ok(layout.scrollWidth <= layout.clientWidth + 2, `${name} has no horizontal page overflow`)
    layouts.push({ name, ...layout })
    await fs.writeFile(path.join(evidence, name + '.json'), JSON.stringify(layout, null, 2))
    await fs.writeFile(path.join(evidence, name + '.png'), (await host.webContents.capturePage()).toPNG())
  }
  await navigate('/search?source=kw&type=music&text=')
  await waitFor(() => run('Boolean(window.__suiteFind(window.__suiteRoute().$.subTree,\'BlankView\'))'), 'search landing')
  await run('(()=>{const blank=window.__suiteFind(window.__suiteRoute().$.subTree,\'BlankView\').proxy;blank.appSetting[\'search.isShowHotSearch\']=true;blank.appSetting[\'search.isShowHistorySearch\']=true;blank.historyList.splice(0,blank.historyList.length,\'纯音乐\',\'民谣\',\'雨天\',\'独立音乐\');blank.hotSearchList.splice(0,blank.hotSearchList.length,\'轻音乐\',\'华语经典\',\'钢琴\',\'晚安音乐\',\'城市散步\',\'爵士\');})()')
  await capture('page-search')
  await navigate('/search?source=kw&type=music&text=午后')
  await waitFor(() => run('document.body.textContent.includes(\'午后轻听 1\')'), 'search result fixture')
  await capture('page-search-results')
  await navigate('/search?source=kw&type=songlist&text=轻听')
  await waitFor(() => run('document.querySelectorAll(\'[data-feature=search] li[role=button]\').length >= 9'), 'playlist search fixture')
  await capture('page-search-songlists')
  await navigate('/leaderboard?source=kw&boardId=kw__design-0')
  await waitFor(() => run('document.body.textContent.includes(\'午后轻听 1\')'), 'leaderboard fixture')
  await capture('page-leaderboard')
  await navigate('/songList/list?source=kw&tagId=design&sortId=new&page=1')
  await waitFor(() => run('document.querySelectorAll(\'[data-feature=songlists] img\').length >= 9'), 'playlist gallery fixture')
  await waitFor(() => run('Array.from(document.querySelectorAll(\'[data-feature=songlists] img\')).every(img=>img.complete&&img.naturalWidth)'), 'gallery artwork')
  await capture('page-songlists')
  host.setSize(760, 650)
  await capture('page-songlists-narrow')
  await run('document.querySelector(\'[data-feature=songlists] li[role=button]\').click()')
  await waitFor(() => run('document.querySelector(\'[data-feature="songlist-detail"] table\') && document.body.textContent.includes(\'午后轻听 1\')'), 'playlist detail after card click')
  await capture('page-songlist-detail-narrow')
  host.setSize(1114, 718)
  await capture('page-songlist-detail')
  await run('window.__suiteRoute().handleBack()')
  await waitFor(() => run('Boolean(document.querySelector(\'[data-feature=songlists] img\'))'), 'playlist back returns gallery')
  await navigate('/list?id=default')
  await waitFor(() => run('document.body.textContent.includes(\'Local fixture 0\')'), 'original local table restored')
  await capture('page-my-list')
  host.setSize(760, 650); await capture('page-my-list-narrow'); host.setSize(1114, 718)
  await navigate('/download')
  await waitFor(() => run('Boolean(document.querySelector(\'[data-feature=download] .music-page-empty\'))'), 'download empty state')
  await capture('page-download-empty')
  // Persist representative tasks to the disposable SQLite database; no transfer is started.
  await global.lx.worker.dbService.downloadInfoSave(['pause', 'error', 'completed'].map((status, i) => ({
    id: 'design-task-' + i,
    status,
    statusText: ['已暂停', '链接失效，请重试', '下载完成'][i],
    isComplate: status === 'completed',
    downloaded: [42, 0, 100][i],
    total: 100,
    progress: [42, 0, 100][i],
    speed: '',
    writeQueue: 0,
    metadata: { musicInfo: songs[i], quality: '128k', url: '', ext: 'mp3', fileName: 'fixture-' + i + '.mp3', filePath: '/nonexistent/fixture-' + i + '.mp3' },
  })), 'bottom')
  await navigate('/list?id=default'); await navigate('/download')
  await waitFor(() => run('window.__suiteRoute()?.list?.length===3'), 'download tasks fixture')
  await capture('page-download-tasks')
  await run('window.__suiteManager.setFeatureView(\'download\',\'compact\')')
  await waitFor(() => run('document.querySelectorAll(\'.suite-task-grid article\').length===3'), 'download card tasks')
  assert.equal(await run('Array.from(document.querySelectorAll(\'.suite-task-grid article\')).map(card=>Array.from(card.querySelectorAll(\'button\')).map(b=>b.textContent).join(\',\')).join(\';\')'), '开始下载,移除;开始下载,移除;播放,移除')
  await capture('page-download-cards')
  await run('window.__suiteRoute().list[0].status=\'run\';window.__suiteRoute().list[0].statusText=\'正在下载\'')
  await waitFor(() => run('document.querySelector(\'.suite-task-grid article\').textContent.includes(\'暂停任务\')'), 'running card has pause action')
  await run('window.__suiteRoute().activeTab=\'finished\'')
  await waitFor(() => run('document.querySelectorAll(\'.suite-task-grid article\').length===1'), 'completed filter')
  await run('window.__suiteRoute().activeTab=\'all\';window.__suiteManager.setFeatureView(\'download\',\'classic\')')
  await navigate('/dj')
  await waitFor(() => run('Boolean(document.querySelector(\'[data-feature=dj] textarea\'))'), 'DJ original page')
  await capture('page-dj')
  host.setSize(760, 650); await capture('page-dj-narrow'); host.setSize(1114, 718)
  await run('window.__suiteManager.setFeatureView(\'dj\',\'compact\')')
  await waitFor(() => run('Boolean(document.querySelector(\'.suite-dj-conversation\'))'), 'DJ conversation page')
  await capture('page-dj-conversation')
  await run('window.__suiteManager.setFeatureView(\'dj\',\'classic\')')
  host.setSize(760, 650)
  for (const [name, route, selector] of [
    ['page-search-narrow', '/search?source=kw&type=music&text=午后', '[data-feature=search] table'],
    ['page-leaderboard-narrow', '/leaderboard?source=kw&boardId=kw__design-0', '[data-feature=leaderboard] table'],
    ['page-download-narrow', '/download', '[data-feature=download] table'],
  ]) { await navigate(route); await waitFor(() => run(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), name); await capture(name) }
  host.setSize(1114, 718)
  await navigate('/setting')
  await waitFor(() => run('Boolean(window.__suiteRoute()?.toggleTab)'), 'theme settings')
  await run('window.__suiteRoute().toggleTab(\'SettingBasic\')')
  await waitFor(() => run('Boolean(window.__suiteFind(window.__suiteRoute().$.subTree,\'Feature_settings_basic\')?.proxy.toggleTheme)'), 'page dark theme control')
  await run('window.__pageToggleTheme=window.__suiteFind(window.__suiteRoute().$.subTree,\'Feature_settings_basic\').proxy.toggleTheme;window.__pageToggleTheme({id:\'black\'})')
  for (const [name, route, selector] of [
    ['page-songlists-dark', '/songList/list?source=kw&tagId=design&sortId=new&page=1', '[data-feature=songlists] img'],
    ['page-my-list-dark', '/list?id=default', '[data-feature=list] table'],
    ['page-dj-dark', '/dj', '[data-feature=dj] textarea'],
  ]) { await navigate(route); await waitFor(() => run(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), name); await capture(name) }
  await run('window.__pageToggleTheme({id:\'green\'})')
  await fs.writeFile(path.join(evidence, 'page-layouts.json'), JSON.stringify({ fixtures: true, sdk, layouts }, null, 2))
  await navigate('/extensions')
  console.log('PAGE DESIGN PASS: search, gallery/detail, leaderboard, local list, download states/filters, DJ and narrow layouts')
}
