<script setup>
import { computed, nextTick, ref } from 'vue'
import { chatStream, fetchReport, startInterview } from '../api'
import { useErrorStore } from '../stores/errors'
import { useSessionStore } from '../stores/session'
import JsonView from './JsonView.vue'

const session = useSessionStore()
const errors = useErrorStore()

const starting = ref(false)
const sending = ref(false)
const polling = ref(false)
const draft = ref('')
const chatBox = ref(null)
let abortCtrl = null

const canSend = computed(() => session.canChat && draft.value.trim() && !sending.value)
const scoreTone = computed(() => {
  const s = session.report?.report?.overallScore
  if (s == null) return ''
  if (s >= 75) return 'var(--ok)'
  if (s >= 50) return 'var(--warn)'
  return 'var(--danger)'
})

function scrollBottom() {
  nextTick(() => {
    if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight
  })
}

async function start() {
  if (!session.canStartInterview) {
    errors.report({
      kind: 'client', scope: '开启面试', method: 'POST', url: '/api/interview/start', status: null,
      message: '缺少简历或 JD。', detail: null,
      fix: '先完成「上传简历」并在「JD 匹配」里填入 JD。',
    })
    return
  }
  starting.value = true
  try {
    const data = await startInterview(session.resume, session.jd, session.matchResult)
    session.interview = data
    session.report = null
    session.turns = [{ role: 'assistant', content: data.firstQuestion }]
    scrollBottom()
  } catch (e) {
    errors.report(e)
  } finally {
    starting.value = false
  }
}

async function send() {
  if (!canSend.value) return
  const text = draft.value.trim()
  draft.value = ''
  session.turns.push({ role: 'user', content: text })

  // 先插入一个空的 assistant 气泡用于流式填充。
  // 用 ref 包一层是为了避免直接改数组元素属性在某些场景下不触发更新。
  const bubble = { role: 'assistant', content: '', streaming: true }
  session.turns.push(bubble)
  scrollBottom()

  sending.value = true
  abortCtrl = new AbortController()
  try {
    await chatStream({
      sessionId: session.interview.sessionId,
      message: text,
      signal: abortCtrl.signal,
      onChunk: (chunk) => {
        bubble.content += chunk
        bubble.streaming = false
        scrollBottom()
      },
    })
    bubble.streaming = false
    if (!bubble.content) {
      bubble.content = '（面试官没有返回内容）'
    }
  } catch (e) {
    // 出错时把半截回复标记出来并移除空气泡，避免看起来像"卡住了"
    bubble.streaming = false
    if (!bubble.content) session.turns.pop()
    if (e?.name !== 'AbortError') errors.report(e)
  } finally {
    sending.value = false
    abortCtrl = null
  }
}

function abort() {
  abortCtrl?.abort()
}

/**
 * 报告是异步生成的：后端首次受理后返回 GENERATING，真正的生成在 RocketMQ 消费者里跑。
 * 所以这里必须轮询，而且要给出「等太久」的明确提示，否则用户会以为页面死了。
 */
async function generateReport() {
  if (!session.canChat) return
  polling.value = true
  session.report = { status: 'GENERATING' }
  try {
    for (let i = 0; i < 20; i++) {
      const res = await fetchReport(session.interview.sessionId)
      session.report = res
      if (res.status === 'READY') return
      await new Promise((r) => setTimeout(r, 3000))
    }
    errors.report({
      kind: 'server', scope: '获取评估报告', method: 'GET',
      url: `/api/interview/${session.interview.sessionId}/report`, status: null,
      message: '轮询了约 60 秒，报告仍未生成完成。',
      detail: null,
      fix: '去 RocketMQ 看 careermate-interview-report 是否有消息堆积；再看后端日志里 ReportGenerateConsumer 是否报错。',
    })
  } catch (e) {
    errors.report(e)
  } finally {
    polling.value = false
  }
}
</script>

<template>
  <section class="card">
    <h2>③ 模拟面试</h2>
    <p class="hint">
      面试官会基于简历与 JD 动态出题、追问、当场指出答错的地方。对话是流式返回的。
    </p>

    <div class="actions">
      <button class="primary" :disabled="starting || !session.canStartInterview" @click="start">
        <span v-if="starting" class="spin"></span>{{ session.interview ? '重新开一场' : '开始面试' }}
      </button>
      <span v-if="session.interview" class="muted">
        sessionId：<code>{{ session.interview.sessionId }}</code>
      </span>
      <span v-else-if="!session.canStartInterview" class="muted">需要先有简历与 JD</span>
    </div>

    <template v-if="session.interview">
      <div ref="chatBox" class="chat">
        <div v-for="(t, i) in session.turns" :key="i" class="bubble" :class="t.role">
          <div class="who">{{ t.role === 'user' ? '我' : '面试官' }}</div>
          <div class="body">
            <span v-if="t.streaming && !t.content" class="spin"></span>
            {{ t.content }}
          </div>
        </div>
      </div>

      <div class="field">
        <textarea
          v-model="draft"
          rows="3"
          placeholder="输入你的回答…（Ctrl+Enter 发送）"
          @keydown.ctrl.enter.prevent="send"
          @keydown.meta.enter.prevent="send"
        ></textarea>
      </div>

      <div class="actions">
        <button class="primary" :disabled="!canSend" @click="send">
          <span v-if="sending" class="spin"></span>{{ sending ? '面试官思考中…' : '发送回答' }}
        </button>
        <button v-if="sending" class="ghost" @click="abort">中断</button>
        <span style="flex: 1"></span>
        <button class="ghost" :disabled="polling" @click="generateReport">
          <span v-if="polling" class="spin"></span>{{ polling ? '生成中…' : '生成评估报告' }}
        </button>
      </div>

      <!-- 报告 -->
      <template v-if="session.report">
        <hr style="border: 0; border-top: 1px solid var(--border); margin: 18px 0" />

        <div v-if="session.report.status === 'GENERATING'" class="notice">
          <span class="spin"></span>报告正在后台生成（异步任务），每 3 秒自动查询一次…
        </div>

        <template v-else-if="session.report.status === 'READY'">
          <div class="score">
            <span class="num" :style="{ color: scoreTone }">{{ session.report.report.overallScore }}</span>
            <span class="of">/ 100 综合评分</span>
          </div>

          <p v-if="session.report.report.summary" style="margin-top: 0">
            {{ session.report.report.summary }}
          </p>

          <dl class="kv">
            <dt>分维度</dt>
            <dd>
              <ul class="bullets">
                <li v-for="(d, i) in session.report.report.dimensions" :key="i">
                  <b>{{ d.dimension }}</b> · {{ d.score }} 分 —— {{ d.comment }}
                </li>
              </ul>
            </dd>

            <dt>亮点</dt>
            <dd><ul class="bullets">
              <li v-for="(s, i) in session.report.report.highlights" :key="i">{{ s }}</li>
              <li v-if="!session.report.report.highlights?.length" class="muted">（无）</li>
            </ul></dd>

            <dt>减分项</dt>
            <dd><ul class="bullets">
              <li v-for="(s, i) in session.report.report.risks" :key="i">{{ s }}</li>
              <li v-if="!session.report.report.risks?.length" class="muted">（无）</li>
            </ul></dd>

            <dt>建议</dt>
            <dd><ul class="bullets">
              <li v-for="(s, i) in session.report.report.suggestions" :key="i">{{ s }}</li>
              <li v-if="!session.report.report.suggestions?.length" class="muted">（无）</li>
            </ul></dd>
          </dl>

          <JsonView :data="session.report.report" label="查看 InterviewReport 原始 JSON" />
        </template>
      </template>
    </template>
  </section>
</template>
