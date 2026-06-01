<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 56 })
</script>

<template>
  <svg
    class="BYFLogo"
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="BYF"
  >
    <defs>
      <linearGradient id="byfGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0a7aff" />
        <stop offset="0.6" stop-color="#5baeff" />
        <stop offset="1" stop-color="#81c4ff" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="14" fill="url(#byfGrad)" />
    <!-- > prompt chevron -->
    <path
      d="M18 20 L31 32 L18 44"
      stroke="white"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <!-- _ cursor -->
    <rect x="33" y="40" width="13" height="3.5" rx="1.75" fill="white" opacity="0.9" />
  </svg>
</template>

<style scoped>
.BYFLogo {
  display: block;
  flex-shrink: 0;
}
</style>
