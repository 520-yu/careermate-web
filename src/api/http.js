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
 *   { scope, method, url, status, code, traceId, message, detail, fix, kind }
 * 其中：
 *   - scope   : 业务动作（上传简历 / JD 匹配 …），让用户知道是哪一步坏了
 *   - status  : HTTP 状态码；null 表示请求根本没发出去（网络/DNS/后端没起）
 *   - code    : 后端业务错误码（INVALID_REQUEST / RESUME_PARSE_FAILED …）。
 *               有它才能按错误类型精确分支，而不是去正则匹配中文文案。
 *   - traceId : 后端为这次失败生成的追踪号，同时写在后端日志里。
 *               用户把它贴过来，就能一行搜到完整堆栈。
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
  let code = null
  let traceId = null
  let detail = data

  if (typeof data === 'string') {
    message = data.trim() || null
  } else if (data && typeof data === 'object') {
    // 后端 GlobalExceptionHandler 统一输出的 ApiError：
    //   { code, message, status, path, traceId, timestamp }
    // 兼容老格式（Spring Boot 默认错误体只有 timestamp/status/error/path）。
    code = data.code ?? null
    traceId = data.traceId ?? null
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
    code,
    traceId,
    message,
    detail,
    fix: suggestFix({ code, status, message }),
  }
}

/**
 * 业务错误码 → 可执行的排查方向。
 *
 * 优先按 code 判断：码是后端承诺的稳定契约，改中文文案不会让它失效。
 * 早期版本只能靠正则匹配 message，后端改一句话就可能失配 —— 那正是这次改造要解决的。
 */
const FIX_BY_CODE = {
  INVALID_REQUEST: '请求参数不符合后端校验，按上面的提示把缺的补上再试。',
  UNSUPPORTED_FILE_TYPE: '只接受 .pdf。手上有 .docx 时先导出成 PDF 再上传。',
  FILE_TOO_LARGE: '文件超过上传上限（10MB）。压缩或换一份更小的 PDF。',
  SESSION_NOT_FOUND: '会话不存在或已过期（服务端有效期 6 小时）。重新开一场面试即可。',
  REPORT_NOT_READY: '报告还在生成中，等几秒会自动重试，不需要手动刷新。',
  RESUME_PARSE_FAILED:
    '模型没返回可解析的简历结构。优先换一份「文本型」PDF（用鼠标能选中文字的那种），再重试。',
  JD_MATCH_FAILED: '模型这次没给出可用结果。再点一次「开始匹配」；连续失败就看后端日志里的模型返回。',
  INTERVIEW_START_FAILED: '面试开场生成失败。重新开一场；连续失败检查 DeepSeek 额度与网络。',
  INTERVIEW_REPLY_FAILED: '这一轮回复生成失败。把同一条回答再提交一次即可，之前的记录不会丢。',
  REPORT_GENERATE_FAILED: '评估报告生成失败。再轮询一次会重新触发；连续失败看后端日志。',
  REPORT_DISPATCH_FAILED:
    '报告任务投递失败：检查 RocketMQ 的 NameServer(9876) 与 Broker(10911) 是否在运行。',
  STORAGE_ERROR: '后端存储操作失败（Redis / MinIO）。检查这两个组件是否在运行。',
  INTERNAL_ERROR: '后端抛了未处理的异常。用上面的追踪号在后端日志里搜，能定位到那次请求的完整堆栈。',
}

/** 按业务码优先、状态码与关键词兜底，给出可执行的排查方向。 */
function suggestFix({ code, status, message = '' }) {
  if (code && FIX_BY_CODE[code]) return FIX_BY_CODE[code]

  // 兜底路径：老后端（没有 code 字段），或网关/代理层直接返回的错误
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
  if (status === 409) {
    return '资源状态还没就绪（例如报告仍在生成）。稍等再试。'
  }
  if (status === 413) {
    return '文件超过上传上限（10MB）。压缩或换一份更小的 PDF。'
  }
  if (status === 415) {
    return '服务端不接受这个文件类型。只支持 PDF。'
  }
  if (status === 422) {
    return '模型没能给出可解析的结果。换一份更规范的输入，或稍后重试。'
  }
  if (status === 503) {
    return '后台任务投递失败：检查 RocketMQ 的 NameServer(9876) 与 Broker(10911) 是否在运行。'
  }
  if (status === 502 || status === 504) {
    return '上游（模型或代理）没有正常返回。看后端日志里带追踪号的那一行。'
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
