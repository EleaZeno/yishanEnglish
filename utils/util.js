// 忆闪 YiShan - 通用工具函数（优化版）

/**
 * 生成 UUID v4（优先使用 crypto API）
 */
function generateUUID() {
  // WeChat 小程序环境也支持 crypto.randomUUID
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 回退方案
  var d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * 格式化时间戳为相对时间
 */
function formatTime(ts) {
  var date = new Date(ts);
  var now = new Date();
  var diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

  return (date.getMonth() + 1) + '月' + date.getDate() + '日';
}

/**
 * 根据稳定性获取阶段标签
 */
function getStabilityLabel(stability) {
  var s = stability || 0;
  if (s < 15) return { label: '新', cls: 'tag-slate' };
  if (s < 35) return { label: '学习中', cls: 'tag-warning' };
  if (s < 60) return { label: '巩固中', cls: 'tag-primary' };
  if (s < 85) return { label: '已掌握', cls: 'tag-success' };
  return { label: '精通', cls: 'tag-success' };
}

/**
 * 防抖函数
 */
function debounce(fn, delay) {
  var timer = null;
  return function () {
    var context = this;
    var args = arguments;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      fn.apply(context, args);
    }, delay || 300);
  };
}

/**
 * 节流函数
 */
function throttle(fn, interval) {
  var lastTime = 0;
  return function () {
    var now = Date.now();
    if (now - lastTime >= (interval || 300)) {
      lastTime = now;
      fn.apply(this, arguments);
    }
  };
}

module.exports = {
  generateUUID: generateUUID,
  formatTime: formatTime,
  getStabilityLabel: getStabilityLabel,
  debounce: debounce,
  throttle: throttle
};