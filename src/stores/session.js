import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * 业务状态。
 *
 * 后端是无状态的：/api/jd/match 与 /api/interview/start 都需要把完整的 ResumeProfile
 * 回传过去，所以简历必须在前端留一份。这也是为什么这里不叫 "store 一下缓存" 而是
 * 真的持有 resume 对象 —— 它是后续两个接口的必需入参。
 */
export const useSessionStore = defineStore('session', () => {
  const resume = ref(null)
  const resumeFileName = ref('')
  const jd = ref('')
  const matchResult = ref(null)

  /** { sessionId, firstQuestion } */
  const interview = ref(null)
  /** [{ role: 'user'|'assistant', content, streaming? }] */
  const turns = ref([])
  /** { status: 'GENERATING'|'READY', report } */
  const report = ref(null)

  const hasResume = computed(() => !!resume.value)
  const canMatch = computed(() => !!resume.value && jd.value.trim().length > 0)
  const canStartInterview = computed(() => canMatch.value)
  const canChat = computed(() => !!interview.value?.sessionId)

  function setResume(data, fileName) {
    resume.value = data
    resumeFileName.value = fileName || ''
    // 简历换了，之前基于它算出来的匹配结果与面试会话都失效
    matchResult.value = null
    interview.value = null
    turns.value = []
    report.value = null
  }

  /** 手动填入简历 JSON（没有 PDF 时用它先把后面几步跑通）。 */
  function setResumeManual(data) {
    setResume(data, '（手动填写）')
  }

  function reset() {
    resume.value = null
    resumeFileName.value = ''
    jd.value = ''
    matchResult.value = null
    interview.value = null
    turns.value = []
    report.value = null
  }

  return {
    resume,
    resumeFileName,
    jd,
    matchResult,
    interview,
    turns,
    report,
    hasResume,
    canMatch,
    canStartInterview,
    canChat,
    setResume,
    setResumeManual,
    reset,
  }
})
