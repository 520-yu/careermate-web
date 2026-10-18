import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局错误状态。
 *
 * 为什么把错误集中在一个 store 里而不是各页面自己 alert：
 * 1. 页面上同时有很多可失败的操作（上传 / 匹配 / 开面试 / 对话 / 报告），
 *    分散处理很容易漏掉某一条，用户只看到界面没反应；
 * 2. 统一之后「错误横幅」永远是同一个样式，用户可以预期去哪看；
 * 3. 保留一份 history，连续失败时能看到「先报了什么、后报了什么」——
 *    排查链路问题时这个顺序往往就是线索。
 */
export const useErrorStore = defineStore('errors', () => {
  /** 当前需要醒目展示的错误（ApiError 结构，见 api/http.js）。 */
  const current = ref(null)
  /** 最近错误列表，最新的在最前面。 */
  const history = ref([])

  function report(error) {
    const item = { ...error, at: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }
    current.value = item
    history.value.unshift(item)
    if (history.value.length > 20) history.value.length = 20
  }

  /** 用户手动关掉横幅，但 history 仍保留。 */
  function dismiss() {
    current.value = null
  }

  function clearHistory() {
    history.value = []
  }

  return { current, history, report, dismiss, clearHistory }
})
