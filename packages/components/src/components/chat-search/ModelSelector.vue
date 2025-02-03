<template>
  <v-popper ref="popper" :hoverable="false" class="popper" placement="bottom" align="left">
    <div class="model-selector" @click="onClick">
      <span class="model-selector__title">
        <template v-if="selectedModel">
          {{ selectedModel.name }}
        </template>
        <template v-else> Select a model </template>
        <v-chevron-down class="model-selector__chevron" />
      </span>
    </div>
    <template #content>
      <div class="model-selector-list">
        <div
          class="model-selector-list__item"
          v-for="model in sortedModels"
          :key="model.id"
          @click="onSelect(model)"
        >
          <span class="model-selector-list__item--title">{{ model.name }}</span>
          <span class="model-selector-list__item--description">{{ model.provider }}</span>
        </div>
      </div>
    </template>
  </v-popper>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import VPopper from '@/components/Popper.vue';
import VChevronDown from '@/assets/fa-solid_chevron-down.svg';
import type { NavieRpc } from '@appland/rpc';

export default Vue.extend({
  components: {
    VPopper,
    VChevronDown,
  },

  props: {
    models: {
      type: Array as PropType<NavieRpc.V1.Models.Model[]>,
      default: () => [],
    },
    selectedModelId: {
      type: String,
      default: '',
    },
  },

  data() {
    return {
      hidePopper: (() => {}) as () => void,
    };
  },

  computed: {
    selectedModel(): NavieRpc.V1.Models.Model | undefined {
      return this.models.find((model) => model.id === this.selectedModelId);
    },
    sortedModels(): NavieRpc.V1.Models.Model[] {
      return [...this.models].sort((a, b) => {
        const provider = a.provider.localeCompare(b.provider);
        if (provider !== 0) return provider;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    },
  },

  methods: {
    onSelect(model: NavieRpc.V1.Models.Model) {
      this.$emit('select', model.id);
      if (this.$refs.popper) {
        const popper = this.$refs.popper as any;
        popper.hide();
      }
    },
    _hidePopper() {
      window.removeEventListener('click', this.hidePopper);

      const popper = this.$refs.popper as any;
      if (!popper || !popper.isVisible) return;

      popper.hide();
    },
    onClick(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();

      const popper: any = this.$refs.popper;
      if (popper.isVisible) {
        popper.hide();
        return;
      }

      popper.show();
      window.addEventListener('click', this.hidePopper);
    },
  },
  mounted() {
    this.hidePopper = this._hidePopper.bind(this);
  },
});
</script>

<style lang="scss" scoped>
.popper {
  ::v-deep {
    .popper__text {
      padding: 0;
      background-color: $color-background;
      border: none;
      padding-left: 1rem;
      max-width: unset;

      &--align-left {
        left: 0;
        transform: none;
      }
    }
  }
}

.model-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1rem 0.5rem 1rem;

  &__title {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-weight: 600;
    font-size: 1rem;
    color: $color-foreground;
    cursor: pointer;

    svg path {
      fill: $color-foreground;
    }

    &:hover {
      color: $color-highlight;
      svg path {
        fill: $color-highlight;
      }
    }
  }

  &__chevron {
    width: 0.8em;
    height: 0.8em;
    padding-top: 3px;
  }
}

.model-selector-list {
  display: flex;
  overflow-y: auto;
  max-height: 30rem;
  pointer-events: all;
  flex-direction: column;
  gap: 1px;
  border-radius: $border-radius;
  border: 1px solid $color-border;
  border-top: none;
  border-left: none;
  background-color: $color-background-light;

  &__item {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem;
    place-content: space-between;

    cursor: pointer;

    &:hover {
      background-color: $color-button-bg-hover;
    }

    &--title {
      font-weight: 600;
      font-size: 1rem;
      color: $color-foreground-light;
    }

    &--description {
      font-size: 0.8rem;
      opacity: 0.8;
      color: $color-foreground-dark;
    }
  }
}
</style>
