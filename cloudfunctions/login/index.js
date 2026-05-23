// 忆闪 YiShan - 微信登录云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, error: '无法获取用户身份' }
  }

  try {
    // 查找用户
    const { data } = await db.collection('users').where({ _openid: openid }).get()

    if (data.length > 0) {
      return { code: 0, isNew: false, user: data[0] }
    }

    // 新用户：创建默认档案
    const newUser = {
      nickName: '忆闪学习者',
      avatarUrl: '',
      createdAt: db.serverDate(),
      stats: {
        totalWords: 0,
        totalStudyDays: 0,
        streak: 0,
        totalSessions: 0
      }
    }

    const result = await db.collection('users').add({ data: newUser })
    return {
      code: 0,
      isNew: true,
      user: { ...newUser, _id: result._id, _openid: openid }
    }
  } catch (e) {
    return { code: -1, error: e.message }
  }
}
