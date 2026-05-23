const app = getApp();

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
