import { AgentOptions } from '../../src/agent';
import HelpAgent from '../../src/agents/help-agent';
import { HelpResponse } from '../../src/help';
import InteractionHistory from '../../src/interaction-history';
import { AppMapConfig, AppMapStats } from '../../src/project-info';
import VectorTermsService from '../../src/services/vector-terms-service';
import { suggestsVectorTerms } from '../fixture';
import LookupContextService from '../../src/services/lookup-context-service';
import { UserOptions } from '../../src/lib/parse-options';
import { ContextV2 } from '../../src/context';

describe('HelpAgent', () => {
  const question = 'How to make a diagram?';
  let history: InteractionHistory;
  let lookupService: LookupContextService;
  let vectorTermsService: VectorTermsService;

  function receivesHelpDocs(): void {
    lookupService = {
      lookupHelp: jest
        .fn()
        .mockImplementation((vectorTerms: string[], tokenCount: number): Promise<HelpResponse> => {
          expect(vectorTerms).toEqual(['diagram']);
          expect(tokenCount).toEqual(1000);
          return Promise.resolve([
            {
              filePath: 'ruby-diagram.md',
              from: 1,
              to: 2,
              content: 'steps to make a Ruby appmap diagram',
              score: 1,
            },
          ]);
        }),
      lookupContext: jest
        .fn()
        .mockImplementation(
          (
            keywords: string[],
            tokenCount: number,
            filters: ContextV2.ContextFilters = {}
          ): Promise<ContextV2.ContextResponse> => {
            expect(keywords).toEqual([]);
            expect(tokenCount).toEqual(500);
            expect(filters).toEqual({
              locations: ['.'],
              itemTypes: [ContextV2.ContextItemType.DirectoryListing],
            });
            return Promise.resolve([
              {
                type: ContextV2.ContextItemType.DirectoryListing,
                content: 'app/controllers/\napp/models/\napp/views/',
                location: '.',
                directory: '/the/directory',
              },
            ]);
          }
        ),
    } as unknown as LookupContextService;
  }

  beforeEach(() => {
    history = new InteractionHistory();
    vectorTermsService = suggestsVectorTerms(question, undefined, ['diagram']);
  });

  function buildAgent(): HelpAgent {
    return new HelpAgent(history, lookupService, vectorTermsService);
  }

  describe('when there are no AppMaps', () => {
    const options = new AgentOptions(
      question,
      question,
      new UserOptions(new Map()),
      [],
      [
        {
          directory: 'twitter',
          appmapConfig: { language: 'ruby' } as unknown as AppMapConfig,
          appmapStats: { numAppMaps: 0 } as unknown as AppMapStats,
        },
      ]
    );

    beforeEach(receivesHelpDocs);

    it('searches for help docs', async () => {
      await buildAgent().perform(options, () => 1000);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(lookupService.lookupHelp).toHaveBeenCalled();
    });
    it('prompts the user to create AppMaps', async () => {
      await buildAgent().perform(options, () => 1000);

      expect(history.events.map((event) => event.metadata)).toEqual([
        {
          name: 'agent',
          role: 'system',
          type: 'prompt',
        },
        {
          name: 'question',
          role: 'system',
          type: 'prompt',
        },
        {
          name: 'directoryListings',
          role: 'system',
          type: 'prompt',
        },
        {
          name: 'directoryListings',
          role: 'user',
          type: 'prompt',
        },
        {
          name: 'makeAppMaps',
          role: 'system',
          type: 'prompt',
        },
        {
          name: 'noAppMaps',
          role: 'user',
          type: 'prompt',
        },
        {
          name: 'helpDoc',
          role: 'system',
          type: 'prompt',
        },
        {
          name: 'helpDoc',
          role: 'system',
          type: 'prompt',
        },
      ]);
    });
  });
  describe('when there are AppMaps', () => {
    const options = new AgentOptions(
      question,
      question,
      new UserOptions(new Map()),
      [],
      [
        {
          directory: 'shopify',
          appmapConfig: { language: 'ruby' } as unknown as AppMapConfig,
          appmapStats: { numAppMaps: 10 } as unknown as AppMapStats,
        },
      ]
    );

    describe('and it receives help docs', () => {
      beforeEach(receivesHelpDocs);

      it('searches for help docs', async () => {
        await buildAgent().perform(options, () => 1000);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(lookupService.lookupHelp).toHaveBeenCalled();
      });

      it('prompts based on the help docs', async () => {
        await buildAgent().perform(options, () => 1000);

        expect(history.events.map((event) => event.metadata)).toEqual([
          {
            name: 'agent',
            role: 'system',
            type: 'prompt',
          },
          {
            name: 'question',
            role: 'system',
            type: 'prompt',
          },
          {
            name: 'directoryListings',
            role: 'system',
            type: 'prompt',
          },
          {
            name: 'directoryListings',
            role: 'user',
            type: 'prompt',
          },
          {
            name: 'helpDoc',
            role: 'system',
            type: 'prompt',
          },
          {
            name: 'helpDoc',
            role: 'system',
            type: 'prompt',
          },
        ]);
      });
    });

    describe('and it does not find matching help', () => {
      beforeEach(() => {
        lookupService.lookupHelp = jest.fn().mockImplementation(() => Promise.resolve([]));
      });

      it('prompts that no help docs were found', async () => {
        await buildAgent().perform(options, () => 1000);

        expect(history.events.map((event) => event.metadata)).toEqual([
          {
            name: 'agent',
            role: 'system',
            type: 'prompt',
          },
          {
            name: 'question',
            role: 'system',
            type: 'prompt',
          },
          {
            name: 'directoryListings',
            role: 'system',
            type: 'prompt',
          },
          {
            name: 'directoryListings',
            role: 'user',
            type: 'prompt',
          },
          {
            name: 'noHelpDoc',
            role: 'system',
            type: 'prompt',
          },
        ]);
      });
    });
  });
});
