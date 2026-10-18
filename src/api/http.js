import axios from 'axios'

/**
 * 统一 HTTP 客户端。
 *
 * 设计要点：**所有失败都必须变成一个带上下文的 ApiError**，而不是直接抛 axios 的原始错误。
 * 原因：axios 的错误对象在浏览器里结构不固定（有时 response 为空、data 是字符串、
 * 超时和 4xx 混在一起），页面上的 `catch (e) { alert(e) }` 只能显示 `[object Object]`
 * 或 "Request failed with status code 400" —— 把后端真正给出的原因丢掉了。
 *
 * 这里统一成：
 *   { scope, method, url, status, message, detail, fix, kind }
 * 其中：
 *   - scope   : 业务动作（上传简历 / JD 匹配 …），让用户知道是哪一步坏了
 *   - status  : HTTP 状态码；null 表示请求根本没发出去（网络/DNS/后端没起）
 *   - message : 后端给的 human-readable 原因，拿不到才退回兜底文案
 *   - fix     : 针对这个错误的可执行排查建议
 */

const BACKEND_HINT = '后端 http://127.0.0.1:8080 是否已启动？'

export const http = axios.create({
  // 走 Vite 代理，同源请求，不需要 baseURL 也不会有 CORS 问题
  baseURL: '',
  // 这些接口会调大模型，慢的时候 30s+ 很正常，不要用默认的短超时把它掐断
  timeout: 180_000,
  headers: { 'Content-Type': 'application/json' },
})

/** 把 axios 的错误对象归一化成 ApiError。 */
export function toApiError(error, fallbackScope = '请求') {
  const config = error?.config ?? {}
  const scope = config.meta?.scope ?? fallbackScope
  const method = (config.method ?? 'get').toUpperCase()
  const url = config.url ?? ''

  // 1) 完全没有 response —— 请求没到达后端
  if (!error?.response) {
    const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message ?? '')
    return {
      kind: 'network',
      scope,
      method,
      url,
      status: null,
      message: isTimeout
        ? `请求超时（超过 ${Math.round((config.timeout ?? 180000) / 1000)} 秒）。大模型调用可能卡住了，后端也可能在忙。`
        : `无法连接后端。${BACKEND_HINT}`,
      detail: error?.message ?? null,
      fix: isTimeout
        ? '看后端控制台是否有异常堆栈；确认 DeepSeek / Ollama 的网络可达。'
        : '确认后端已启动（http://127.0.0.1:8080/health），以及 Vite 代理配置里的 target 端口一致。',
    }
  }

  // 2) 有 response —— 解析后端返回体
  const { status, data } = error.response
  let message = null
  let detail = data

  if (typeof data === 'string') {
    message = data.trim() || null
  } else if (data && typeof data === 'object') {
    // Spring Boot 默认错误体：{ timestamp, status, error, path }，
    // 加了 server.error.include-message=always 之后才会带上 message 字段。
    message = data.message || data.error || null
    if (!message && Array.isArray(data.errors) && data.errors.length) {
      message = data.errors.map((e) => e.defaultMessage || e.field).join('；')
    }
  }

  if (!message) message = `HTTP ${status}（后端未返回可读说明）`

  return {
    kind: status >= 500 ? 'server' : 'client',
    scope,
    method,
    url,
    status,
    message,
    detail,
    fix: suggestFix(status, message),
  }
}

/** 按状态码与关键词给出可执行的排查方向。 */
function suggestFix(status, message = '') {
  if (status === 400) {
    if (/PDF/i.test(message)) return '只接受 .pdf。手上有 .docx 时先导出成 PDF 再上传。'
    if (/resume/i.test(message)) return '缺少简历数据：先完成「上传简历」这一步，或手动填入简历 JSON。'
    if (/jd/i.test(message)) return '缺少 JD：把目标岗位的招聘要求原文粘贴进来。'
    if (/sessionId/i.test(message)) return '缺少 sessionId：先在「模拟面试」里开一场面试。'
    if (/message/i.test(message)) return '缺少回答内容：输入框不能为空。'
    if (/太少/.test(message)) return '面试轮次不足，至少完成一问一答再生成报告。'
    return '请求参数不符合后端校验，按上面的提示补齐后再试。'
  }
  if (status === 404) {
    return '会话不存在或已过期（服务端会话有效期 6 小时）。重新开一场面试即可。'
  }
  if (status === 413) {
    return '文件超过上传上限（10MB）。压缩或换一份更小的 PDF。'
  }
  if (status === 503) {
    return '后台任务投递失败：检查 RocketMQ 的 NameServer(9876) 与 Broker(10911) 是否在运行。'
  }
  if (status === 502 || status === 504) {
    return '代理转发失败：确认 Vite 的 target 指向后端 8080，且后端没有重启中。'
  }
  if (status >= 500) {
    return '后端抛异常了。看 IDEA 控制台最后 30 行堆栈，那里有真正的根因。'
  }
  return ''
}

/** 给 axios 挂一层拦截器：任何失败都变成 ApiError 抛出，页面只管展示。 */
http.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(toApiError(error)),
)

export default http
