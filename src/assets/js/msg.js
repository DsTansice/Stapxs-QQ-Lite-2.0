/*
 * @FileDescription: 消息处理模块
 * @Author: Stapxs
 * @Date: 2022/11/1
 * @Version: 1.0
 * @Description: 此模块用于拆分和保存/处理 bot 返回的各类信息，整个运行时数据也保存在这儿。
*/

import Vue from 'vue'
import FileDownloader from 'js-file-downloader'
import Util from './util'
import Option from './options'

import { logger, popInfo } from './base'
import { connect as connecter, login } from './connect'

// 处理消息
export function parse (str) {
  const msg = JSON.parse(str)
  if (msg.echo !== undefined) {
    /* eslint-disable */
    switch (msg.echo) {
      case 'websocketTest'      : backTestInfo(msg); break
      case 'getGroupList'       : saveUser(msg.data); break
      case 'getFriendList'      : saveUser(msg.data); break
      case 'getLoginInfo'       : saveLoginInfo(msg.data); break
      case 'getVersionInfo'     : saveBotInfo(msg.data); break
      case 'getMoreLoginInfo'   : Vue.set(login, 'info', msg.data.data.result.buddy.info_list[0]); break
      case 'getMoreGroupInfo'   : saveInfo(runtimeData.onChat.info, 'group', msg.data.data); break
      case 'getMoreUserInfo'    : saveInfo(runtimeData.onChat.info, 'user', msg.data.data.result.buddy.info_list[0]); break
      case 'getGroupMemberList' : saveGroupMember(msg.data); break
      case 'getGroupFiles'      : saveFileList(msg.data.data); break
      case 'getMoreGroupFiles'  : saveMoreFileList(msg.data.data); break
      case 'getGroupNotices'    : Vue.set(runtimeData.onChat.info, 'group_notices', msg.data.data); break
      case 'getForwardMsg'      : saveForwardMsg(msg.data); break
      case 'getChatHistoryFist' : saveMsgFist(msg); break
      case 'getChatHistory'     : saveMsg(msg); break
      case 'sendMsgBack'        : showSendedMsg(msg); break
      case 'getRoamingStamp'    : Vue.set(runtimeData, 'stickers', msg.data.reverse()); break
      case 'getUserInfoInGroup' : Vue.set(runtimeData.onChat.info, 'me', msg); break
      default                   : {
        const echoList = msg.echo.split('_')
        const head = echoList[0]
        if(msg.echo.indexOf('_') > 0) {
          // 复杂消息头
          // PS：复杂消息头由“消息头_参数1_参数N”组成
          switch (head) {
            case 'getSendMsg'         : saveSendedMsg(echoList, msg); break
            case 'getGroupMemberInfo' : saveMemberInfo(msg); break
            case 'getGroupDirFiles'   : saveDirFile(msg); break
            case 'downloadGroupFile'  : downloadGroupFile(msg); break
          }
        }
      }
    }
    /* eslint-enable */
  } else {
    /* eslint-disable */
    switch (msg.post_type) {
      // gocqhttp 自动发送的消息回调和其他消息有区分
      case 'message_sent' : msg.post_type = 'message'
      case 'message'      : newMsg(msg); break
      case 'notice'       : {
        switch (msg.sub_type) {
          case 'recall'     : revokeMsg(msg); break
        }
        break
      }
    }
    /* eslint-enable */
  }
}

// ===================================================

// PS：这玩意只能用来保存 Object
function saveInfo (parent, name, data) {
  if (parent[name] === undefined) {
    parent[name] = {}
  }
  Vue.set(parent, name, data)
}
function saveUser (list) {
  const back = Util.mergeList(runtimeData.userList, list)
  Vue.set(runtimeData, 'userList', back)
  // 刷新置顶列表
  let info = Vue.$cookies.get('top')
  if (info !== null) {
    Vue.set(runtimeData, 'topInfo', info)
    const topList = info[runtimeData.loginInfo.uin]
    if (topList !== undefined) {
      list.forEach((item) => {
        const id = Number(item.user_id ? item.user_id : item.group_id)
        if (topList.indexOf(id) >= 0) {
          item.always_top = true
          runtimeData.onMsg.push(item)
        }
      })
    }
  }
}
function saveLoginInfo (data) {
  // 如果是 user_id 的话 ……
  if (data.uin === undefined && data.user_id !== undefined) {
    data.uin = data.user_id
  }
  Vue.set(runtimeData, 'loginInfo', data)
  Vue.set(login, 'status', true)
  // 获取更详细的信息
  let url = 'https://find.qq.com/proxy/domain/cgi.find.qq.com/qqfind/find_v11?backver=2'
  let info = `bnum=15&pagesize=15&id=0&sid=0&page=0&pageindex=0&ext=&guagua=1&gnum=12&guaguan=2&type=2&ver=4903&longitude=116.405285&latitude=39.904989&lbs_addr_country=%E4%B8%AD%E5%9B%BD&lbs_addr_province=%E5%8C%97%E4%BA%AC&lbs_addr_city=%E5%8C%97%E4%BA%AC%E5%B8%82&keyword=${data.uin}&nf=0&of=0&ldw=${data.bkn}`
  connecter.send(
    'http_proxy',
    { 'url': url, 'method': 'post', 'data': info },
    'getMoreLoginInfo'
  )
  // GA：将 QQ 号 MD5 编码后用于用户识别码
  if (Option.get('open_ga_user') === true) {
    const md5 = require('js-md5')
    const userId = md5(data.uin)
    Vue.$gtag.config({
      user_id: userId
    })
  }
}
function saveFileList (data) {
  if (data.ec !== 0) {
    popInfo.add(
      popInfo.appMsgType.err,
      Util.$t('pop_chat_chat_info_load_file_err', {code: data.ec})
    )
  } else {
    saveInfo(runtimeData.onChat.info, 'group_files', data)
  }
}
function saveMoreFileList (data) {
  if (runtimeData.onChat.info !== undefined && runtimeData.onChat.info.group_files !== undefined) {
    // 追加文件列表
    const list = Util.mergeList(runtimeData.onChat.info.group_files.file_list, data.file_list)
    saveInfo(runtimeData.onChat.info.group_files, 'file_list', list)
    // 设置最大值位置
    saveInfo(runtimeData.onChat.info.group_files, 'next_index', data.next_index)
  }
}
function saveForwardMsg (data) {
  // 格式化不规范消息格式
  for (let i = 0; i < data.length; i++) {
    data[i].sender = {
      user_id: data[i].user_id,
      nickname: data[i].nickname,
      card: ''
    }
  }
  Vue.set(runtimeData, 'mergeMessageList', data)
}
function backTestInfo (data) {
  runtimeData.wsTestBack = data
  console.log('=========================')
  console.log(data)
  console.log('=========================')
}
function saveMsgFist (msg) {
  if (msg.error !== undefined || msg.status === 'failed') {
    popInfo.add(popInfo.appMsgType.err, Util.$t('pop_chat_load_msg_err', {code: msg.error}))
    Vue.set(runtimeData, 'messageList', [])
  } else {
    // TODO: 对 CQCode 消息进行转换
    Vue.set(runtimeData, 'messageList', msg.data)
    // setTimeout(() => {
    //   this.$refs.chat.scrollBottom()
    // }, 500)
  }
}
function saveMsg (msg) {
  if (msg.error !== undefined) {
    popInfo.add(popInfo.appMsgType.err, this.$t('pop_chat_load_msg_err', {code: msg.error}))
  } else {
    const items = msg.data
    items.pop() // 去除最后一条重复的消息，获取历史消息会返回当前消息 **以及** 之前的 N-1 条
    if (items.length < 1) {
      Vue.set(runtimeData.tags, 'canLoadHistory', false)
      return
    }
    // TODO: 对 CQCode 消息进行转换
    Vue.set(runtimeData, 'messageList', Util.mergeList(items, runtimeData.messageList))
  }
}
function showSendedMsg (msg) {
  if (msg.error !== undefined) {
    popInfo.add(popInfo.appMsgType.err, Util.$t('pop_chat_send_msg_err', {code: msg.error}))
  } else {
    if (msg.message_id !== undefined && Option.get('send_reget') !== true) {
      // 请求消息内容
      connecter.send(
        'get_msg',
        { 'message_id': msg.message_id },
        'getSendMsg_' + msg.message_id + '_0'
      )
    }
  }
}
function saveSendedMsg (echoList, msg) {
  // TODO: 这里暂时没有考虑消息获取失败的情况（因为没有例子）
  if (Number(echoList[2]) <= 5) {
    if (echoList[1] !== msg.message_id) {
      // 返回的不是这条消息，重新请求
      popInfo.add(popInfo.appMsgType.err, Util.$t('pop_chat_get_msg_err') + '(' + echoList[2] + ')')
      setTimeout(() => {
        connecter.send(
          'get_msg',
          { 'message_id': echoList[1] },
          'getSendMsg_' + echoList[1] + '_' + (Number(echoList[2]) + 1)
        )
      }, 5000)
    } else {
      Vue.set(runtimeData, 'messageList', Util.mergeList(runtimeData.messageList, [msg]))
    }
  } else {
    popInfo.add(popInfo.appMsgType.err, Util.$t('pop_chat_get_msg_err_fin'))
  }
}
function saveMemberInfo (msg) {
  const pointInfo = msg.echo.split('_')
  msg.x = pointInfo[1]
  msg.y = pointInfo[2]
  Vue.set(runtimeData, 'nowMemberInfo', msg)
}
function saveDirFile (msg) {
  // TODO: 这边不分页直接拿全
  const id = msg.echo.split('_')[1]
  let fileIndex = -1
  runtimeData.onChat.info.group_files.file_list.forEach((item, index) => {
    if (item.id === id) {
      fileIndex = index
    }
  })
  Vue.set(runtimeData.onChat.info.group_files.file_list[fileIndex], 'sub_list', msg.data.data.file_list)
}
function downloadGroupFile (msg) {
  const info = msg.echo.split('_')
  const id = info[1]
  const json = JSON.parse(msg.data.data.substring(msg.data.data.indexOf('(') + 1, msg.data.data.lastIndexOf(')')))
  let fileName = 'new-file'
  let fileIndex = -1
  let subFileIndex = -1
  runtimeData.onChat.info.group_files.file_list.forEach((item, index) => {
    if (item.id === id) {
      fileName = Util.htmlDecodeByRegExp(item.name)
      fileIndex = index
    }
  })
  // 这是个子文件
  if (info[2] !== undefined) {
    runtimeData.onChat.info.group_files.file_list[fileIndex].sub_list.forEach((item, index) => {
      if (item.id === info[2]) {
        fileName = Util.htmlDecodeByRegExp(item.name)
        subFileIndex = index
      }
    })
  }
  const onProcess = function (event) {
    if (!event.lengthComputable) return
    var downloadingPercentage = Math.floor(event.loaded / event.total * 100)
    if (fileIndex !== -1) {
      if (subFileIndex === -1) {
        if (runtimeData.onChat.info.group_files.file_list[fileIndex].downloadingPercentage === undefined) {
          Vue.set(runtimeData.onChat.info.group_files.file_list[fileIndex], 'downloadingPercentage', 0)
        }
        Vue.set(runtimeData.onChat.info.group_files.file_list[fileIndex], 'downloadingPercentage', downloadingPercentage)
      } else {
        if (runtimeData.onChat.info.group_files.file_list[fileIndex].sub_list[subFileIndex].downloadingPercentage === undefined) {
          Vue.set(runtimeData.onChat.info.group_files.file_list[fileIndex].sub_list[subFileIndex], 'downloadingPercentage', 0)
        }
        Vue.set(runtimeData.onChat.info.group_files.file_list[fileIndex].sub_list[subFileIndex], 'downloadingPercentage', downloadingPercentage)
      }
    }
  }
  // 下载文件
  new FileDownloader({
    url: json.data.url,
    autoStart: true,
    process: onProcess,
    nameCallback: function () {
      return fileName
    }
  })
    .then(function () {
      console.log('finished')
    })
    .catch(function (error) {
      if (error) {
        console.log(error)
      }
    })
}
function newMsg (data) {
  // 对 CQCode 消息进行转换
  if (runtimeData.tags.msgType === 'CQCode') {
    data.message = Util.parseCQ(data.message)
  }
  const id = data.from_id ? data.from_id : data.group_id
  const sender = data.sender.user_id
  // 消息回调检查
  // PS：如果在新消息中获取到了自己的消息，则自动打开“停止消息回调”设置防止发送的消息重复
  if (Option.get('send_reget') !== true && sender === runtimeData.loginInfo.uin) {
    Option.save('send_reget', true)
  }
  // 显示消息
  if (id === runtimeData.onChat.id) {
    const list = runtimeData.messageList
    Vue.set(runtimeData, 'messageList', Util.mergeList(list, [data]))
  }
  // 刷新消息列表
  const get = runtimeData.onMsg.filter((item) => {
    return Number(id) === Number(item.user_id) || Number(id) === Number(item.group_id)
  })
  // PS：在消息列表内的永远会刷新，不需要被提及
  if (get.length === 1) {
    const item = get[0]
    Vue.set(item, 'raw_msg', data.raw_message)
    Vue.set(item, 'time', Number(data.time) * 1000)
  }
  // (发送者不是群组 || 群组 AT || 群组 AT 全体 || 打开了通知全部消息) 这些情况需要进行新消息处理
  if (data.message_type !== 'group' || data.atme || data.atall || Option.get('notice_all') === true) {
    // (发送者没有被打开 || 窗口被最小化) 这些情况需要进行消息通知
    if (id !== runtimeData.onChat.id || document.hidden) {
      // 检查通知权限，老旧浏览器不支持这个功能
      if (Notification.permission === 'default') {
        Notification.requestPermission(function (status) {
          if (Notification.permission !== status) {
            Notification.permission = status
          }
          sendNotice(data)
        })
      } else if (Notification.permission !== 'denied' &&
      Notification.permission !== 'default') {
        sendNotice(data)
      }
    }
    // 对消息列表进行一些处理
    let listItem = null
    // 如果发送者已经在消息列表里了，直接获取
    // 否则将它添加到消息列表里
    if (get.length === 1) {
      listItem = get[0]
    } else {
      const getList = runtimeData.userList.filter((item) => { return item.user_id === id || item.group_id === id })
      if (getList.length === 1) {
        runtimeData.onMsg.push(getList[0])
        listItem = getList[0]
      }
    }
    if (listItem !== null) {
      Vue.set(listItem, 'raw_msg', data.raw_message)
      Vue.set(listItem, 'time', Number(data.time) * 1000)
      if (id !== runtimeData.onChat.id) {
        Vue.set(listItem, 'new_msg', true)
      }
    }
    // 重新排序列表
    let newList = []
    let topNum = 1
    runtimeData.onMsg.filter((item) => {
      if (item.always_top === true) {
        newList.unshift(item)
        topNum++
      } else if (item.new_msg === true) {
        newList.splice(topNum - 1, 0, item)
      } else {
        newList.push(item)
      }
    })
    Vue.set(runtimeData, 'onMsg', newList)
  }
}
function sendNotice (msg) {
  if (Option.get('close_notice') !== true) {
    let raw = Util.getMsgRawTxt(msg.message)
    raw = raw === '' ? msg.raw_message : raw
    // 构建通知
    let notificationTile = ''
    let notificationBody = {}
    if (msg.message_type === 'group') {
      notificationTile = msg.group_name
      notificationBody.body = msg.sender.nickname + ':' + raw
      notificationBody.tag = `${msg.group_id}/${msg.message_id}`
      notificationBody.icon = `https://p.qlogo.cn/gh/${msg.group_id}/${msg.group_id}/0`
    } else {
      notificationTile = msg.sender.nickname
      notificationBody.body = raw
      notificationBody.tag = `${msg.user_id}/${msg.message_id}`
      notificationBody.icon = `https://q1.qlogo.cn/g?b=qq&s=0&nk=${msg.user_id}`
    }
    // 如果消息有图片，追加第一张图片
    msg.message.forEach((item) => {
      if (item.type === 'image' && notificationBody.image === undefined) {
        notificationBody.image = item.url
      }
    })
    // 发起通知
    let notification = new Notification(notificationTile, notificationBody)
    notificationList[msg.message_id] = notification
    notification.onclick = function () {
      const userId = event.target.tag.split('/')[0]
      const msgId = event.target.tag.substring(userId.length + 1, event.target.tag.length)
      if (notificationList[msgId] !== undefined) {
        delete notificationList[msgId]
      }

      // 跳转到这条消息的发送者页面
      window.focus()
      let body = document.getElementById('user-' + userId)
      if (body === null) {
        // 从缓存列表里寻找这个 ID
        for (var i = 0; i < runtimeData.userList.length; i++) {
          const item = runtimeData.userList[i]
          const id = item.user_id !== undefined ? item.user_id : item.group_id
          if (String(id) === userId) {
            // 把它插入到显示列表的第一个
            Vue.set(runtimeData, 'showData', Util.mergeList([item], runtimeData.showData))
            Vue.nextTick(() => {
              // 添加一个消息跳转标记
              document.getElementById('user-' + userId).dataset.jump = msgId
              // 然后点一下它触发聊天框切换
              document.getElementById('user-' + userId).click()
            })
            break
          }
        }
      } else {
        document.getElementById('user-' + userId).click()
      }
    }
    notification.onclose = function () {
      const msgId = event.target.tag.split('/')[1]
      if (notificationList[msgId] !== undefined) {
        delete notificationList[msgId]
      }
    }
  }
}
function saveBotInfo (data) {
  Vue.set(runtimeData, 'botInfo', data)
  // GA：提交统计信息，主要在意的是 bot 类型
  if (Option.get('open_ga_bot') !== false) {
    if (data.app_name !== undefined) {
      Vue.$gtag.event('login', {method: data.app_name})
    } else {
      Vue.$gtag.event('login')
    }
  }
  // 加载切换兼容页面
  Util.loadPage(data.app_name)
}
function saveGroupMember (data) {
  // 筛选列表
  const adminList = data.filter((item) => {
    return item.role === 'admin'
  })
  const createrList = data.filter((item) => {
    return item.role === 'owner'
  })
  const memberList = data.filter((item) => {
    return item.role !== 'admin' && item.role !== 'owner'
  })
  // 拼接列表
  const back = Util.mergeList(createrList, Util.mergeList(adminList, memberList))
  saveInfo(runtimeData.onChat.info, 'group_members', back)
}
function revokeMsg (msg) {
  const chatId = msg.notice_type === 'group' ? msg.group_id : msg.user_id
  const whoRevoke = msg.operator_id
  const msgId = msg.message_id
  const msgSeq = msg.seq
  // 当前窗口
  if (Number(chatId) === Number(runtimeData.onChat.id)) {
    // 寻找消息
    // let msgGet = null
    let msgIndex = -1
    runtimeData.messageList.forEach((item, index) => {
      if (item.message_id === msgId) {
        // msgGet = item
        msgIndex = index
      }
    })
    // if (msgGet !== null && msgIndex !== -1) {
    //   msgGet.revoke = true
    //   Vue.set(runtimeData.messageList, msgIndex, msgGet)
    // } else {
    //   logger.error(Util.$t('log_revoke_miss'))
    // }
    // 寻找 DOM
    // PS：这儿本来打算通过更新数据的方式更新消息 ……
    // 但是 vue 并没有更新，暂时不知道为什么，改成寻找 dom（
    let dom = document.getElementById('chat-' + msgSeq)
    if (dom !== undefined) {
      dom = dom.getElementsByClassName('message-body')[0]
      dom = dom.lastChild
      if (Number(whoRevoke) === Number(runtimeData.loginInfo.uin)) {
        dom.style.opacity = '0.4'
      } else {
        // 隐藏消息
        document.getElementById('chat-' + msgSeq).style.display = 'none'
      }
      // 显示撤回提示
      const list = runtimeData.messageList
      if (msgIndex !== -1) {
        list.splice((msgIndex + 1), 0, msg)
        Vue.set(runtimeData, 'messageList', list)
      } else {
        Vue.set(runtimeData, 'messageList', Util.mergeList(list, [msg]))
      }
    } else {
      logger.error(Util.$t('log_revoke_miss'))
    }
  }
  // // 尝试撤回通知
  // if(window.notices != undefined && window.notices[msg.message_id] != undefined) {
  //     window.notices[msg.message_id].close()
  // }
}

let notificationList = {}

// 运行时数据，用于在全程序内共享使用
export let runtimeData = {
  onChat: { type: '', id: '', name: '', avatar: '', info: {} },
  onMsg: [],
  messageList: [],
  botInfo: {},
  loginInfo: {},
  pageView: {
    chatView: () => import('../../pages/Chat.vue'),
    msgView: () => import('../../components/msg/MsgBody.vue')
  },
  tags: {},
  topInfo: {}
}
