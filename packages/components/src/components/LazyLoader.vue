<template>
  <div v-if="shouldRender" class="lazy-loader-container">
    <slot />
  </div>
  <v-loading-spinner v-else />
</template>

<script lang="ts">
import Vue from 'vue';
import VLoadingSpinner from '@/components/LoadingSpinner.vue';

export default Vue.extend({
  name: 'v-lazy-loader',

  components: {
    VLoadingSpinner,
  },

  data() {
    return {
      shouldRender: false,
    };
  },

  methods: {
    render() {
      Vue.nextTick(() => {
        this.shouldRender = true;
      });
    },
  },

  activated() {
    this.render();
  },

  mounted() {
    this.render();
  },

  deactivated() {
    this.shouldRender = false;
  },
});
</script>

<style scoped lang="scss">
.lazy-loader-container {
  width: 100%;
  height: 100%;
}
</style>
