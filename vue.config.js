module.exports = {
  css: {
    loaderOptions: {
      sass: {
        prependData: '@import "src/scss/vue";',
      },
    },
  },
};
