Component({
  properties: {
    word: { type: Object, value: null },
    disabled: { type: Boolean, value: false },
    // ★ 多阶段模式
    multiStage: { type: Boolean, value: false }
  },

  data: {
    isFlipped: false,
    showQuality: false,
    // 视觉属性
    _dx: 0,
    _rotation: 0,
    _indicatorOpacity: 0,
    _indicatorSide: '',
    _transition: 'none',
    _opacity: 1,
    // 多阶段状态
    _stageAction: '',  // '', 'spell', 'flashcard', 'complete'
  },

  observers: {
    'word': function (word) {
      if (word && this.data.multiStage) {
        const { getNextStage } = require('../../utils/algorithm');
        const next = getNextStage(word);
        this.setData({ _stageAction: next.action });
      }
    }
  },

  onTouchStart(e) {
    if (this.data.disabled) return;
    const touch = e.touches[0];
    this._startX = touch.clientX;
    this._startY = touch.clientY;
    this._dx = 0;
    this._lastFrame = 0;
    if (this.data._transition !== 'none') {
      this.setData({ _transition: 'none' });
    }
  },

  onTouchMove(e) {
    if (this.data.disabled) return;
    const now = Date.now();
    if (now - this._lastFrame < 16) return;
    this._lastFrame = now;
    const dx = e.touches[0].clientX - this._startX;
    this._dx = dx;
    this.setData({
      _dx: dx,
      _rotation: dx * 0.05,
      _indicatorOpacity: Math.min(Math.abs(dx) / 80, 1),
      _indicatorSide: dx > 0 ? 'right' : 'left'
    });
  },

  onTouchEnd() {
    if (this.data.disabled) return;
    const dx = this._dx;
    this._dx = 0;
    if (Math.abs(dx) < 50) {
      this.setData({
        _dx: 0, _rotation: 0, _indicatorOpacity: 0,
        _transition: 'transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      });
      return;
    }
    const direction = dx > 0 ? 'right' : 'left';
    const flyX = direction === 'right' ? 900 : -900;
    try { wx.vibrateShort({ type: 'medium' }); } catch (e) {}
    this.setData({
      _dx: flyX, _rotation: flyX * 0.03, _indicatorOpacity: 0,
      _transition: 'transform 0.35s ease-out, opacity 0.35s ease-out',
      _opacity: 0
    });
    setTimeout(() => {
      if (direction === 'left') {
        // 左滑 = 掌握 → 质量评分
        this.setData({ showQuality: true });
      } else {
        // 右滑 = 复习
        this.triggerEvent('result', { direction: 'right', quality: 1 });
        this._resetSoon();
      }
    }, 360);
  },

  onFlip() {
    if (this.data.showQuality) return;
    this.setData({ isFlipped: !this.data.isFlipped });
    try { wx.vibrateShort({ type: 'light' }); } catch (e) {}
  },

  // ★ 朗读单词
  onSpeak() {
    if (!this.data.word || !this.data.word.word) return;
    try {
      const { speakWord } = require('../../utils/sound');
      speakWord(this.data.word.word);
    } catch (e) {
      console.warn('发音加载失败:', e);
    }
  },

  onSelectQuality(e) {
    const quality = parseInt(e.currentTarget.dataset.level) || 3;
    try { wx.vibrateShort({ type: 'light' }); } catch (e) {}
    this.triggerEvent('result', {
      direction: 'left',
      quality,
      stage: this.data._stageAction
    });
    this.setData({ showQuality: false });
    this._resetSoon();
  },

  onSkipQuality() {
    this.triggerEvent('result', { direction: 'left', quality: 3 });
    this.setData({ showQuality: false });
    this._resetSoon();
  },

  // ★ 多阶段：拼写检查
  onSpellSubmit(e) {
    const input = (e.detail.value || '').trim().toLowerCase();
    const target = (this.data.word.word || '').trim().toLowerCase();
    const correct = input === target;
    this.triggerEvent('spellResult', { correct, input });
  },

  _resetSoon() {
    setTimeout(() => { this.reset(); }, 120);
  },

  reset() {
    this.setData({
      isFlipped: false,
      showQuality: false,
      _dx: 0, _rotation: 0, _indicatorOpacity: 0,
      _indicatorSide: '', _transition: 'none', _opacity: 1
    });
  }
});
