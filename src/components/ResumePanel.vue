<script setup>
import { computed, ref, watch } from 'vue'
import { uploadResume } from '../api'
import { useErrorStore } from '../stores/errors'
import { useSessionStore } from '../stores/session'
import JsonView from './JsonView.vue'

const session = useSessionStore()
const errors = useErrorStore()

const file = ref(null)
/** 隐藏的 file input，由「选择 PDF 文件」按钮和虚线框共同触发。 */
const fileInput = ref(null)
const dragging = ref(false)
const loading = ref(false)
const manualMode = ref(false)
const manualJson = ref('')

/**
 * 是否展示「补齐缺失字段」的小表单。
 * 只在「新解析出一份简历」的那一刻判断一次，之后不跟着输入实时重算 ——
 * 否则用户刚打第一个字，字段就变成非空、表单会当场消失。
 */
const showPatch = ref(false)
watch(
  () => session.resume,
  (r) => {
    showPatch.value = !!r && (!r.name || !r.education)
  },
  { immediate: true },
)

const SAMPLE_RESUME = {
  name: '张三',
  education: '某大学 计算机科学与技术 本科',
  skills: ['Java', 'Spring Boot', 'MySQL', 'Redis'],
  projects: ['校园二手交易平台：负责后端接口与订单模块'],
  strengths: ['基础扎实', '能讲清原理'],
  weaknesses: ['缺少分布式与高并发经验', '未接触过消息队列'],
}

/** 后端按「严格依据原文、不臆测」的提示词工作，所以 PDF 文本层缺失的字段会返回空值。 */
const missingFields = computed(() => {
  if (!session.resume) return []
  const missing = []
  if (!session.resume.name) missing.push('姓名')
  if (!session.resume.education) missing.push('学历')
  return missing
})

function pick(event) {
  const f = event.target.files?.[0]
  if (f) file.value = f
}

/**
 * 打开系统文件选择框。
 * 为什么需要它：<input type="file"> 不能直接用 CSS 改外观，通用做法是把它隐藏、
 * 再用一个自己画的元素去 .click() 它。之前只有虚线框能做这件事，
 * 上面两个"看起来像按钮"的元素其实是模式切换，点它们永远不会弹选择框 —— 这就是"没反应"的来源。
 */
function openPicker() {
  fileInput.value?.click()
}

function onDrop(event) {
  dragging.value = false
  const f = event.dataTransfer.files?.[0]
  if (f) file.value = f
}

async function submit() {
  if (!file.value) {
    errors.report({
      kind: 'client', scope: '上传简历', method: 'POST', url: '/api/resume/upload',
      status: null, message: '还没有选择文件。', detail: null, fix: '点上方虚线框选择一份 PDF。',
    })
    return
  }
  loading.value = true
  try {
    const data = await uploadResume(file.value)
    session.setResume(data, file.value.name)
  } catch (e) {
    errors.report(e)
  } finally {
    loading.value = false
  }
}

function submitManual() {
  let parsed
  try {
    parsed = JSON.parse(manualJson.value)
  } catch (e) {
    errors.report({
      kind: 'client', scope: '手动填写简历', method: '—', url: '—', status: null,
      message: `JSON 解析失败：${e.message}`, detail: manualJson.value.slice(0, 300),
      fix: '检查引号是否为半角、逗号是否多余；也可以点「填入示例」先看格式。',
    })
    return
  }
  session.setResumeManual(parsed)
}

function fillSample() {
  manualJson.value = JSON.stringify(SAMPLE_RESUME, null, 2)
}
</script>

<template>
  <section class="card">
    <h2>① 上传简历</h2>
    <p class="hint">
      PDF 会先归档到 MinIO，再由 Agent 调用 PDFBox 抽文本并抽成结构化画像。
      单文件上限 10MB。
    </p>

    <!-- 隐藏的 file input：真正的文件选择器，由按钮和虚线框共同触发 -->
    <input ref="fileInput" type="file" accept=".pdf,application/pdf" hidden @change="pick" />

    <!-- 上传 PDF -->
    <div v-if="!manualMode">
      <div class="actions" style="margin-bottom: 10px">
        <button class="primary" @click="openPicker">选择 PDF 文件</button>
        <span class="muted">也可以把文件直接拖到下面的虚线框</span>
      </div>

      <div
        class="dropzone"
        :class="{ dragover: dragging }"
        @click="openPicker"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <div v-if="file">
          已选择：<span class="file">{{ file.name }}</span>
          （{{ (file.size / 1024).toFixed(1) }} KB）
        </div>
        <div v-else>把 PDF 拖到这里，或点击此处选择</div>
      </div>

      <div class="actions" style="margin-top: 12px">
        <button class="primary" :disabled="loading" @click="submit">
          <span v-if="loading" class="spin"></span>{{ loading ? '解析中…（要调大模型，约 10-30 秒）' : '上传并解析' }}
        </button>
        <span v-if="loading" class="muted">不要刷新页面，解析完成后会自动显示结果</span>
        <span style="flex: 1"></span>
        <a href="#" class="muted" style="text-decoration: underline" @click.prevent="manualMode = true">
          没有 PDF？手动填写 →
        </a>
      </div>
    </div>

    <!-- 手动填 JSON -->
    <div v-else>
      <div class="field">
        <label>
          简历画像 JSON
          <button class="ghost" style="padding: 1px 8px; margin-left: 8px" @click="fillSample">填入示例</button>
        </label>
        <textarea v-model="manualJson" rows="10" placeholder='{"name":"...","education":"...","skills":[],"projects":[],"strengths":[],"weaknesses":[]}'></textarea>
      </div>
      <div class="actions">
        <button class="primary" @click="submitManual">使用这份简历</button>
        <span class="muted">适合手上没有 PDF 时，先把后面几步跑通</span>
        <span style="flex: 1"></span>
        <a href="#" class="muted" style="text-decoration: underline" @click.prevent="manualMode = false">
          ← 返回上传 PDF
        </a>
      </div>
    </div>

    <!-- 解析结果 -->
    <template v-if="session.resume">
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 18px 0" />

      <div class="row" style="margin-bottom: 10px">
        <strong>解析结果</strong>
        <span class="muted">来源：{{ session.resumeFileName }}</span>
      </div>

      <div v-if="missingFields.length" class="notice" style="margin-bottom: 12px">
        没有解析出「{{ missingFields.join('、') }}」。Agent 的提示词要求「严格依据原文、不臆测」，
        所以它没有编造内容 —— 这是<b>正确行为</b>，不是程序出错。<br />
        最常见的根因是这段文字用的字体<b>缺少 ToUnicode 映射表</b>：PDF 里存的只是字形编号，
        任何文本提取工具（不只本项目）都读不回来，只能靠 OCR。
        可以在下面手动补上，不影响后续步骤。
      </div>

      <div v-if="showPatch" class="patch-grid">
        <div class="field">
          <label>姓名</label>
          <input v-model="session.resume.name" type="text" placeholder="例如：马笑雨" />
        </div>
        <div class="field">
          <label>学历</label>
          <input v-model="session.resume.education" type="text" placeholder="例如：某大学 软件工程 本科" />
        </div>
      </div>
      <div v-if="showPatch" class="actions" style="margin-bottom: 4px">
        <button class="ghost" style="padding: 4px 12px" @click="showPatch = false">已补齐，收起</button>
        <span class="muted">填完直接去做 JD 匹配即可，改动会一起发给后端</span>
      </div>

      <dl class="kv">
        <dt>姓名</dt><dd>{{ session.resume.name || '（空）' }}</dd>
        <dt>学历</dt><dd>{{ session.resume.education || '（空）' }}</dd>
        <dt>技能</dt>
        <dd><div class="tags"><span v-for="s in session.resume.skills" :key="s" class="tag">{{ s }}</span>
          <span v-if="!session.resume.skills?.length" class="muted">（空）</span></div></dd>
        <dt>项目</dt>
        <dd><ul class="bullets"><li v-for="(p, i) in session.resume.projects" :key="i">{{ p }}</li>
          <li v-if="!session.resume.projects?.length" class="muted">（空）</li></ul></dd>
        <dt>优势</dt>
        <dd><ul class="bullets"><li v-for="(p, i) in session.resume.strengths" :key="i">{{ p }}</li>
          <li v-if="!session.resume.strengths?.length" class="muted">（空）</li></ul></dd>
        <dt>短板</dt>
        <dd><ul class="bullets"><li v-for="(p, i) in session.resume.weaknesses" :key="i">{{ p }}</li>
          <li v-if="!session.resume.weaknesses?.length" class="muted">（空）</li></ul></dd>
      </dl>

      <JsonView :data="session.resume" label="查看 ResumeProfile 原始 JSON" />
    </template>
  </section>
</template>
