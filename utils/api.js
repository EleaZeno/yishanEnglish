/**
 * 忆闪 YiShan - Cloudflare Worker API 调用层
 * 后端：Cloudflare Workers + D1，JWT 认证
 *
 * 字段格式与小程序本地存储完全对齐（SM-2 算法字段）
 */

const config = require('./config')

// Worker 域名（如需修改，改 config.js 中的 API_HOST）
const BASE_URL = config.API_HOST || 'https://yishan-api.workers.dev'

/* ========== 请求底层 ========== */

function request(options) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('yishan_token') || ''

    const headers = {
      'Content-Type': 'application/json',
      ...(options.header || {})
    }
    if (token) {
      headers['Authorization'] = 'Bearer ' + token
    }

    wx.request({
      url: BASE_URL + options.path,
      method: options.method || 'GET',
      header: headers,
      data: options.data || null,
      timeout: 10000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // Token 过期，清除登录状态
          wx.removeStorageSync('yishan_token')
          wx.removeStorageSync('yishan_current_user')
          const app = getApp()
          if (app) {
            app.globalData.userInfo = null
            app.globalData.isLoggedIn = false
          }
          reject(new Error('登录已过期，请重新登录'))
        } else {
          const msg = res.data && res.data.error
            ? res.data.error
            : '请求失败 (' + res.statusCode + ')'
          reject(new Error(msg))
        }
      },
      fail: (err) => {
        const msg = err.errMsg || '网络错误，请检查连接'
        reject(new Error(msg))
      }
    })
  })
}

// ========== 认证 ==========

function register(email, password) {
  return request({
    method: 'POST',
    path: '/api/mp/register',
    data: { email, password }
  })
}

function login(email, password) {
  return request({
    method: 'POST',
    path: '/api/mp/login',
    data: { email, password }
  })
}

function saveSession(user, token) {
  wx.setStorageSync('yishan_token', token)
  wx.setStorageSync('yishan_current_user', user)
  const app = getApp()
  if (app) {
    app.globalData.userInfo = user
    app.globalData.isLoggedIn = true
  }
}

function clearSession() {
  wx.removeStorageSync('yishan_token')
  wx.removeStorageSync('yishan_current_user')
  const app = getApp()
  if (app) {
    app.globalData.userInfo = null
    app.globalData.isLoggedIn = false
  }
}

function isLoggedIn() {
  return !!wx.getStorageSync('yishan_token')
}

// ========== 单词 CRUD ==========

function fetchWords(mode) {
  mode = mode || 'all'
  return request({
    method: 'GET',
    path: '/api/mp/words?mode=' + mode
  }).then(function (res) { return res.words || [] })
}

function addWord(word) {
  return request({
    method: 'POST',
    path: '/api/mp/words',
    data: word
  })
}

function updateWord(id, updates) {
  return request({
    method: 'PUT',
    path: '/api/mp/words/' + id,
    data: updates
  })
}

function deleteWord(id) {
  return request({
    method: 'DELETE',
    path: '/api/mp/words/' + id
  })
}

/**
 * 全量同步：将本地单词列表上传到云端（替换模式）
 */
function syncWords(words) {
  return request({
    method: 'POST',
    path: '/api/mp/sync',
    data: { words: words }
  })
}

// ========== 学习记录 ==========

function logSession(data) {
  return request({
    method: 'POST',
    path: '/api/mp/log',
    data: data
  })
}

// ========== 微信登录 ==========

function wxLogin(code) {
  return request({
    method: 'POST',
    path: '/api/mp/wx-login',
    data: { code: code }
  })
}

// ========== 健康检查 ==========

function healthCheck() {
  return request({
    method: 'GET',
    path: '/api/mp/health'
  })
}

module.exports = {
  BASE_URL,
  register, login, saveSession, clearSession, isLoggedIn,
  fetchWords, addWord, updateWord, deleteWord, syncWords,
  logSession, healthCheck, wxLogin
}