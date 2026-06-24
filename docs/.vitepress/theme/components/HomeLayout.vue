<script setup lang="ts">
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

import HomeFeatures from './HomeFeatures.vue';
import HomeHero from './HomeHero.vue';
import HomeQuickStart from './HomeQuickStart.vue';

const { Layout } = DefaultTheme;
const { frontmatter } = useData();
</script>

<template>
  <Layout>
    <template v-if="frontmatter.layout === 'home'" #home-hero-before>
      <div class="ByfHome">
        <HomeHero />
      </div>
    </template>

    <template v-if="frontmatter.layout === 'home'" #home-features-after>
      <div class="ByfHome">
        <HomeQuickStart />
        <HomeFeatures />
      </div>
    </template>
  </Layout>
</template>

<style>
/* Hide the default hero + features rendered by VitePress when our custom home is active.
   We keep frontmatter.layout: home so VitePress still applies layout-specific behavior. */
.VPHome > .VPHero {
  display: none;
}
.VPHome > .VPFeatures {
  display: none;
}
</style>
