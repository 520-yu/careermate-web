<script setup>
import { useErrorStore } from '../stores/errors'

const errors = useErrorStore()
</script>

<template>
  <!--
    错误横幅：任何一步失败，用户都要立刻看到五件事：
      1. 哪一步失败了（scope）
      2. 业务错误码（code）—— 机器可读、稳定的分类
      3. HTTP 状态码（status，null 表示请求没发出去）
      4. 后端给的原始原因（message）
      5. 该怎么排查（fix）
    最后还有一个追踪号（traceId）：把它贴给后端的人，就能一行搜到那次请求的完整堆栈。
  -->
  <div v-if="errors.current" class="error-banner" role="alert">
    <div class="head">
      <span aria-hidden="true">⚠</span>
      <span>{{ errors.current.scope || '请求' }} 失败</span>
      <span v-if="errors.current.code" class="code">{{ errors.current.code }}</span>
      <span v-if="errors.current.status" class="status">{{ errors.current.status }}</span>
      <span v-else class="status">网络</span>
      <span style="flex: 1"></span>
      <button class="ghost" style="padding: 2px 10px" @click="errors.dismiss()">关闭</button>
    </div>

    <div class="where">
      {{ errors.current.method }} {{ errors.current.url }}
      <span v-if="errors.current.at"> · {{ errors.current.at }}</span>
    </div>

    <div class="msg">{{ errors.current.message }}</div>

    <div v-if="errors.current.fix" class="fix">排查方向：{{ errors.current.fix }}</div>

    <div v-if="errors.current.traceId" class="trace">
      追踪号 <code>{{ errors.current.traceId }}</code>
      <span class="trace-hint">— 在后端日志里搜它，能定位到这次请求</span>
    </div>

    <details v-if="errors.current.detail" class="raw">
      <summary>查看后端原始返回</summary>
      <pre>{{ typeof errors.current.detail === 'string'
        ? errors.current.detail
        : JSON.stringify(errors.current.detail, null, 2) }}</pre>
    </details>
  </div>
</template>

<style scoped>
/* 业务错误码：和 HTTP 状态码并排，但样式上区分开 —— 前者是"什么事"，后者是"哪一类响应" */
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.22);
}

/* 追踪号：用等宽字体，方便用户一眼抄下来、复制粘贴去搜日志 */
.trace {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.9;
}

.trace code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.22);
  user-select: all; /* 点一下就全选中，省得手动拖 */
}

.trace-hint {
  opacity: 0.72;
}
</style>
