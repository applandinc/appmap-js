<template>
  <div class="chat">
    <div class="button-panel" v-if="isChatting">
      <div id="header-logo">
        <v-app-map-navie-logo />
        <div id="header-navie-logo">Navie</div>
      </div>
      <v-button
        v-if="openNewChat"
        data-cy="new-chat-btn"
        class="clear"
        size="small"
        kind="native-ghost"
        @click.native="openNewChat"
      >
        New chat
      </v-button>
    </div>
    <div class="explainer" v-if="$slots.default">
      <slot />
    </div>
    <div
      :class="['messages', isChatting ? 'chatting' : 'not-chatting']"
      data-cy="messages"
      ref="messages"
      @scroll="manageScroll"
    >
      <slot name="not-chatting" v-if="!isChatting"></slot>
      <v-user-message
        v-for="(message, i) in messages"
        :key="i"
        :message="message.content"
        :is-user="message.isUser"
        :is-error="message.isError"
        :id="message.messageId"
        :sentiment="message.sentiment"
        :tools="message.tools"
        :complete="message.complete"
        :code-selections="message.codeSelections"
        :thread-id="threadId"
        @change-sentiment="onSentimentChange"
      />
    </div>
    <div v-if="!authorized" class="status-unauthorized status-container">
      <div class="status-label">
        <p>You must have activated AppMap to use this feature.</p>
        <p>
          <b>VSCode</b>
          To activate AppMap for VSCode use the AppMap sidebar, or run the
          <tt>AppMap: Login</tt> command using the command palette.
        </p>
        <p>
          <b>JetBrains</b>
          To activate AppMap for JetBrains, use the AppMap tool window.
        </p>
      </div>
    </div>
    <v-chat-input
      @send="onSend"
      @stop="onStop"
      :placeholder="inputPlaceholder"
      :class="inputClasses"
      :question="question"
      :code-selections="codeSelections"
      :is-stop-active="isResponseStreaming"
      :input-placeholder="inputPlaceholder"
      :commands="commands"
      :use-animation="useAnimation"
      :is-disabled="isInputDisabled"
      :usage="usage"
      :subscription="subscription"
      :email="email"
      ref="input"
    />
  </div>
</template>

<script lang="ts">
//@ts-nocheck
import Vue, { PropType } from 'vue';
import VUserMessage from '@/components/chat/UserMessage.vue';
import VChatInput from '@/components/chat/ChatInput.vue';
import VAppMapNavieLogo from '@/assets/appmap-full-logo.svg';
import VButton from '@/components/Button.vue';
import { AI } from '@appland/client';
import { ExplainRpc, NavieRpc } from '@appland/rpc';

export type CodeSelection = {
  path: string;
  lineStart: number;
  lineEnd: number;
  code: string;
  language: string;
};

export interface ITool {
  title: string;
  status?: string;
  complete?: boolean;
}

interface IMessage {
  message: string;
  isUser: boolean;
  isError: boolean;
  complete?: boolean;
  messageId?: string;
  sentiment?: number;
  tools?: ITool[];
  codeSelections?: CodeSelection[];
}

class UserMessage implements IMessage {
  public readonly messageId = undefined;
  public readonly sentiment = undefined;
  public readonly isUser = true;
  public readonly isError = false;
  public readonly tools = undefined;
  public readonly complete = true;
  public readonly codeSelections = [];

  constructor(public content: string) {}
}

class AssistantMessage implements IMessage {
  public content = '';
  public sentiment = undefined;
  public complete = false;
  public readonly isUser = false;
  public readonly isError = false;
  public readonly tools = [];
  public readonly codeSelections = undefined;

  constructor(public messageId?: string) {}

  append(token: string) {
    Vue.set(this, 'content', [this.content, token].join(''));
  }
}

class ErrorMessage implements IMessage {
  public readonly messageId = undefined;
  public readonly sentiment = undefined;
  public readonly codeSelections = undefined;
  public readonly complete = true;
  public readonly isUser = false;
  public readonly isError = true;

  constructor(private error: Error) {}

  get content() {
    return this.error.message;
  }
}

export default {
  name: 'v-chat',
  components: {
    VUserMessage,
    VChatInput,
    VAppMapNavieLogo,
    VButton,
  },
  props: {
    openNewChat: {
      type: Function,
    },
    // Initial question to ask
    question: {
      type: String,
    },
    sendMessage: {
      type: Function, // (message: string, codeSelections?: string[]) => void
    },
    inputPlaceholder: {
      type: String,
      default: 'What are you working on today?',
    },
    commands: {
      type: Array<NavieRpc.V1.Metadata.Command[]>,
    },
    isInputDisabled: {
      type: Boolean,
      default: false,
    },
    useAnimation: {
      type: Boolean,
      default: true,
    },
    usage: {
      type: Object,
    },
    subscription: {
      type: Object,
    },
    email: {
      type: String,
    },
  },
  data() {
    return {
      messages: [] as IMessage[],
      threadId: undefined as string | undefined,
      authorized: true,
      autoScrollTop: 0,
      enableScrollLog: false, // Auto-scroll can be tricky, so there is special logging to help debug it.
      codeSelections: [] as CodeSelection[],
      appmaps: [] as string[],
      scrollLog: (message: string) => (this.enableScrollLog ? console.log(message) : undefined),
    };
  },
  computed: {
    isChatting(): boolean {
      return this.messages.length > 0;
    },
    inputClasses() {
      return {
        chatting: this.isChatting,
      };
    },
    userMessageCount() {
      return this.messages.filter((m) => m.isUser).length;
    },
    isResponseStreaming(): boolean {
      return this.getMessage({ complete: false, isUser: false }) !== undefined;
    },
  },
  methods: {
    restoreThread(threadId: string, thread: ExplainRpc.Thread) {
      // In hindsight, the thread should have an id property.
      this.threadId = threadId;
      let populatedCodeSelection = false;
      for (const exchange of thread.exchanges) {
        if (exchange.question) {
          // TODO: User message provides prompt, but the UI does not have a place for it.
          const { content, codeSelection } = exchange.question;
          const userMessage = this.addUserMessage(content);
          if (codeSelection && !populatedCodeSelection) {
            populatedCodeSelection = true;
            // TODO: There's some mismatch here between what the UI shows & what's in the thread data.
            userMessage.codeSelections = [codeSelection];
          }
        }
        if (exchange.answer) {
          const { content } = exchange.answer;
          const systemMessage = this.addSystemMessage();
          systemMessage.content = content;
          systemMessage.complete = true;
        }
      }
    },
    getMessage(query: Partial<IMessage>): IMessage | undefined {
      return this.messages.find((m) => {
        return Object.keys(query).every((key) => m[key] === query[key]);
      });
    },
    // Creates-or-appends a message.
    addToken(token: string, threadId: string, messageId: string) {
      if (threadId !== this.threadId) return;

      if (!messageId) console.warn('messageId is undefined');
      if (!threadId) console.warn('threadId is undefined');

      let assistantMessage = this.getMessage({ messageId });
      if (!assistantMessage) {
        assistantMessage = new AssistantMessage(messageId);
        this.messages.push(assistantMessage);
      }

      assistantMessage.append(token);
      this.scrollToBottom();
    },
    setAuthorized(v: boolean) {
      this.authorized = v;
    },
    addUserMessage(content: string) {
      const userMessage = new UserMessage(content);
      this.messages.push(userMessage);
      // Ensure that for the first user message, the auto-scroll position is reset to the top.
      // This is to account for the fact that there may be an auto-scroll applied when the
      // placeholder content is show during the chat initialization or when the user clears the chat.
      if (this.userMessageCount === 1) {
        this.autoScrollTop = 0;
      }
      this.scrollToBottom();
      return userMessage;
    },
    addSystemMessage() {
      const message = new AssistantMessage();
      this.messages.push(message);
      return message;
    },
    addErrorMessage(error: Error) {
      this.messages.push(new ErrorMessage(error));
      this.scrollToBottom();
    },
    onError(error, assistantMessage?: AssistantMessage) {
      const messageIndex = this.messages.findIndex((m) => m === assistantMessage);
      if (messageIndex !== -1) {
        this.messages.splice(messageIndex, 1);
      }

      if (
        error.code === 401 ||
        (error.code === 500 && error.message === 'Authentication required')
      ) {
        this.setAuthorized(false);
      } else {
        this.addErrorMessage(error);
      }
    },
    async onSend(message: string) {
      const userMessage = this.addUserMessage(message);
      userMessage.codeSelections = this.codeSelections;

      this.sendMessage(
        message,
        this.codeSelections.map((s) => s.code),
        this.appmaps
      );

      this.codeSelections = [];
    },
    onStop() {
      this.$emit('stop');
    },
    onAck(_messageId: string, threadId: string) {
      this.setAuthorized(true);
      if (threadId !== this.threadId) {
        this.threadId = threadId;
        this.$root.$emit('thread-id', threadId);
      }
    },
    scrollToBottom() {
      // Allow one tick to progress to allow any DOM changes to be applied
      this.$nextTick(() => {
        // If the scrollTop is less than the autoScrollTop, the user has scrolled up.
        // When the user scrolls up, stop auto-scrolling to the bottom until they scroll back down
        // beyond a threshold point at which auto-scrolling can "re-grab" the scroll position.
        // That's handled by manageScroll(), which is bound to the .messages scroll event.
        const scrollUp = this.autoScrollTop - this.$refs.messages.scrollTop;
        if (this.autoScrollTop != 0 && scrollUp > 5) {
          this.scrollLog('User scrolled up, disabling auto-scroll');
          return;
        }

        const targetScrollTop = this.$refs.messages.scrollHeight - this.$refs.messages.clientHeight;
        this.$refs.messages.scrollTop = targetScrollTop;
        this.autoScrollTop = targetScrollTop;
        this.scrollLog('Auto-scrolling to bottom');
      });
    },
    async onSentimentChange(messageId: string, sentiment: number) {
      if (!messageId) return;

      const message = this.getMessage({ messageId });
      if (!message || message.sentiment === sentiment) return;

      await AI.sendMessageFeedback(message.messageId, sentiment);

      message.sentiment = sentiment;
    },
    // If the scroll point has been set beyond where auto-scroll was canceled, and the
    // content is now fully scrolled, re-enable auto-scrolling.
    manageScroll() {
      const isScrolledBelowLastAutoScroll = this.$refs.messages.scrollTop > this.autoScrollTop;
      if (isScrolledBelowLastAutoScroll) {
        this.scrollLog('User scrolled down');
        if (this.isFullyScrolled()) {
          this.scrollLog('Content is fully scrolled, re-enabling auto-scroll');
          this.autoScrollTop = this.$refs.messages.scrollTop;
        } else {
          this.scrollLog('Content is not fully scrolled');
        }
      }
    },
    // Returns true if the content is fully scrolled to the bottom (with a fairly generous buffer).
    isFullyScrolled() {
      const { messages } = this.$refs;

      const fullyScrolled = messages.scrollHeight - messages.clientHeight;
      const fullyScrolledDelta = Math.abs(messages.scrollTop - fullyScrolled);
      return fullyScrolledDelta < 40;
    },
    includeCodeSelection(codeSelection: CodeSelection) {
      this.codeSelections.push(codeSelection);
    },
    includeAppMap(appmap: string) {
      this.appmaps.push(appmap);
    },
    resetAppMaps() {
      this.appmaps = [];
    },
    setInput(input: string) {
      this.$refs.input.setInput(input);
      this.$refs.input.moveCursorToEnd();
    },
  },
  watch: {
    isChatting() {
      this.$emit('isChatting', this.isChatting);
    },
  },
};
</script>

<style lang="scss" scoped>
$border-color: darken($gray4, 10%);

#header-logo {
  margin-right: auto;
  color: $color-foreground;
  display: flex;
  flex-direction: row;
  align-items: center;
  font-weight: bold;
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;

  svg {
    path:last-child {
      fill: $color-foreground;
    }
    path:not(:last-child) {
      fill: $color-background;
      stroke: transparent;
    }
    circle {
      fill: $color-foreground;
    }
  }
}

#header-navie-logo {
  padding-top: 3px;
}

.chat {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100vh;
  padding: 0;
  max-width: 58rem;
  margin: 0 auto;

  ::-webkit-scrollbar-thumb {
    width: 2px;
    background-color: rgba(255, 255, 255, 0.2) !important;
  }

  ::-webkit-scrollbar-track {
    border-radius: 0 0 $border-radius $border-radius;
    background-color: transparent !important;
  }

  ::-webkit-scrollbar-thumb:hover,
  ::-webkit-scrollbar-thumb:active {
    background: white;
  }

  .explainer {
    color: #e3e5e8;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .button-panel {
    justify-content: end;
    display: flex;
    padding: 1rem 0.75rem;
    background-color: $color-background;
    border-bottom: 1px solid rgba(white, 0.05);
    box-shadow: 0 0 0.7rem 0rem $color-tile-shadow;
    border-radius: 0 0 $border-radius $border-radius;
  }

  .clear {
    padding: 0.5rem 1rem;
  }

  .messages {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
    overflow: auto;

    .mode-instructions {
      display: flex;
      flex-direction: column;
      padding: 2rem;
      color: $gray4;
      font-size: 0.9rem;
    }
  }

  .chatting {
    justify-content: flex-start;
  }
}

.status-container {
  display: inline-block;
  position: relative;
  left: 54px;
  margin: -4px 0.5rem 1rem 0.5rem;
  display: flex;

  .spinner-container {
    .spinner {
      height: 22px;
      width: 22px;
    }
  }

  .status-label {
    margin-left: 0.5rem;
    color: white;
  }

  path {
    fill: $lightblue;
  }

  &--failure path {
    fill: $bad-status;
  }
}
</style>
