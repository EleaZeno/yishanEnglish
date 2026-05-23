// 忆闪 YiShan - 应用配置（唯一定义源）
module.exports = {
  APP_NAME: '忆闪 YiShan',

  // ★ Cloudflare Worker API 地址
  API_HOST: 'https://yishan-api.workers.dev',

  // 存储 Key（与 utils/storage.js 一致）
  STORAGE_KEYS: {
    WORDS: 'yishan_words',
    LOGS: 'yishan_study_log',
    SETTINGS: 'yishan_settings',
    GUIDE: 'yishan_guide_done',
  },

  // 认证相关
  AUTH_KEYS: {
    USER: 'yishan_current_user',
    TOKEN: 'yishan_token',
  },

  // 支付（待实现）
  PRO_PRICE: 1990,        // 分 (19.9 元)
  PRO_PRICE_TEXT: '¥19.9',

  // 算法常量
  MAX_INTERVAL: 180,
  MIN_EASINESS: 1.3,
  DEFAULT_EASINESS: 2.5,
};