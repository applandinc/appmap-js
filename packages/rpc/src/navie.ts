import { ConversationThread } from '@appland/client';

export namespace NavieRpc {
  export namespace V1 {
    export namespace Metadata {
      export type Command = {
        name: string;
        description: string;
        referenceUrl?: string;
        demoUrls?: string[];
      };

      export const Method = 'v1.navie.metadata';
      export type Params = {};
      export type Response = {
        welcomeMessage?: string;
        inputPlaceholder?: string;
        commands: Command[];
      };
    }

    export namespace Suggest {
      export const Method = 'v1.navie.suggest';
      export type NextStep = {
        command: 'generate' | 'diagram' | 'plan' | 'test' | 'explain' | 'help';
        prompt: string;
        label: string;
        overallScore: number;
      };
      export type Params = {
        threadId: string;
      };
      export type Response = NextStep[];
    }

    export namespace Register {
      export const Method = 'v1.navie.register';
      export type Params = {};
      export type Response = {
        thread: ConversationThread;
      };
    }

    export namespace Models {
      export type Model = {
        id: string;
        name: string;
        provider: string;
        createdAt: string;
      };

      export namespace Add {
        export const Method = 'v1.navie.models.add';
        export type Params = Model[];
        export type Response = void;
      }

      export namespace List {
        export const Method = 'v1.navie.models.list';
        export type Params = {};
        export type Response = Model[];
      }

      export namespace Select {
        export const Method = 'v1.navie.models.select';
        export type Params = Model;
        export type Response = void;
      }
    }
  }

  export namespace V2 {
    export namespace Metadata {
      export const Method = 'v2.navie.metadata';
      export type Params = {};
      export type Response = {
        inputPlaceholder?: string;
        commands: NavieRpc.V1.Metadata.Command[];
      };
    }

    export namespace Welcome {
      export const Method = 'v2.navie.welcome';
      export type Params = {
        codeSelection?: string;
      };
      export type StaticMessage = {
        message: string;
      };
      export type DynamicActivity = {
        activity: string;
        suggestions: string[];
      };
      export type Response = StaticMessage | DynamicActivity;
    }
  }
}
