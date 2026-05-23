// 忆闪 YiShan v3 - 首页 Dashboard
const { loadWords, getStats, getStabilityBuckets, getTodayStats, getStreak } = require('../../utils/storage');
const { predictRecallProbability, getStudyAdvice } = require('../../utils/algorithm');
const app = getApp();

Page({
  data: {
    words: [],
    stats: { total: 0, mastered: 0, due: 0, newCount: 0 },
    estimatedVocab: '--',
    avgRecall: 0,
    connectivity: 0,
    streak: 0,
    todayStudied: 0,
    advice: { level: 'new', message: '' },
    weekData: [],
    showVocabTest: false,
    isLoading: true,
    needGuide: false,
    isDarkMode: false
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      isDarkMode: app.globalData.darkMode
    });
  },

  onShow() {
    this.setData({ isDarkMode: app.globalData.darkMode });
    if (!app.globalData.guideDone) {
      wx.navigateTo({ url: '/pages/guide/guide' });
      return;
    }
    this.refreshData();
  },

  onPullDownRefresh() {
    this.refreshData().then(function () { wx.stopPullDownRefresh(); });
  },

  refreshData() {
    var that = this;
    this.setData({ isLoading: true });
    return new Promise(function (resolve) {
      try {
        var words = loadWords(true);  // 强制刷新，避免缓存过期
        var stats = getStats(words);
        var advice = getStudyAdvice(words);
        var now = Date.now();
        var recallSum = 0;
        var connected = 0;

        for (var i = 0; i < words.length; i++) {
          recallSum += predictRecallProbability(words[i], now);
          if ((words[i].stability || 0) >= 60) connected++;
        }

        var avgRecall = words.length ? Math.round((recallSum / words.length) * 100) : 0;
        var connectivity = words.length ? Math.round((connected / words.length) * 100) : 0;

        // 词汇量估算：掌握词数 × 扩展系数（经验值）
        var vocabEstimate = '--';
        if (words.length > 0) {
          var mastered = stats.mastered;
          var expansion = 1 + (mastered / Math.max(1, words.length)) * 3;
          vocabEstimate = Math.round(words.length * expansion).toLocaleString();
        }

        var today = getTodayStats();
        var streak = getStreak();
        var weekData = getWeekStats();

        that.setData({
          words: words,
          stats: stats,
          advice: advice,
          estimatedVocab: vocabEstimate,
          avgRecall: avgRecall,
          connectivity: connectivity,
          streak: streak,
          todayStudied: today.studied,
          weekData: weekData,
          isLoading: false
        });
        resolve();
      } catch (err) {
        console.error('[index] 数据加载失败:', err);
        that.setData({ isLoading: false });
        resolve();
      }
    });
  },

  onStartStudy() {
    if (this.data.stats.total === 0) {
      wx.showToast({ title: '先添加几个单词吧~', icon: 'none' });
      return;
    }
    wx.switchTab({ url: '/pages/study/study' });
  },

  onOpenVocabTest() {
    this.setData({ showVocabTest: true });
  },

  onCloseVocabTest() {
    this.setData({ showVocabTest: false });
  },

  onVocabFinish(e) {
    this.setData({ estimatedVocab: e.detail, showVocabTest: false });
    this.refreshData();
  },

  setTheme(isDark) {
    this.setData({ isDarkMode: isDark });
  },

  onShareAppMessage() {
    return {
      title: '忆闪 YiShan - 科学背单词，SM-2 自适应算法',
      path: '/pages/index/index'
    };
  }
});