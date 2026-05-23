// 忆闪 - 增强添加单词组件
const { getInitialWordState } = require('../../utils/algorithm');

Component({
  properties: {},

  data: {
    word: '',
    definition: '',
    sounds_like: '',
    category: '',
    categoryOptions: ['', '核心词汇', '学术', '商务', '科技', '文学', '日常', '其他'],
    showCategoryPicker: false,
    isSubmitting: false
  },

  methods: {
    onInput(e) {
      const field = e.currentTarget.dataset.field;
      this.setData({ [field]: e.detail.value });
    },

    onSelectCategory(e) {
      const cat = e.currentTarget.dataset.cat;
      this.setData({ category: cat, showCategoryPicker: false });
    },

    onToggleCategory() {
      this.setData({ showCategoryPicker: !this.data.showCategoryPicker });
    },

    onSubmit() {
      const { word, definition } = this.data;
      if (!word.trim()) {
        wx.showToast({ title: '请输入单词', icon: 'none' });
        return;
      }
      if (!definition.trim()) {
        wx.showToast({ title: '请输入释义', icon: 'none' });
        return;
      }

      this.triggerEvent('save', {
        word: word.trim(),
        definition: definition.trim(),
        sounds_like: this.data.sounds_like.trim() || undefined,
        category: this.data.category || undefined
      });

      // 重置表单
      this.setData({
        word: '',
        definition: '',
        sounds_like: '',
        category: ''
      });
    },

    onDismiss() {
      this.triggerEvent('close');
    }
  }
});