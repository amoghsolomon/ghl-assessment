<script setup lang="ts">
defineProps<{
  label: string
  tone: string
}>()
</script>

<template>
  <span class="health-dot-label" :class="tone">
    <i></i>
    {{ label }}
  </span>
</template>
