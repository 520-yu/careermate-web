<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchHealth } from './api'
import { toApiError } from './api/http'
import { useErrorStore } from './stores/errors'
import { useSessionStore } from './stores/session'
import ErrorBanner from './components/ErrorBanner.vue'
import ResumePanel from './components/ResumePanel.vue'
import JdPanel from './components/JdPanel.vue'
import InterviewPanel from './components/InterviewPanel.vue'

const session = useSessionStore()
const errors = useErrorStore()

/* ---------------- 组件连通性 ---------------- */
const health = ref(null)
const healthLoading = ref(false)

async function checkHealth() {
  healthLoading.value = true
  try {
    health.value = await fetchHealth()
    errors.dismiss()
  } catch (e) {
    health.value = null
    // 用一个专门的 scope 报错，避免和业务错误混淆
    errors.report({ ...e, scope: '组件自检' })
  } finally {
    healthLoading.value = false
  }
}

onMounted(checkHealth)

const HEALTH_LABELS = {
  mysql: 'MySQL',
  redis: 'Redis',
  qdrant: 'Qdrant',
  minio: 'MinIO',
  deepseek: 'DeepSeek',
  rocketmq: 'RocketMQ',
}

const healthItems = computed(() =>
  Object.entries(HEALTH_LABELS).map(([key, label]) => ({
    key,
    label,
    value: health.value?.[key] ?? '未知',
    ok: String(health.value?.[key] ?? '').startsWith('OK'),
  })),
)

const badCount = computed(() => healthItems.value.filter((i) => !i.ok).length)

/* ---------------- 步骤进度 ---------------- */
const steps = computed(() => [
  { label: '简历', done: !!session.resume },
  { label: 'JD 匹配', done: !!session.matchResult },
  { label: '面试', done: !!session.interview },
  { label: '报告', done: session.report?.status === 'READY' },
])
</script>

<template>
  <div class="page">
    <div class="masthead">
      <h1>CareerMate</h1>
      <span class="sub">AI 求职助手 · 简历解析 → JD 匹配 → 模拟面试 → 评估报告</span>
    </div>

    <!-- 粘性错误横幅：任何一步失败都停在这里，向上滚动也跑不掉 -->
    <div style="position: sticky; top: 10px; z-index: 20">
      <ErrorBanner />
    </div>

    <!-- 组件连通性 -->
    <div class="card" style="padding: 14px 18px">
      <div class="row" style="justify-content: space-between">
        <div class="row" style="gap: 8px">
          <strong style="font-size: 13px">后端组件</strong>
          <span
            v-for="item in healthItems"
            :key="item.key"
            class="tag"
            :class="item.ok ? 'ok' : 'miss'"
            :title="String(item.value)"
          >{{ item.label }}</span>
          <span v-if="!health && !healthLoading" class="muted">未连接</span>
        </div>
        <button class="ghost" style="padding: 3px 10px" :disabled="healthLoading" @click="checkHealth">
          <span v-if="healthLoading" class="spin"></span>刷新
        </button>
      </div>
      <div v-if="badCount > 0" class="notice" style="margin-top: 10px">
        有 {{ badCount }} 个组件异常，相关功能会失败。把鼠标悬停在红色标签上可以看到具体原因；
        点「刷新」可重新检测。
      </div>
    </div>

    <div class="steps">
      <div
        v-for="(s, i) in steps"
        :key="s.label"
        class="step-chip"
        :class="{ done: s.done, active: !s.done && steps.slice(0, i).every((p) => p.done) }"
      >
        <span>{{ s.done ? '✓' : i + 1 }}</span>{{ s.label }}
      </div>
    </div>

    <ResumePanel />
    <JdPanel />
    <InterviewPanel />

    <!-- 错误历史：连续失败时，先后顺序本身就是线索 -->
    <section v-if="errors.history.length > 1" class="card">
      <div class="row" style="justify-content: space-between">
        <h2 style="margin: 0">错误记录</h2>
        <button class="ghost" style="padding: 3px 10px" @click="errors.clearHistory()">清空</button>
      </div>
      <p class="hint">按发生顺序倒序排列。</p>
      <ul class="bullets">
        <li v-for="(e, i) in errors.history" :key="i">
          <code>{{ e.at }}</code>
          · <b>{{ e.scope }}</b>
          <span v-if="e.status" class="tag miss" style="margin: 0 4px">{{ e.status }}</span>
          · {{ e.message }}
        </li>
      </ul>
    </section>

    <p class="muted" style="text-align: center; margin-top: 28px">
      前端 http://localhost:5173 · 通过 Vite 代理转发到后端 http://127.0.0.1:8080
    </p>
  </div>
</template>
