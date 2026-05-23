// 忆闪 YiShan - SM-2 间隔重复算法 + 优先级排序 + 多阶段学习
// 基于 SuperMemo SM-2，增强版：最大间隔上限、负荷预测、复习优先级

/* ==================== 常量 ==================== */

var MAX_INTERVAL = 180;       // 最长复习间隔（天）
var MIN_EASINESS = 1.3;      // 最小难易度
var DEFAULT_EASINESS = 2.5;  // 默认难易度
var MILLIS_PER_DAY = 86400000;

/* ==================== 工具函数 ==================== */

function elapsedDays(lastSeen) {
  if (!lastSeen) return Infinity;
  return Math.max(0, (Date.now() - lastSeen) / MILLIS_PER_DAY);
}

/* ==================== 初始状态 ==================== */

function getInitialWordState() {
  return {
    id: '',
    word: '',
    definition: '',
    sounds_like: '',
    category: '',
    tags: [],
    phonetic: '',
    examples: [],
    partOfSpeech: '',
    difficulty: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),

    // SM-2 状态
    repetition: 0,
    interval: 1,
    easiness: DEFAULT_EASINESS,
    lastSeen: null,
    nextReview: null,
    stability: 0,
    retrievability: 100,
    quality: 0,
    failures: 0,

    // 多阶段学习
    stage: 'new',     // new | learning | reviewing | mastered
    learnStep: 0
  };
}

/* ==================== SM-2 核心 ==================== */

function sm2Update(word, metrics) {
  var q = metrics.quality || 0;
  var now = Date.now();
  var easiness = word.easiness || DEFAULT_EASINESS;
  var stability = word.stability || 0;
  var failures = word.failures || 0;
  var repetition = word.repetition || 0;
  var interval = word.interval || 1;
  var stage = word.stage || 'learning';

  // 失败处理 (q < 3)
  if (q < 3) {
    var stabilityDrop = q === 0 ? 25 : (q === 1 ? 15 : 8);
    return {
      repetition: 0,
      interval: 1,
      easiness: Math.max(MIN_EASINESS, easiness - 0.2),
      lastSeen: now,
      nextReview: now + 600000,  // 10分钟后重试
      stability: Math.max(0, stability - stabilityDrop),
      retrievability: computeRetrievability({ lastSeen: now, interval: 1, easiness: Math.max(MIN_EASINESS, easiness - 0.2) }),
      quality: q,
      failures: failures + 1,
      stage: 'learning',
      updatedAt: now
    };
  }

  // 成功处理 (q >= 3)
  var newInterval;
  if (repetition === 0) {
    newInterval = 1;
  } else if (repetition === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.round(interval * easiness);
  }

  // 上限
  newInterval = Math.min(newInterval, MAX_INTERVAL);

  // EF 调整
  var newEasiness = Math.max(MIN_EASINESS,
    easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  );

  // 稳定性提升
  var boost = 5 + q * 3;
  var newStability = Math.min(100, stability + boost);

  // 阶段判断
  var newStage = stage;
  if (newStability >= 75 && repetition >= 2) {
    newStage = 'mastered';
  } else if (repetition >= 0) {
    newStage = 'reviewing';
  }

  return {
    repetition: repetition + 1,
    interval: newInterval,
    easiness: newEasiness,
    lastSeen: now,
    nextReview: now + newInterval * MILLIS_PER_DAY,
    stability: newStability,
    retrievability: 100,
    quality: q,
    failures: failures,
    stage: newStage,
    updatedAt: now
  };
}

/* ==================== 遗忘曲线 ==================== */

function computeRetrievability(word) {
  var lastSeen = word.lastSeen;
  if (!lastSeen) return 100;
  var interval = word.interval || 1;
  var easiness = word.easiness || DEFAULT_EASINESS;
  var elapsed = (Date.now() - lastSeen) / MILLIS_PER_DAY;
  if (elapsed <= 0) return 100;
  return Math.round(Math.exp(-(elapsed / interval) * (1 / easiness)) * 100);
}

function predictRecallProbability(word, targetTime) {
  var lastSeen = word.lastSeen;
  var interval = word.interval;
  if (!lastSeen || !interval) return 0.5;
  var elapsed = (targetTime - lastSeen) / MILLIS_PER_DAY;
  if (elapsed <= 0) return 1.0;
  return Math.exp(-(elapsed / interval) * (1 / (word.easiness || DEFAULT_EASINESS)));
}

/* ==================== 批量预测 ==================== */

/**
 * 预测未来 N 天的平均留存率
 * 优化：预计算每个词的基础参数，避免重复计算
 */
function predictRetentionCurve(words, daysList) {
  if (!words.length) return [];
  var intervals = daysList || [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90];
  var now = Date.now();
  var results = [];

  // 预计算每个词的衰减系数，避免在 inner loop 重复计算
  var precomputed = [];
  for (var wi = 0; wi < words.length; wi++) {
    var w = words[wi];
    if (!w.lastSeen || !w.interval) {
      precomputed.push({ seen: false });
    } else {
      var ease = w.easiness || DEFAULT_EASINESS;
      var decayRate = 1 / (w.interval * ease);
      precomputed.push({ seen: true, lastSeen: w.lastSeen, decayRate: decayRate });
    }
  }

  for (var di = 0; di < intervals.length; di++) {
    var days = intervals[di];
    var future = now + days * MILLIS_PER_DAY;
    var sum = 0;

    for (var pi = 0; pi < precomputed.length; pi++) {
      var p = precomputed[pi];
      if (!p.seen) {
        sum += 0.5;
      } else {
        var elapsed = (future - p.lastSeen) / MILLIS_PER_DAY;
        sum += elapsed <= 0 ? 1.0 : Math.exp(-elapsed * p.decayRate);
      }
    }

    results.push({
      days: days,
      label: days + '天后',
      retention: Math.round((sum / words.length) * 100)
    });
  }

  return results;
}

/**
 * 预测未来 N 天每日复习负荷
 * 优化：同上，预计算衰减系数
 */
function predictDailyLoad(words, days) {
  if (!words.length) return [];
  days = days || 30;
  var now = Date.now();
  var results = [];

  var precomputed = [];
  for (var wi = 0; wi < words.length; wi++) {
    var w = words[wi];
    if (!w.lastSeen || !w.interval) {
      precomputed.push({ belowThreshold: true });
    } else {
      var ease = w.easiness || DEFAULT_EASINESS;
      var decayRate = 1 / (w.interval * ease);
      precomputed.push({ belowThreshold: false, lastSeen: w.lastSeen, decayRate: decayRate });
    }
  }

  for (var i = 1; i <= days; i++) {
    var future = now + i * MILLIS_PER_DAY;
    var load = 0;

    for (var pi = 0; pi < precomputed.length; pi++) {
      var p = precomputed[pi];
      if (p.belowThreshold) {
        load++;
      } else {
        var elapsed = (future - p.lastSeen) / MILLIS_PER_DAY;
        var recall = elapsed <= 0 ? 1.0 : Math.exp(-elapsed * p.decayRate);
        if (recall < 0.80) load++;
      }
    }

    results.push({ day: i, load: load });
  }

  return results;
}

/**
 * 获取学习建议
 */
function getStudyAdvice(words) {
  if (!words.length) {
    return { level: 'new', message: '词库为空，开始添加第一个单词吧！' };
  }

  var now = Date.now();
  var due = 0;
  var mastered = 0;

  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (!w.lastSeen || !w.nextReview || w.nextReview <= now) {
      due++;
    }
    if ((w.stability || 0) >= 75) {
      mastered++;
    }
  }

  var pct = Math.round((mastered / words.length) * 100);

  if (due === 0 && pct >= 80) {
    return { level: 'excellent', message: '所有单词记忆稳定，考虑添加新词扩展词库' };
  }
  if (due === 0) {
    return { level: 'good', message: '暂无到期复习，但仍有提升空间' };
  }
  if (due > 50) {
    return { level: 'urgent', message: '有 ' + due + ' 个单词需要复习，建议分批完成' };
  }
  if (due > 20) {
    return { level: 'needs_review', message: '有 ' + due + ' 个单词待复习，今天来一轮吧' };
  }
  return { level: 'normal', message: '有 ' + due + ' 个单词待复习，加油！' };
}

/**
 * 更新单词状态（SM-2 + 遗忘曲线）
 */
function updateWord(word, metrics) {
  var result = sm2Update(word, metrics);
  result.retrievability = computeRetrievability(result);
  return result;
}

/* ==================== 复习优先级排序 ==================== */

/**
 * 获取排序后的待复习单词列表
 * 优先级权重：可提取性 50% + 稳定性 30% + 逾期天数 20%
 */
function getSortedDueWords(words, limit) {
  if (!words.length) return [];
  var now = Date.now();
  var scored = [];

  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    // 筛选到期单词
    if (w.lastSeen && w.nextReview && w.nextReview > now) continue;

    var retrievability = computeRetrievability(w);
    var stability = w.stability || 0;
    var overdueDays = w.nextReview ? Math.max(0, (now - w.nextReview) / MILLIS_PER_DAY) : 0;

    // 优先级分数（越低越优先）
    var score = retrievability * 0.5 + stability * 0.3 + Math.min(overdueDays, 30) * 3.3;
    scored.push({ word: w, score: score });
  }

  // 按分数升序（分数低 = 更紧急）
  scored.sort(function (a, b) { return a.score - b.score; });

  var result = [];
  for (var j = 0; j < scored.length; j++) {
    result.push(scored[j].word);
  }

  if (limit && limit > 0 && result.length > limit) {
    result = result.slice(0, limit);
  }

  return result;
}

/* ==================== 多阶段学习 ==================== */

function getNextStage(word) {
  var stage = word.stage || 'new';
  var step = word.learnStep || 0;

  switch (stage) {
    case 'new':
      return { stage: 'learning', step: 0, action: 'introduce' };
    case 'learning':
      if (step < 2) {
        var actions = ['spell', 'flashcard'];
        return { stage: 'learning', step: step + 1, action: actions[step] || 'flashcard' };
      }
      return { stage: 'reviewing', step: 0, action: 'flashcard' };
    case 'reviewing':
      if ((word.stability || 0) >= 75) {
        return { stage: 'mastered', step: 0, action: 'complete' };
      }
      return { stage: 'reviewing', step: step + 1, action: 'flashcard' };
    case 'mastered':
      return { stage: 'mastered', step: step, action: 'maintain' };
    default:
      return { stage: 'new', step: 0, action: 'introduce' };
  }
}

function advanceStage(word, success) {
  if (!success) {
    return Object.assign({}, word, {
      stage: 'learning',
      learnStep: 0,
      updatedAt: Date.now()
    });
  }

  var next = getNextStage(word);
  return Object.assign({}, word, {
    stage: next.stage,
    learnStep: next.step,
    updatedAt: Date.now()
  });
}

module.exports = {
  MAX_INTERVAL: MAX_INTERVAL,
  MIN_EASINESS: MIN_EASINESS,
  DEFAULT_EASINESS: DEFAULT_EASINESS,
  getInitialWordState: getInitialWordState,
  sm2Update: sm2Update,
  computeRetrievability: computeRetrievability,
  predictRecallProbability: predictRecallProbability,
  predictRetentionCurve: predictRetentionCurve,
  predictDailyLoad: predictDailyLoad,
  getStudyAdvice: getStudyAdvice,
  updateWord: updateWord,
  getSortedDueWords: getSortedDueWords,
  getNextStage: getNextStage,
  advanceStage: advanceStage
};