// 忆闪 YiShan - 登录/注册（邮箱 + 微信双通道）
var api = require('../../utils/api');
var app = getApp();

Page({
  data: {
    isLoading: false,
    showRegister: false,
    email: '',
    password: '',
    confirm: '',
    errorMessage: '',
    hasWeChat: false
  },

  onLoad: function () {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      hasWeChat: !!(wx && wx.login)
    });
  },

  onInput: function (e) {
    var field = e.currentTarget.dataset.field;
    var obj = {};
    obj[field] = e.detail.value;
    obj.errorMessage = '';
    this.setData(obj);
  },

  onToggleMode: function () {
    this.setData({
      showRegister: !this.data.showRegister,
      errorMessage: '',
      password: '',
      confirm: ''
    });
  },

  onLogin: function () {
    var that = this;
    var email = this.data.email.trim();
    var password = this.data.password;

    if (!email || !password) {
      this.setData({ errorMessage: '请输入邮箱和密码' });
      return;
    }

    this.setData({ isLoading: true, errorMessage: '' });

    api.login(email, password)
      .then(function (result) {
        api.saveSession(result.user, result.token);
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(function () { wx.switchTab({ url: '/pages/index/index' }); }, 800);
      })
      .catch(function (err) {
        that.setData({ errorMessage: err.message || '登录失败' });
      })
      .finally(function () { that.setData({ isLoading: false }); });
  },

  onRegister: function () {
    var that = this;
    var email = this.data.email.trim();
    var password = this.data.password;
    var confirm = this.data.confirm;

    if (!email || !password || !confirm) {
      this.setData({ errorMessage: '请填写所有字段' });
      return;
    }
    if (password !== confirm) {
      this.setData({ errorMessage: '两次密码不一致' });
      return;
    }
    if (password.length < 6) {
      this.setData({ errorMessage: '密码至少6位' });
      return;
    }

    this.setData({ isLoading: true, errorMessage: '' });

    api.register(email, password)
      .then(function (result) {
        api.saveSession(result.user, result.token);
        wx.showToast({ title: '注册成功' });
        setTimeout(function () { wx.switchTab({ url: '/pages/index/index' }); }, 800);
      })
      .catch(function (err) {
        that.setData({ errorMessage: err.message || '注册失败' });
      })
      .finally(function () { that.setData({ isLoading: false }); });
  },

  onGuest: function () {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onWeChatLogin: function () {
    var that = this;
    this.setData({ isLoading: true, errorMessage: '' });

    wx.login({
      success: function (res) {
        if (res.code) {
          api.wxLogin(res.code)
            .then(function (result) {
              api.saveSession(result.user, result.token);
              wx.showToast({ title: '登录成功', icon: 'success' });
              setTimeout(function () { wx.switchTab({ url: '/pages/index/index' }); }, 800);
            })
            .catch(function (err) {
              that.setData({ errorMessage: err.message || '微信登录失败' });
            })
            .finally(function () { that.setData({ isLoading: false }); });
        } else {
          that.setData({ errorMessage: '获取登录凭证失败', isLoading: false });
        }
      },
      fail: function () {
        that.setData({ errorMessage: '微信登录调用失败', isLoading: false });
      }
    });
  }
});