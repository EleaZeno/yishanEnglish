// 忆闪 YiShan v3 - 微信小程序入口
// 架构：Cloudflare Workers + D1（邮箱登录 + JWT）
// 本地存储作为主存储，登录后可选同步到云端

const { loadWords, getStats, isGuideDone, markGuideDone, invalidateCache } = require('./utils/storage');
const api = require('./utils/api');

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    darkMode: false,
    guideDone: false,
    statusBarHeight: 20,
    navBarHeight: 44,
    online: true
  },

  onLaunch() {
    // 获取系统信息（兼容低版本基础库）
    let statusBarHeight = 20;
    let navBarHeight = 44;
    try {
      if (wx.getWindowInfo) {
        const windowInfo = wx.getWindowInfo();
        statusBarHeight = windowInfo.statusBarHeight || 20;
        navBarHeight = statusBarHeight > 30 ? 44 : 48;
      } else {
        const sysInfo = wx.getSystemInfoSync();
        statusBarHeight = sysInfo.statusBarHeight || 20;
        navBarHeight = statusBarHeight > 30 ? 44 : 48;
      }
    } catch (e) {
      console.warn('[App] 获取窗口信息失败，使用默认值', e);
    }

    this.globalData.statusBarHeight = statusBarHeight;
    this.globalData.navBarHeight = navBarHeight;

    // 检测暗色模式（兼容处理）
    try {
      if (wx.getAppBaseInfo) {
        const appBaseInfo = wx.getAppBaseInfo();
        this.globalData.darkMode = appBaseInfo.theme === 'dark';
      }
    } catch (e) {
      this.globalData.darkMode = false;
    }

    this.globalData.guideDone = isGuideDone();

    // 从本地存储恢复用户会话
    try {
      const savedUser = wx.getStorageSync('yishan_current_user');
      const token = wx.getStorageSync('yishan_token');
      if (savedUser && token) {
        this.globalData.userInfo = savedUser;
        this.globalData.isLoggedIn = true;
        console.log('[App] 已恢复用户会话:', savedUser.email);
      }
    } catch (e) {
      console.warn('[App] 恢复会话失败:', e);
    }

    // 网络状态检测
    wx.getNetworkType({
      success: (res) => {
        this.globalData.online = res.networkType !== 'none';
      }
    });

    if (wx.onNetworkStatusChange) {
      wx.onNetworkStatusChange((res) => {
        this.globalData.online = res.isConnected;
        if (!res.isConnected) {
          wx.showToast({
            title: '网络已断开，数据将本地保存',
            icon: 'none',
            duration: 2000
          });
        }
      });
    }

    const sysInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    console.log('[App] 忆闪 YiShan v3 启动', {
      系统: sysInfo.platform || 'unknown',
      暗色: this.globalData.darkMode ? '是' : '否',
      引导: this.globalData.guideDone ? '已完成' : '需引导',
      登录: this.globalData.isLoggedIn ? '已登录' : '未登录'
    });
  },

  onError(error) {
    console.error('[App] 全局错误:', error);
  },

  onUnhandledRejection(res) {
    console.error('[App] 未捕获的 Promise 拒绝:', res.reason);
  },

  onShow() {
    try {
      if (!wx.getAppBaseInfo) return;
      const appBaseInfo = wx.getAppBaseInfo();
      const isDark = appBaseInfo.theme === 'dark';
      if (isDark !== this.globalData.darkMode) {
        this.globalData.darkMode = isDark;
        this._notifyThemeChange(isDark);
      }
    } catch (e) {}
  },

  completeGuide() {
    markGuideDone();
    this.globalData.guideDone = true;
  },

  resetGuide() {
    const { resetGuide: reset } = require('./utils/storage');
    reset();
    this.globalData.guideDone = false;
  },

  toggleDarkMode() {
    this.globalData.darkMode = !this.globalData.darkMode;
    this._notifyThemeChange(this.globalData.darkMode);
  },

  _notifyThemeChange(isDark) {
    const pages = getCurrentPages();
    for (const page of pages) {
      if (page && typeof page.setTheme === 'function') {
        try { page.setTheme(isDark); } catch (e) {}
      }
    }
  },

  onPageNotFound(res) {
    wx.redirectTo({ url: '/pages/index/index' });
  }
});
