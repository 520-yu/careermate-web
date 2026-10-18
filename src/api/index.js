import http, { toApiError } from './http'

/**
 * 后端接口封装。
 *
 * 约定：每个方法都通过 `meta.scope` 标注业务动作名，
 * 这样报错时页面上显示的是「上传简历 失败」而不是「POST /api/resume/upload 失败」。
 */

/** 六组件连通性自检。返回 { mysql, redis, qdrant, minio, deepseek, rocketmq }。 */
export function fetchHealth() {
  return http.get('/health', { meta: { scope: '组件自检' } })
}

/**
 * 上传简历 PDF。
 * @param {File} file
 */
export function uploadResume(file) {
  const form = new FormData()
  form.append('file', file)
  return http.post('/api/resume/upload', form, {
    // 交给浏览器自己生成 multipart 的 boundary，这里不能手写 Content-Type
    headers: { 'Content-Type': 'multipart/form-data' },
    meta: { scope: '上传简历' },
  })
}

/**
 * JD 匹配。
 * 注意后端是无状态的：简历必须以完整对象回传，不是传一个 id。
 */
export function matchJd(resume, jd) {
  return http.post('/api/jd/match', { resume, jd }, { meta: { scope: 'JD 匹配' } })
}

/** 开启一场模拟面试，返回 { sessionId, firstQuestion }。 */
export function startInterview(resume, jd, matchResult) {
  return http.post(
    '/api/interview/start',
    { resume, jd, matchResult },
    { meta: { scope: '开启面试' } },
  )
}

/** 查询评估报告。后端是异步两阶段：可能返回 { status: 'GENERATING' } 或 { status: 'READY', report }。 */
export function fetchReport(sessionId) {
  return http.get(`/api/interview/${encodeURIComponent(sessionId)}/report`, {
    meta: { scope: '获取评估报告' },
  })
}

/**
 * 多轮对话（SSE 流式）。
 *
 * 为什么不用 EventSource：浏览器原生 EventSource 只支持 GET，
 * 而后端的 /api/interview/chat 是 POST。所以只能用 fetch + 手写流解析。
 *
 * @param {object}   opts
 * @param {string}   opts.sessionId
 * @param {string}   opts.message
 * @param {(t:string)=>void} opts.onChunk  每收到一段文本回调一次
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>} 完整回复
 */
export async function chatStream({ sessionId, message, onChunk, signal }) {
  let response
  try {
    response = await fetch('/api/interview/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ sessionId, message }),
      signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw toApiError({ message: e.message, config: { url: '/api/interview/chat', method: 'post', meta: { scope: '面试对话' } } })
  }

  // 流式接口的错误必须在这里拦住：如果直接开始解析 body，
  // 一个 503 的 JSON 会被当成文本流当资料显示，用户只会看到一串奇怪的字符。
  if (!response.ok) {
    const text = await response.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      /* 非 JSON 错误体，保留原文 */
    }
    const err = toApiError(
      {
        response: { status: response.status, data: data ?? text },
        config: { url: '/api/interview/chat', method: 'post', meta: { scope: '面试对话' } },
      },
      '面试对话',
    )
    throw err
  }

  const reader = response.body?.getReader()
  if (!reader) throw { scope: '面试对话', status: null, message: '当前浏览器不支持流式读取（ReadableStream）', method: 'POST', url: '/api/interview/chat', detail: null, fix: '换 Chrome / Edge 最新版。' }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 以空行分隔事件；Spring 写的是 \n\n，但不同环境可能是 \r\n，先规范化
    buffer = buffer.replace(/\r\n/g, '\n')

    let sep
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const chunk = parseSseFrame(frame)
      if (chunk) {
        full += chunk
        onChunk?.(chunk)
      }
    }
  }

  return full
}

/** 解析一个 SSE 事件帧，取出 data 行（多行 data 按规范用 \n 拼接）。 */
function parseSseFrame(frame) {
  const dataLines = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
  if (!dataLines.length) return ''
  return dataLines.join('\n')
}
