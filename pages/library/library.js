// 忆闪 YiShan v3 - 词库管理（优化版）
const { loadWords, saveWords, deleteWord, searchWords, getStabilityBuckets } = require('../../utils/storage');
const app = getApp();

Page({
  data: {
    words: [],
    filteredWords: [],
    isLoading: true,
    searchQuery: '',
    sortBy: 'date',
    sortAsc: false,
    stats: { total: 0, mastered: 0, newCount: 0 },
    showEditWord: false,
    editingWord: null,
    editForm: { word: '', definition: '', sounds_like: '' },
    showBatchMode: false,
    selectedIds: {},
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
    this.refreshLibrary();
  },

  onPullDownRefresh() {
    this.refreshLibrary().then(function () { wx.stopPullDownRefresh(); });
  },

  refreshLibrary() {
    var that = this;
    var words = loadWords();
    var mastered = 0;
    var newCount = 0;
    for (var i = 0; i < words.length; i++) {
      if ((words[i].stability || 0) >= 60) mastered++;
      if (!words[i].lastSeen || (words[i].stability || 0) < 15) newCount++;
    }

    that.setData({
      words: words,
      stats: { total: words.length, mastered: mastered, newCount: newCount },
      isLoading: false
    });
    that.doSortAndSearch();
    return Promise.resolve();
  },

  /* ========== 搜索 ========== */
  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    var that = this;
    this._searchTimer = setTimeout(function () {
      that.doSortAndSearch();
    }, 300);
  },

  onClearSearch() {
    this.setData({ searchQuery: '' });
    this.doSortAndSearch();
  },

  doSortAndSearch() {
    var words = this.data.words.slice();
    var query = this.data.searchQuery.trim();

    // 搜索过滤
    if (query) {
      var q = query.toLowerCase();
      var filtered = [];
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (w.word.toLowerCase().indexOf(q) >= 0 ||
            (w.definition && w.definition.toLowerCase().indexOf(q) >= 0) ||
            (w.phonetic && w.phonetic.toLowerCase().indexOf(q) >= 0)) {
          filtered.push(w);
        }
      }
      words = filtered;
    }

    // 排序
    var sortBy = this.data.sortBy;
    var asc = this.data.sortAsc;
    words.sort(function (a, b) {
      var cmp = 0;
      if (sortBy === 'stability') {
        cmp = (a.stability || 0) - (b.stability || 0);
      } else if (sortBy === 'alphabet') {
        cmp = a.word.localeCompare(b.word);
      } else {
        var aTime = a.updatedAt || a.createdAt || 0;
        var bTime = b.updatedAt || b.createdAt || 0;
        cmp = bTime - aTime; // 默认降序（新的在前）
      }
      return asc ? -cmp : cmp;
    });

    // 预计算显示字段（避免 WXML 无法直接调用方法）
    var result = [];
    for (var j = 0; j < words.length; j++) {
      var w = words[j];
      result.push({
        id: w.id,
        word: w.word,
        definition: w.definition,
        phonetic: w.phonetic || '',
        stability: w.stability || 0,
        stage: w.stage || 'new',
        _displayDate: formatDate(w.updatedAt || w.createdAt),
        _stabilityTag: getStabilityTagText(w.stability || 0)
      });
    }

    this.setData({ filteredWords: result });
  },

  /* ========== 排序 ========== */
  onToggleSort() {
    var that = this;
    wx.showActionSheet({
      itemList: ['时间', '稳定性', '字母'],
      success: function (res) {
        var options = ['date', 'stability', 'alphabet'];
        var next = options[res.tapIndex];
        var toggle = next === that.data.sortBy ? !that.data.sortAsc : false;
        that.setData({ sortBy: next, sortAsc: toggle });
        that.doSortAndSearch();
      }
    });
  },

  /* ========== 列表交互 ========== */
  onWordTap(e) {
    var wordId = e.currentTarget.dataset.id;
    var words = this.data.words;
    var word = null;
    for (var i = 0; i < words.length; i++) {
      if (words[i].id === wordId) { word = words[i]; break; }
    }
    if (!word) return;

    this.setData({
      showEditWord: true,
      editingWord: { id: word.id, word: word.word, definition: word.definition, sounds_like: word.sounds_like || '' },
      editForm: { word: word.word, definition: word.definition || '', sounds_like: word.sounds_like || '' }
    });
  },

  onEditField(e) {
    var field = e.currentTarget.dataset.field;
    var obj = {};
    obj['editForm.' + field] = e.detail.value;
    this.setData(obj);
  },

  onSaveEdit() {
    var editForm = this.data.editForm;
    if (!editForm.word.trim() || !editForm.definition.trim()) {
      wx.showToast({ title: '单词和释义不能为空', icon: 'none' });
      return;
    }
    var words = loadWords();
    var idx = -1;
    for (var i = 0; i < words.length; i++) {
      if (words[i].id === this.data.editingWord.id) { idx = i; break; }
    }
    if (idx >= 0) {
      Object.assign(words[idx], {
        word: editForm.word.trim(),
        definition: editForm.definition.trim(),
        sounds_like: editForm.sounds_like.trim() || undefined,
        updatedAt: Date.now()
      });
      saveWords(words);
    }
    this.setData({ showEditWord: false, editingWord: null });
    this.refreshLibrary();
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  onDeleteWord() {
    var that = this;
    var word = this.data.editingWord;
    wx.showModal({
      title: '确认删除',
      content: '删除 "' + word.word + '" 及所有学习记录？',
      confirmColor: '#f43f5e',
      success: function (res) {
        if (res.confirm) {
          var words = loadWords();
          deleteWord(words, word.id);
          that.setData({ showEditWord: false, editingWord: null });
          that.refreshLibrary();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  onCloseEdit() {
    this.setData({ showEditWord: false, editingWord: null });
  },

  /* ========== 稳定性标签（预计算用）========== */
  setTheme(isDark) {
    this.setData({ isDarkMode: isDark });
  }
});

/* ========== 工具函数（模块级，不参与页面 this）========== */

function formatDate(ts) {
  if (!ts) return '待学习';
  var d = new Date(ts);
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + '/' + (m < 10 ? '0' + m : m) + '/' + (day < 10 ? '0' + day : day);
}

function getStabilityTagText(s) {
  if (!s || s < 15) return { cls: 'tag-slate', text: '新' };
  if (s < 35) return { cls: 'tag-warning', text: '学习中' };
  if (s < 60) return { cls: 'tag-primary', text: '巩固中' };
  if (s < 85) return { cls: 'tag-success', text: '已掌握' };
  return { cls: 'tag-success', text: '精通 ✓' };
}
