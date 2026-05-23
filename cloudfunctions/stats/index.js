// 忆闪 YiShan - 统计数据云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    switch (action) {

      // ========== 记录单次学习会话 ==========
      case 'record': {
        await db.collection('study_logs').add({
          data: {
            date: db.serverDate(),
            wordsStudied: data.wordsStudied || 0,
            mastered: data.mastered || 0,
            failed: data.failed || 0,
            duration: data.duration || 0,
            avgQuality: data.avgQuality || 3
          }
        })
        return { code: 0 }
      }

      // ========== 获取本周学习记录 ==========
      case 'getWeek': {
        const now = Date.now()
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000
        const { data: logs } = await db.collection('study_logs')
          .where('date > ' + weekAgo)
          .orderBy('date', 'asc')
          .get()

        const dayMap = {}
        const dayLabels = ['日', '一', '二', '三', '四', '五', '六']
        for (const log of logs) {
          const d = new Date(log.date)
          const key = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
            .map(n => String(n).padStart(2, '0')).join('-')
          dayMap[key] = (dayMap[key] || 0) + log.wordsStudied
        }

        const result = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const key = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
            .map(n => String(n).padStart(2, '0')).join('-')
          result.push({ day: dayLabels[d.getDay()], count: dayMap[key] || 0, date: key })
        }
        return { code: 0, data: result }
      }

      // ========== 获取连续天数 ==========
      case 'getStreak': {
        const { data: logs } = await db.collection('study_logs')
          .orderBy('date', 'desc')
          .limit(365)
          .get()

        const daySet = new Set()
        for (const log of logs) {
          if (log.wordsStudied > 0) {
            const d = new Date(log.date)
            const key = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
              .map(n => String(n).padStart(2, '0')).join('-')
            daySet.add(key)
          }
        }

        let streak = 0
        const d = new Date()
        for (let i = 0; i < 366; i++) {
          const key = [d.getFullYear(), d.getMonth() + 1, d.getDate()]
            .map(n => String(n).padStart(2, '0')).join('-')
          if (daySet.has(key)) {
            streak++
            d.setDate(d.getDate() - 1)
          } else if (i === 0) {
            d.setDate(d.getDate() - 1)
            continue
          } else {
            break
          }
        }
        return { code: 0, streak }
      }

      default:
        return { code: -1, error: 'Unknown action' }
    }
  } catch (e) {
    return { code: -1, error: e.message }
  }
}