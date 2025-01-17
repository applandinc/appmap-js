<template>
  <div class="loading-background">
    <div class="loading-spinner"></div>
  </div>
</template>

<script>
export default {
  name: 'v-loading-spinner',
};
</script>

<style scoped lang="scss">
.loading-background {
  width: 100%;
  height: 100%;
  background-color: $gray1;

  .loading-spinner {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80px;
    height: 80px;

    &:after {
      content: '';
      display: block;
      width: 64px;
      height: 64px;
      margin: 8px;
      border-radius: 50%;
      border: 6px solid transparent;
      border-color: $hotpink transparent $hotpink transparent;
      animation: loader-animation 1.2s linear infinite;
    }
  }
}
</style>
