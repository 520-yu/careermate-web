<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: { type: [Object, Array], default: null },
  label: { type: String, default: '查看原始 JSON' },
})

const text = computed(() => {
  try {
    return JSON.stringify(props.data, null, 2)
  } catch {
    return String(props.data)
  }
})
</script>

<template>
  <details v-if="data" class="raw">
    <summary>{{ label }}</summary>
    <pre>{{ text }}</pre>
  </details>
</template>
