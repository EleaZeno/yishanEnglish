// 忆闪 YiShan v3 - 学习会话页
// 多阶段学习（intro → spell → flashcard）+ SM-2算法 + 优先级排序
const { loadWords, saveWords, getSortedDueWords, recordStudyLog, getStreak, invalidateCache } = require('../../utils/storage');
const { getInitialWordState, updateWord, advanceStage } = require('../../utils/algorithm');
const app = getApp();

Page({
  data: {
    sessionWords: [],
    currentIndex: 0,
    completedSet: {},
    masteredCount: 0,    // 用简单计数器替代 Object.keys(...).length
    isFinished: false,
    loading: true,
    showAddWord: false,

    // 多阶段
    currentStage: 'intro',
    stageWord: null,
    spellInput: '',
    spellCorrect: null,

    // 统计
    sessionStats: { studied: 0, mastered: 0, failed: 0, duration: 0 },
    streak: 0,
    progress: 0,
    sessionStart: 0
  },

  onLoad() {
    this.setData({ isDarkMode: app.globalData.darkMode });
    wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage'] });
  },

  onShow() {
    this.setData({
      sessionStart: Date.now(),
      isDarkMode: app.globalData.darkMode
    });
    this.refreshSession();
  },

  /* ========== 会话初始化 ========== */
  refreshSession() {
    var words = loadWords();
    var sortedDue = getSortedDueWords(words);
    var isEmpty = sortedDue.length === 0;

    this.setData({
      sessionWords: sortedDue,
      currentIndex: 0,
      completedSet: {},
      masteredCount: 0,
      isFinished: false,
      loading: false,
      progress: 0,
      progressTotal: sortedDue.length,
      currentStage: isEmpty ? 'finished' : 'intro',
      stageWord: isEmpty ? null : sortedDue[0],
      sessionStats: { studied: 0, mastered: 0, failed: 0, duration: 0 }
    });
  },

  /* ========== 多阶段流程 ========== */
  onStartLearning() {
    this.setData({ currentStage: 'spell' });
  },

  onSpellInput(e) {
    this.setData({ spellInput: e.detail.value });
  },

  onCheckSpelling() {
    var stageWord = this.data.stageWord;
    var spellInput = this.data.spellInput;
    if (!stageWord || !spellInput) return;

    var correct = stageWord.word.trim().toLowerCase() === spellInput.trim().toLowerCase();
    this.setData({ spellCorrect: correct });

    var that = this;
    setTimeout(function () {
      that.setData({ currentStage: 'flashcard', spellCorrect: null, spellInput: '' });
    }, correct ? 800 : 1500);
  },

  onSkipSpelling() {
    var stageWord = this.data.stageWord;
    if (!stageWord) return;

    var words = loadWords();
    var idx = words.findIndex(function (w) { return w.id === stageWord.id; });
    if (idx >= 0) {
      var result = updateWord(words[idx], { quality: 0 });
      Object.assign(words[idx], result);
      saveWords(words);
    }

    this.setData({ currentStage: 'flashcard', spellInput: '', spellCorrect: null });
  },

  /* ========== 闪卡滑动处理 ========== */
  onSwipeResult(e) {
    var data = this.data;
    var quality = e.detail.quality;
    var sessionWords = data.sessionWords;
    var currentIndex = data.currentIndex;
    var completedSet = data.completedSet;
    var sessionStats = data.sessionStats;
    var currentWord = sessionWords[currentIndex];
    if (!currentWord) return;

    // 更新 SM-2 状态（增量更新，避免全量读写）
    var words = loadWords();
    var idx = words.findIndex(function (w) { return w.id === currentWord.id; });
    if (idx >= 0) {
      var result = updateWord(words[idx], { quality: quality });
      var advanced = advanceStage(Object.assign({}, words[idx]), quality >= 3);
      Object.assign(words[idx], result, {
        stage: advanced.stage,
        learnStep: advanced.learnStep
      });
      saveWords(words);
    }

    var newStats = Object.assign({}, sessionStats);
    newStats.studied++;

    if (quality >= 3) {
      // 成功掌握
      completedSet[currentWord.id] = true;
      newStats.mastered++;
      var masteredCount = (data.masteredCount || 0) + 1;
      var totalCount = sessionWords.length;

      if (currentIndex < totalCount - 1) {
        var nextIndex = currentIndex + 1;
        this.setData({
          completedSet: completedSet,
          masteredCount: masteredCount,
          progress: Math.round((masteredCount / totalCount) * 100),
          currentIndex: nextIndex,
          stageWord: sessionWords[nextIndex],
          sessionStats: newStats,
          currentStage: 'intro'
        });
      } else {
        this.setData({ progress: 100, sessionStats: newStats });
        this.finishSession(newStats);
      }
    } else {
      // 失败 → 移到队尾（最多3次重试）
      newStats.failed++;
      var updatedWords = sessionWords.slice();
      var failedWord = updatedWords.splice(currentIndex, 1)[0];
      failedWord._retries = (failedWord._retries || 0) + 1;
      updatedWords.push(failedWord);

      var allExhausted = true;
      for (var i = 0; i < updatedWords.length; i++) {
        if ((updatedWords[i]._retries || 0) <= 3) { allExhausted = false; break; }
      }

      if (allExhausted) {
        this.finishSession(newStats);
      } else {
        this.setData({
          sessionWords: updatedWords,
          sessionStats: newStats,
          currentStage: 'intro'
        });
        // currentIndex 保持0，因为失败词被移到队尾，下一个词(原currentIndex)现在是新词
      }
    }
  },

  /* ========== 完成会话 ========== */
  finishSession(stats) {
    var duration = Math.round((Date.now() - this.data.sessionStart) / 1000);
    var finalStats = Object.assign({}, stats, {
      studied: stats.mastered + stats.failed,
      duration: duration
    });
    var streak = getStreak();

    recordStudyLog({
      total: finalStats.studied,
      mastered: finalStats.mastered,
      failed: finalStats.failed,
      duration: duration
    });

    this.setData({
      isFinished: true,
      progress: 100,
      sessionStats: finalStats,
      streak: streak,
      currentStage: 'finished'
    });
  },

  onComplete() {
    wx.navigateBack({
      fail: function () { wx.switchTab({ url: '/pages/index/index' }); }
    });
  },

  onContinue() {
    this.setData({ isFinished: false, sessionStart: Date.now() });
    this.refreshSession();
  },

  /* ========== 分享 ========== */
  onShareAppMessage() {
    var stats = this.data.sessionStats;
    return {
      title: stats.studied > 0
        ? '我今天在忆闪学习了 ' + stats.studied + ' 个单词，掌握了 ' + stats.mastered + ' 个！'
        : '忆闪 YiShan - 科学背单词',
      path: '/pages/index/index'
    };
  },

  /* ========== 添加/导入单词 ========== */
  onAddWord() { this.setData({ showAddWord: true }); },
  onCloseAddWord() { this.setData({ showAddWord: false }); },

  onSaveWord(e) {
    var wordData = e.detail;
    var initState = getInitialWordState();
    var newWord = Object.assign({}, initState, wordData, {
      id: 'w_' + Date.now(),
      createdAt: Date.now()
    });
    var words = loadWords();
    words.push(newWord);
    saveWords(words);
    this.setData({ showAddWord: false });
    this.refreshSession();
    wx.showToast({ title: '单词已添加', icon: 'success' });
  },

  onImportCore() {
    var that = this;
    wx.showModal({
      title: '导入核心词包',
      content: '将导入 200+ 个词汇到词库中，重复词自动跳过',
      success: function (res) {
        if (res.confirm) {
          var vocab = require('../../data/vocabulary');
          var words = loadWords();
          var existingTerms = new Set(words.map(function (w) { return w.word; }));
          var added = 0;
          var initState = getInitialWordState();
          vocab.forEach(function (v) {
            if (!existingTerms.has(v.word)) {
              words.push(Object.assign({}, initState, v, {
                id: 'w_core_' + v.word,
                createdAt: Date.now()
              }));
              added++;
              existingTerms.add(v.word);
            }
          });
          saveWords(words);
          that.refreshSession();
          wx.showToast({ title: '导入了 ' + added + ' 个新词', icon: 'success' });
        }
      }
    });
  }
});