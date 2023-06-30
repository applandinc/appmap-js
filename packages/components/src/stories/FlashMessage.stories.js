import VFlashMessage from '@/components/FlashMessage.vue';

export default {
  title: 'AppLand/UI/Flash Message',
  component: VFlashMessage,
  argTypes: {
    type: {
      control: { type: 'select', options: ['info', 'success', 'warning', 'error'] },
      defaultValue: 'info',
    },
    message: {
      control: { type: 'text' },
      defaultValue: 'This is a flash message',
    },
  },
};

const Template = (args, { argTypes }) => ({
  props: Object.keys(argTypes),
  components: { VFlashMessage },
  template: `<v-flash-message v-bind="$props">{{ message }}</v-flash-message>`,
});

export const flashMessage = Template.bind({});
