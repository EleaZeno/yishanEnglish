// 忆闪 YiShan - 音频播放器（优化版）
// 使用 wx.createInnerAudioContext，避免全局 player 泄漏

var _player = null;

/**
 * 停止并销毁当前播放器
 */
function stopAudio() {
  if (_player) {
    try {
      _player.stop();
      _player.destroy();
    } catch (e) { /* 忽略销毁错误 */ }
    _player = null;
  }
}

/**
 * 播放音频 URL
 * @param {string} url
 * @param {object} opts - { volume: 0-1, loop: boolean }
 */
function playAudio(url, opts) {
  opts = opts || {};
  stopAudio();

  _player = wx.createInnerAudioContext();
  _player.src = url;
  _player.volume = opts.volume != null ? opts.volume : 1;
  _player.loop = opts.loop || false;

  _player.onCanplay(function () {
    _player.play();
  });

  _player.onError(function (err) {
    console.error('[sound] 音频播放失败:', err);
    stopAudio();
  });

  return _player;
}

/**
 * 播放单词发音（有道 TTS）
 * @param {string} word
 * @param {string} lang - 'en' 或 'en-GB'
 */
function speakWord(word, lang) {
  lang = lang || 'en-GB';

  // 有道词典 TTS API
  var type = lang === 'en-GB' ? 1 : 0;
  var url = 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=' + type;

  stopAudio();

  var audio = wx.createInnerAudioContext();
  audio.src = url;
  audio.autoplay = false;

  audio.onCanplay(function () {
    audio.play();
  });

  audio.onError(function (err) {
    console.error('[sound] 发音加载失败:', err);
    audio.destroy();
  });

  audio.onEnded(function () {
    audio.destroy();
  });

  return audio;
}

/**
 * 获取 TTS URL（不播放）
 */
function getTTSUrl(word, lang) {
  var type = (lang === 'en-GB') ? 1 : 0;
  return 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word) + '&type=' + type;
}

module.exports = {
  playAudio: playAudio,
  stopAudio: stopAudio,
  speakWord: speakWord,
  getTTSUrl: getTTSUrl
};