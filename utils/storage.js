// 忆闪 YiShan - 存储层：缓存 + 查询 + CRUD
// 说明：云同步功能已迁移至 utils/api.js，此处不再保留 cloud-db 相关死代码
// 所有云同步通过 Cloudflare Worker 完成（api.syncWords / api.fetchWords）

const STORAGE_KEY = 'yishan_words';
const HISTORY_KEY = 'yishan_study_log';
const LOG_KEY = 'yishan_study_log';   // 与 HISTORY_KEY 统一，保留两个引用避免遗漏
const SETTINGS_KEY = 'yishan_settings';
const GUIDE_KEY = 'yishan_guide_done';

const { getInitialWordState, getSortedDueWords: algoSort } = require('./algorithm');

// 内存缓存
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 3000; // 3 秒有效期（页面切换时允许短暂复用）

/* ==================== 单词 CRUD ==================== */

function loadWords(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && _cache && (now - _cacheTime) < CACHE_TTL) {
    return _cache;
  }
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    _cache = raw ? JSON.parse(raw) : [];
    _cacheTime = now;
    return _cache;
  } catch (e) {
    console.error('[storage] loadWords error:', e);
    return [];
  }
}

function invalidateCache() {
  _cache = null;
  _cacheTime = 0;
}

function saveWords(words) {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(words));
    _cache = words;
    _cacheTime = Date.now();
  } catch (e) {
    console.error('[storage] saveWords error:', e);
    wx.showToast({ title: '存储空间不足', icon: 'none' });
  }
}

function deleteWord(words, id) {
  const idx = words.findIndex(w => w.id === id);
  if (idx < 0) return false;
  words.splice(idx, 1);
  saveWords(words);
  return true;
}

function searchWords(words, query) {
  const q = query.toLowerCase();
  return words.filter(w =>
    w.word.toLowerCase().includes(q) ||
    (w.definition && w.definition.toLowerCase().includes(q)) ||
    (w.phonetic && w.phonetic.toLowerCase().includes(q))
  );
}

function filterByCategory(words, category) {
  if (!category) return words;
  return words.filter(w => w.category === category);
}

function filterByTag(words, tag) {
  if (!tag) return words;
  return words.filter(w => (w.tags || []).includes(tag));
}

function getCategoryStats(words) {
  const map = {};
  for (const w of words) {
    const cat = w.category || '未分类';
    map[cat] = (map[cat] || 0) + 1;
  }
  return Object.entries(map).map(([category, count]) => ({ category, count }));
}

function getDueWords(words) {
  const now = Date.now();
  return words.filter(w => {
    if (!w.lastSeen) return true;
    if (!w.nextReview) return true;
    return w.nextReview <= now;
  });
}

function getSortedDueWords(words, limit) {
  return algoSort(words, limit);
}

function getStats(words) {
  const total = words.length;
  const mastered = words.filter(w => (w.stability || 0) >= 60).length;
  const due = getDueWords(words).length;
  const newCount = words.filter(w => !w.lastSeen || (w.stability || 0) < 15).length;
  return { total, mastered, due, newCount };
}

function getStabilityBuckets(words) {
  if (!words.length) return [];
  const buckets = [
    { label: '新信号(0-14)', min: 0, max: 14, count: 0 },
    { label: '学习中(15-34)', min: 15, max: 34, count: 0 },
    { label: '接触(35-54)', min: 35, max: 54, count: 0 },
    { label: '巩固(55-74)', min: 55, max: 74, count: 0 },
    { label: '掌握(75-89)', min: 75, max: 89, count: 0 },
    { label: '精通(90-100)', min: 90, max: 100, count: 0 },
  ];
  for (const w of words) {
    const s = w.stability || 0;
    for (const b of buckets) {
      if (s >= b.min && s <= b.max) { b.count++; break; }
    }
  }
  return buckets.filter(b => b.count > 0).map(b => ({
    ...b, pct: Math.round(b.count / words.length * 100)
  }));
}

/* ==================== 学习记录 ==================== */

function recordStudyLog(sessionLog) {
  const logs = getStudyLogs();
  logs.push({
    date: Date.now(),
    wordsStudied: sessionLog.total || 0,
    mastered: sessionLog.mastered || 0,
    failed: sessionLog.failed || 0,
    sessionDuration: sessionLog.duration || 0
  });
  const trimmed = logs.slice(-100);
  wx.setStorageSync(LOG_KEY, JSON.stringify(trimmed));
  // 同时更新 HISTORY_KEY，保持兼容
  wx.setStorageSync(HISTORY_KEY, JSON.stringify(trimmed));
}

function getStudyLogs() {
  try {
    const raw = wx.getStorageSync(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function getTodayStats() {
  const logs = getStudyLogs();
  const today = new Date();
  const todayStr = formatDateKey(today);

  let studied = 0, mastered = 0, duration = 0;
  for (const log of logs) {
    const d = new Date(log.date);
    const logStr = formatDateKey(d);
    if (logStr === todayStr) {
      studied += log.wordsStudied || 0;
      mastered += log.mastered || 0;
      duration += log.sessionDuration || 0;
    }
  }
  return { studied, mastered, duration };
}

function getStreak() {
  const logs = getStudyLogs();
  if (!logs.length) return 0;

  const daySet = new Set();
  for (const log of logs) {
    const d = new Date(log.date);
    daySet.add(formatDateKey(d));
  }

  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 366; i++) {
    const key = formatDateKey(d);
    if (daySet.has(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (i === 0) {
      d.setDate(d.getDate() - 1);
      continue;
    } else {
      break;
    }
  }
  return streak;
}

function getWeekStats() {
  const logs = getStudyLogs();
  const now = new Date();
  const results = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateKey(d);
    const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
    let count = 0;
    for (const log of logs) {
      const logDate = new Date(log.date);
      if (formatDateKey(logDate) === dateStr) count += log.wordsStudied || 0;
    }
    results.push({ day: dayLabels[d.getDay()], count, date: dateStr });
  }
  return results;
}

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/* ==================== 导入导出 ==================== */

function importWordsJSON(jsonStr) {
  try {
    const imported = JSON.parse(jsonStr);
    if (!Array.isArray(imported)) {
      return { success: false, error: '数据格式错误：需要 JSON 数组' };
    }
    const words = loadWords(true);
    const existingSet = new Set(words.map(w => w.word.toLowerCase()));
    let added = 0;
    const initState = getInitialWordState();

    for (const item of imported) {
      if (!item.word) continue;
      if (existingSet.has(item.word.toLowerCase())) continue;
      words.push(Object.assign({}, initState, item, {
        id: 'w_import_' + item.word + '_' + Date.now(),
        createdAt: Date.now()
      }));
      existingSet.add(item.word.toLowerCase());
      added++;
    }

    saveWords(words);
    return { success: true, added, total: imported.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function exportWordsJSON() {
  const words = loadWords(true);
  return JSON.stringify(words, null, 2);
}

/* ==================== 新手引导 ==================== */

function isGuideDone() {
  return wx.getStorageSync(GUIDE_KEY) || false;
}

function markGuideDone() {
  wx.setStorageSync(GUIDE_KEY, true);
}

function resetGuide() {
  wx.removeStorageSync(GUIDE_KEY);
}

module.exports = {
  loadWords, saveWords, deleteWord,
  searchWords, filterByCategory, filterByTag,
  getCategoryStats, getDueWords, getSortedDueWords,
  getStats, getStabilityBuckets,
  recordStudyLog, getStudyLogs,
  getTodayStats, getStreak, getWeekStats,
  importWordsJSON, exportWordsJSON,
  isGuideDone, markGuideDone, resetGuide,
  invalidateCache
};
