// 忆闪 YiShan - 新手引导页
const app = getApp();

Page({
  data: {
    steps: ['欢迎', '学习法', 'SM-2', '开始'],
    currentStep: 0
  },

  onNext() {
    if (this.data.currentStep < 3) {
      this.setData({ currentStep: this.data.currentStep + 1 });
    }
  },

  onPrev() {
    if (this.data.currentStep > 0) {
      this.setData({ currentStep: this.data.currentStep - 1 });
    }
  },

  onFinish() {
    app.completeGuide();
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/index/index' })
    });
  },

  onShareAppMessage() {
    return {
      title: '忆闪 YiShan - SM-2 自适应闪卡学习',
      path: '/pages/index/index'
    };
  }
});