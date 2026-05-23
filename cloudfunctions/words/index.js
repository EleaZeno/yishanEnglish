// 忆闪 YiShan - 单词 CRUD 云函数
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_LIMIT = 100

exports.main = async (event, context) => {
  const { action, data } = event
  const wordsCol = db.collection('words')

  try {
    switch (action) {

      // ========== 查询全部 ==========
      case 'list': {
        const countResult = await wordsCol.count()
        const total = countResult.total
        if (total === 0) return { code: 0, words: [] }

        const batchTimes = Math.ceil(total / MAX_LIMIT)
        const tasks = []
        for (let i = 0; i < batchTimes; i++) {
          tasks.push(
            wordsCol.skip(i * MAX_LIMIT).limit(MAX_LIMIT).orderBy('createdAt', 'desc').get()
          )
        }
        const results = (await Promise.all(tasks)).reduce((acc, cur) => acc.concat(cur.data), [])
        return { code: 0, words: results }
      }

      // ========== 添加单个 ==========
      case 'add': {
        const result = await wordsCol.add({
          data: {
            ...data,
            createdAt: db.serverDate()
          }
        })
        return { code: 0, id: result._id }
      }

      // ========== 批量添加 ==========
      case 'batchAdd': {
        if (!data.words || !data.words.length) return { code: 0, added: 0 }
        for (const word of data.words) {
          const { id, _id, ...clean } = word  // 剥离本地 ID
          await wordsCol.add({
            data: { ...clean, createdAt: db.serverDate() }
          })
        }
        return { code: 0, added: data.words.length }
      }

      // ========== 更新 ==========
      case 'update': {
        const { id, updates } = data
        await wordsCol.doc(id).update({
          data: { ...updates, updatedAt: db.serverDate() }
        })
        return { code: 0 }
      }

      // ========== 批量更新 ==========
      case 'batchUpdate': {
        const { items } = data  // [{id, updates}, ...]
        for (const item of items) {
          await wordsCol.doc(item.id).update({
            data: { ...item.updates, updatedAt: db.serverDate() }
          })
        }
        return { code: 0, updated: items.length }
      }

      // ========== 删除 ==========
      case 'delete': {
        await wordsCol.doc(data.id).remove()
        return { code: 0 }
      }

      default:
        return { code: -1, error: 'Unknown action: ' + action }
    }
  } catch (e) {
    return { code: -1, error: e.message }
  }
}