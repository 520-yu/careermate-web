<script setup>
import { useErrorStore } from '../stores/errors'

const errors = useErrorStore()
</script>

<template>
  <!--
    错误横幅：本次前端改动的核心。
    设计意图是「任何一步失败，用户都能立刻看到四件事」：
      1. 哪一步失败了（scope）
      2. HTTP 状态码（status，null 表示请求没发出去）
      3. 后端给的原始原因（message）
      4. 该怎么排查（fix）
    这四条缺任何一条，用户就只能靠猜或者去翻控制台。
  -->
  <div v-if="errors.current" class="error-banner" role="alert">
    <div class="head">
      <span aria-hidden="true">⚠</span>
      <span>{{ errors.current.scope || '请求' }} 失败</span>
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

    <details v-if="errors.current.detail" class="raw">
      <summary>查看后端原始返回</summary>
      <pre>{{ typeof errors.current.detail === 'string'
        ? errors.current.detail
        : JSON.stringify(errors.current.detail, null, 2) }}</pre>
    </details>
  </div>
</template>
