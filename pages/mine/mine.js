// 忆闪 YiShan v3 - 我的页面（Cloudflare Workers 云同步 + 数据管理）
const {
  loadWords, getStats, getStabilityBuckets, getStreak,
  getWeekStats, getTodayStats, getCategoryStats,
  importWordsJSON, exportWordsJSON, saveWords,
  invalidateCache
} = require('../../utils/storage');
const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    words: [],
    stats: { total: 0, mastered: 0, due: 0 },
    buckets: [],
    categories: [],
    streak: 0,
    avgStability: 0,
    weekData: [],
    todayStudied: 0,
    isLoading: true,
    showAbout: false,
    isDarkMode: false,
    isLoggedIn: false,
    userInfo: null,
    cloudSyncing: false,
    showImport: false,
    importText: ''
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      isDarkMode: app.globalData.darkMode
    });
  },

  onShow() {
    this.setData({ isLoading: true, isDarkMode: app.globalData.darkMode });
    this.setData({
      isLoggedIn: app.globalData.isLoggedIn || false,
      userInfo: app.globalData.userInfo || null
    });
    this.refreshProfile();
  },

  onPullDownRefresh() {
    this.refreshProfile().then(function () { wx.stopPullDownRefresh(); });
  },

  refreshProfile() {
    var that = this;
    return new Promise(function (resolve) {
      try {
        var words = loadWords();
        var stats = getStats(words);
        var buckets = getStabilityBuckets(words);
        var categories = getCategoryStats(words);
        var streak = getStreak();
        var weekData = getWeekStats();
        var today = getTodayStats();

        var stabilitySum = 0;
        for (var i = 0; i < words.length; i++) {
          stabilitySum += (words[i].stability || 0);
        }
        var avgStability = words.length > 0 ? Math.round(stabilitySum / words.length) : 0;

        that.setData({
          words: words, stats: stats, buckets: buckets,
          categories: categories, streak: streak, avgStability: avgStability,
          weekData: weekData, todayStudied: today.studied,
          isLoading: false
        });
        resolve();
      } catch (e) {
        that.setData({ isLoading: false });
        resolve();
      }
    });
  },

  /* ========== 关于 ========== */
  onToggleAbout() {
    this.setData({ showAbout: !this.data.showAbout });
  },

  /* ========== 导出/导入 ========== */
  onExportData() {
    var words = loadWords();
    if (!words.length) {
      wx.showToast({ title: '词库为空', icon: 'none' });
      return;
    }
    var content = exportWordsJSON();
    wx.setClipboardData({
      data: content,
      success: function () {
        wx.showToast({ title: 'JSON 数据已复制到剪贴板', icon: 'success' });
      }
    });
  },

  onShowImport() {
    this.setData({ showImport: true, importText: '' });
  },

  onCloseImport() {
    this.setData({ showImport: false });
  },

  onImportInput(e) {
    this.setData({ importText: e.detail.value });
  },

  onConfirmImport() {
    var importText = this.data.importText;
    if (!importText.trim()) {
      wx.showToast({ title: '请粘贴 JSON 数据', icon: 'none' });
      return;
    }
    var result = importWordsJSON(importText);
    if (result.success) {
      this.setData({ showImport: false });
      this.refreshProfile();
      wx.showToast({ title: '成功导入 ' + result.added + ' 个新词', icon: 'success' });
    } else {
      wx.showToast({ title: result.error || '导入失败', icon: 'none' });
    }
  },

  /* ========== 登录 ========== */
  onLogin() {
    wx.navigateTo({ url: '/pages/auth/auth' });
  },

  /* ========== 云备份（上传 → Cloudflare Worker）========== */
  onCloudBackup() {
    var that = this;
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    // 从存储层加载（不缓存）
    var words = loadWords(true);
    if (words.length === 0) {
      wx.showToast({ title: '词库为空，无需同步', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '上传到云端',
      content: '将 ' + words.length + ' 个单词上传至云端，云端旧数据将被覆盖。',
      confirmColor: '#6366f1',
      success: function (res) {
        if (!res.confirm) return;
        that.setData({ cloudSyncing: true });
        api.syncWords(words).then(function (result) {
          that.setData({ cloudSyncing: false });
          wx.showToast({
            title: '同步成功 · ' + (result.imported || 0) + ' 词已上传',
            icon: 'success'
          });
        }).catch(function (err) {
          that.setData({ cloudSyncing: false });
          wx.showToast({
            title: '同步失败：' + (err.message || '请检查网络'),
            icon: 'none'
          });
        });
      }
    });
  },

  /* ========== 云恢复（下载 ← Cloudflare Worker）========== */
  onCloudRestore() {
    var that = this;
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '从云端下载',
      content: '云端数据将与本地合并，云端内容优先。确定继续？',
      confirmColor: '#6366f1',
      success: function (res) {
        if (!res.confirm) return;
        that.setData({ cloudSyncing: true });
        api.fetchWords('all').then(function (cloudWords) {
          var localWords = loadWords(true);
          var cloudMap = {};
          for (var i = 0; i < cloudWords.length; i++) {
            cloudMap[cloudWords[i].word.toLowerCase()] = true;
          }
          // 云端词 + 本地独有的词
          var merged = cloudWords.slice();
          for (var j = 0; j < localWords.length; j++) {
            var lw = localWords[j];
            if (!cloudMap[lw.word.toLowerCase()]) {
              merged.push(lw);
            }
          }
          saveWords(merged);
          invalidateCache();
          that.setData({ cloudSyncing: false });
          that.refreshProfile();
          wx.showToast({
            title: '下载成功 · 合并后 ' + merged.length + ' 词',
            icon: 'success'
          });
        }).catch(function (err) {
          that.setData({ cloudSyncing: false });
          wx.showToast({
            title: '下载失败：' + (err.message || '请检查网络'),
            icon: 'none'
          });
        });
      }
    });
  },

  /* ========== 设置 ========== */
  onToggleDarkMode() {
    app.toggleDarkMode();
    this.setData({ isDarkMode: app.globalData.darkMode });
  },

  onClearAll() {
    var that = this;
    wx.showModal({
      title: '危险操作',
      content: '确定要删除所有单词和学习记录吗？',
      confirmColor: '#f43f5e',
      success: function (res) {
        if (!res.confirm) return;

        // 备份数据用于可能恢复
        var wordsBackup = loadWords(true);
        var logsBackup = null;
        try { logsBackup = wx.getStorageSync('yishan_study_log'); } catch (e) {}

        // 清空
        wx.removeStorageSync('yishan_words');
        wx.removeStorageSync('yishan_study_log');
        invalidateCache();
        that.refreshProfile();

        // 提供 5 秒撤销窗口
        var toastDone = false;
        wx.showToast({ title: '已清空 · 5秒内可撤销', icon: 'none', duration: 5000 });

        // 5秒后提供确认恢复
        setTimeout(function () {
          wx.showModal({
            title: '撤销删除',
            content: '需要恢复刚才删除的数据吗？',
            confirmText: '恢复',
            cancelText: '不用',
            confirmColor: '#6366f1',
            success: function (r) {
              if (r.confirm) {
                wx.setStorageSync('yishan_words', JSON.stringify(wordsBackup));
                if (logsBackup) wx.setStorageSync('yishan_study_log', logsBackup);
                invalidateCache();
                that.refreshProfile();
                wx.showToast({ title: '数据已恢复', icon: 'success' });
              }
            }
          });
        }, 5000);
      }
    });
  },

  onResetGuide() {
    app.resetGuide();
    wx.showToast({ title: '引导已重置，下次启动生效', icon: 'none' });
  },

  onPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  setTheme(isDark) {
    this.setData({ isDarkMode: isDark });
  },

  onShareAppMessage() {
    return {
      title: '忆闪 YiShan - SM-2 自适应闪卡学习',
      path: '/pages/index/index'
    };
  }
});