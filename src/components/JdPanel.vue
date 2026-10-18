<script setup>
import { computed, ref } from 'vue'
import { matchJd } from '../api'
import { useErrorStore } from '../stores/errors'
import { useSessionStore } from '../stores/session'
import JsonView from './JsonView.vue'

const session = useSessionStore()
const errors = useErrorStore()

const loading = ref(false)

const scoreTone = computed(() => {
  const s = session.matchResult?.matchScore
  if (s == null) return ''
  if (s >= 75) return 'var(--ok)'
  if (s >= 50) return 'var(--warn)'
  return 'var(--danger)'
})

async function run() {
  if (!session.resume) {
    errors.report({
      kind: 'client', scope: 'JD 匹配', method: 'POST', url: '/api/jd/match', status: null,
      message: '还没有简历。', detail: null, fix: '先完成上面的「上传简历」。',
    })
    return
  }
  if (!session.jd.trim()) {
    errors.report({
      kind: 'client', scope: 'JD 匹配', method: 'POST', url: '/api/jd/match', status: null,
      message: 'JD 不能为空。', detail: null, fix: '把目标岗位的招聘要求原文粘贴到上面的文本框。',
    })
    return
  }
  loading.value = true
  try {
    session.matchResult = await matchJd(session.resume, session.jd)
  } catch (e) {
    errors.report(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="card">
    <h2>② JD 匹配</h2>
    <p class="hint">
      用目标 JD 去检索知识库里的相似岗位，再和你的简历逐条比对。
    </p>

    <div class="field">
      <label>目标岗位 JD</label>
      <textarea
        v-model="session.jd"
        rows="7"
        placeholder="把招聘要求原文粘贴到这里，例如：&#10;岗位职责：负责核心业务系统服务端开发……&#10;任职要求：3 年 Java 后端经验；熟悉 Redis 缓存设计……"
      ></textarea>
    </div>

    <div class="actions">
      <button class="primary" :disabled="loading || !session.hasResume" @click="run">
        <span v-if="loading" class="spin"></span>{{ loading ? '分析中…' : '开始匹配' }}
      </button>
      <span v-if="!session.hasResume" class="muted">需要先上传简历</span>
    </div>

    <template v-if="session.matchResult">
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 18px 0" />

      <div class="score">
        <span class="num" :style="{ color: scoreTone }">{{ session.matchResult.matchScore }}</span>
        <span class="of">/ 100 匹配度</span>
      </div>

      <dl class="kv">
        <dt>已具备</dt>
        <dd><div class="tags">
          <span v-for="s in session.matchResult.matchedSkills" :key="s" class="tag ok">{{ s }}</span>
          <span v-if="!session.matchResult.matchedSkills?.length" class="muted">（无）</span>
        </div></dd>

        <dt>缺口</dt>
        <dd><div class="tags">
          <span v-for="s in session.matchResult.missingSkills" :key="s" class="tag miss">{{ s }}</span>
          <span v-if="!session.matchResult.missingSkills?.length" class="muted">（无）</span>
        </div></dd>

        <dt>建议</dt>
        <dd><ul class="bullets">
          <li v-for="(s, i) in session.matchResult.suggestions" :key="i">{{ s }}</li>
          <li v-if="!session.matchResult.suggestions?.length" class="muted">（无）</li>
        </ul></dd>
      </dl>

      <JsonView :data="session.matchResult" label="查看 JdMatchResult 原始 JSON" />
    </template>
  </section>
</template>
