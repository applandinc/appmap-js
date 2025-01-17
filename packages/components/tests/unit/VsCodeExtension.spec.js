import { mount, createWrapper } from '@vue/test-utils';
import VsCodeExtension from '@/pages/VsCodeExtension.vue';
import { VIEW_FLOW } from '@/store/vsCode';
import data from './fixtures/user_page_scenario.appmap.json';
import Vue from 'vue';
import { RESET_FILTERS } from '../../src/store/vsCode';
import { AppMapFilter, serializeFilter, base64UrlEncode } from '@appland/models';

describe('VsCodeExtension.vue', () => {
  let wrapper; // Wrapper<Vue>
  let rootWrapper; // Wrapper<Vue>

  function stateObjectToBase64(stateObject) {
    return Buffer.from(JSON.stringify(stateObject), 'utf-8').toString('base64url');
  }

  const defaultFilter = new AppMapFilter();
  const serialized = serializeFilter(defaultFilter);
  const base64encoded = base64UrlEncode(JSON.stringify({ filters: serialized }));
  const appmapFsPath = '/some/fake/path';

  const defaultFilterObject = {
    filterName: 'AppMap default',
    state: base64encoded,
    default: true,
  };

  beforeEach(async () => {
    wrapper = mount(VsCodeExtension, {
      stubs: {
        'v-diagram-component': true,
        'v-diagram-trace': true,
      },
      computed: {
        isInBrowser() {
          return false;
        },
      },
      propsData: {
        appmapFsPath,
      },
    });
    rootWrapper = createWrapper(wrapper.vm.$root);
    await wrapper.vm.loadData(data);
    wrapper.vm.$store.commit(RESET_FILTERS);
  });

  it('emits the "ask-navie-about-map" event when the buttons are clicked', async () => {
    // Sanity check
    expect(rootWrapper.emitted()['ask-navie-about-map']).toBeUndefined();

    wrapper.find('[data-cy="ask-navie-control-button"]').trigger('click');
    expect(rootWrapper.emitted()['ask-navie-about-map']).toEqual([[appmapFsPath]]);

    wrapper.find('[data-cy="collapsed-sidebar-ask-navie"]').trigger('click');
    expect(rootWrapper.emitted()['ask-navie-about-map']).toEqual([[appmapFsPath], [appmapFsPath]]);

    // Open the details panel
    wrapper.find('[data-cy="sidebar-hamburger-menu-icon').trigger('click');
    await Vue.nextTick();

    wrapper.find('[data-cy="ask-navie-button"]').trigger('click');
    expect(rootWrapper.emitted()['ask-navie-about-map']).toEqual([
      [appmapFsPath],
      [appmapFsPath],
      [appmapFsPath],
    ]);
  });

  it('sets the selected object by FQID', () => {
    wrapper.vm.setState('{"selectedObject":"label:json"}');
    expect(wrapper.vm.selectedLabel).toMatch('json');
    expect(wrapper.vm.getState()).toEqual(
      base64UrlEncode('{"currentView":"viewComponent","selectedObject":"label:json"}')
    );

    wrapper.vm.setState('{"selectedObject":"event:44"}');
    expect(wrapper.vm.selectedObject.toString()).toMatch('User.find_by_id!');
    expect(wrapper.vm.getState()).toEqual(
      base64UrlEncode('{"currentView":"viewComponent","selectedObject":"event:44"}')
    );

    wrapper.vm.setState('{"selectedObject":"class:app/models/User"}');
    expect(wrapper.vm.selectedObject.id).toMatch('app/models/User');
    expect(wrapper.vm.getState()).toEqual(
      base64UrlEncode(
        '{"currentView":"viewComponent","selectedObjects":["event:44","class:app/models/User"]}'
      )
    );

    wrapper.vm.setState('{"selectedObject":"analysis-finding:fakeHash"}');
    expect(wrapper.vm.selectedObject.id).toMatch('fakeHash');
    expect(wrapper.vm.getState()).toEqual(
      base64UrlEncode(
        '{"currentView":"viewComponent","selectedObjects":["event:44","class:app/models/User","analysis-finding:fakeHash"]}'
      )
    );

    wrapper.vm.clearSelection();

    const appState =
      '{"currentView":"viewComponent","filters":{"rootObjects":["package:app/controllers"],"limitRootEvents":false,"hideMediaRequests":false,"hideUnlabeled":true,"hideElapsedTimeUnder":100,"hideName":["package:json"]}}';

    wrapper.vm.setState(appState);

    expect(wrapper.vm.filters.rootObjects).toContain('package:app/controllers');
    expect(wrapper.vm.filters.declutter.limitRootEvents.on).toBe(false);
    expect(wrapper.vm.filters.declutter.hideMediaRequests.on).toBe(false);
    expect(wrapper.vm.filters.declutter.hideUnlabeled.on).toBe(true);
    expect(wrapper.vm.filters.declutter.hideElapsedTimeUnder.on).toBe(true);
    expect(wrapper.vm.filters.declutter.hideElapsedTimeUnder.time).toBe(100);
    expect(wrapper.vm.filters.declutter.hideName.on).toBe(true);
    expect(wrapper.vm.filters.declutter.hideName.names).toContain('package:json');

    expect(wrapper.vm.getState()).toEqual(
      'eyJjdXJyZW50VmlldyI6InZpZXdDb21wb25lbnQiLCJmaWx0ZXJzIjp7InJvb3RPYmplY3RzIjpbInBhY2thZ2U6YXBwL2NvbnRyb2xsZXJzIl0sImxpbWl0Um9vdEV2ZW50cyI6ZmFsc2UsImhpZGVNZWRpYVJlcXVlc3RzIjpmYWxzZSwiaGlkZVVubGFiZWxlZCI6dHJ1ZSwiaGlkZUVsYXBzZWRUaW1lVW5kZXIiOjEwMCwiaGlkZU5hbWUiOlsicGFja2FnZTpqc29uIl19fQ'
    );
  });

  it('default state encodes the current view', () => {
    expect(wrapper.vm.getState()).toEqual(stateObjectToBase64({ currentView: 'viewComponent' }));
  });

  it('serializes selectedObject state', async () => {
    const state = { selectedObject: 'event:44' };
    await wrapper.vm.setState(JSON.stringify(state));
    expect(wrapper.vm.selectedObject.toString()).toMatch('User.find_by_id!');
    expect(wrapper.vm.getState()).toEqual(
      stateObjectToBase64({ ...{ currentView: 'viewComponent' }, ...state })
    );
  });

  it('serializes rootObjects state', async () => {
    const state = { filters: { rootObjects: ['package:app/controllers'] } };
    await wrapper.vm.setState(JSON.stringify(state));
    expect(wrapper.vm.filters.rootObjects).toContain('package:app/controllers');
    expect(wrapper.vm.getState()).toEqual(
      stateObjectToBase64({ ...{ currentView: 'viewComponent' }, ...state })
    );
  });

  it('serializes limitRootEvents state', async () => {
    const state = { filters: { limitRootEvents: false } };
    await wrapper.vm.setState(JSON.stringify(state));
    expect(wrapper.vm.getState()).toEqual(
      stateObjectToBase64({ ...{ currentView: 'viewComponent' }, ...state })
    );
  });

  it('serializes hideMediaRequests state', async () => {
    const state = { filters: { hideMediaRequests: false } };
    await wrapper.vm.setState(JSON.stringify(state));
    expect(wrapper.vm.getState()).toEqual(
      stateObjectToBase64({ ...{ currentView: 'viewComponent' }, ...state })
    );
  });

  it('serializes hideUnlabeled state', async () => {
    const state = { filters: { hideUnlabeled: true } };
    await wrapper.vm.setState(JSON.stringify(state));
    expect(wrapper.vm.getState()).toEqual(
      stateObjectToBase64({ ...{ currentView: 'viewComponent' }, ...state })
    );
  });

  it('serializes hideElapsedTimeUnder state', async () => {
    const state = { filters: { hideElapsedTimeUnder: 100 } };
    await wrapper.vm.setState(JSON.stringify(state));
    expect(wrapper.vm.getState()).toEqual(
      stateObjectToBase64({ ...{ currentView: 'viewComponent' }, ...state })
    );
  });

  it('serializes hideName state', async () => {
    const state = {
      filters: { hideName: ['package:json', 'class:User'] },
    };
    await wrapper.vm.setState(JSON.stringify(state));
    expect(wrapper.vm.getState()).toEqual(
      stateObjectToBase64({ ...{ currentView: 'viewComponent' }, ...state })
    );
  });

  it('accepts a base64 encoded JSON object as state', async () => {
    const state = { filters: { hideName: ['package:json', 'class:User'] } };
    await wrapper.vm.setState(stateObjectToBase64(state));
    expect(wrapper.vm.getState()).toEqual(
      stateObjectToBase64({ ...{ currentView: 'viewComponent' }, ...state })
    );
  });

  it('changes views and modifies the search bar after setState', async () => {
    let appState = '{"currentView":"viewFlow","traceFilter":"id:44"}';
    expect(wrapper.vm.isViewingFlow).toBe(false);
    wrapper.vm.setState(appState);

    await Vue.nextTick();
    expect(wrapper.vm.isViewingFlow).toBe(true);

    await Vue.nextTick();
    expect(wrapper.vm.eventFilterText).toBe('id:44 ');

    appState = '{"currentView":"viewSequence","searchBar":"id:42"}';
    wrapper.vm.setState(appState);

    await Vue.nextTick();
    expect(wrapper.vm.isViewingSequence).toBe(true);

    await Vue.nextTick();
    expect(wrapper.vm.eventFilterText).toBe('id:42 ');
  });

  it('toggles filters off if selectedObject is outside of the filtered set', async () => {
    wrapper.vm.setState('{"selectedObject":"event:3"}');
    expect(wrapper.vm.selectedObject.toString()).toMatch('Net::HTTP#request');

    Object.values(wrapper.vm.filters.declutter).forEach((filter) => {
      expect(filter.on).toBe(false);
    });

    await Vue.nextTick();

    expect(wrapper.text()).toMatch('Net::HTTP#request');
  });

  it('emits user events', () => {
    // Sanity checks
    expect(rootWrapper.emitted().showInstructions).toBeUndefined();
    expect(rootWrapper.emitted().changeTab).toBeArrayOfSize(1);
    expect(rootWrapper.emitted().selectedObject).toBeUndefined();

    wrapper.vm.showInstructions();
    expect(rootWrapper.emitted().showInstructions).toBeArrayOfSize(1);

    wrapper.vm.onChangeTab(wrapper.vm.$refs[VIEW_FLOW]);
    expect(rootWrapper.emitted().changeTab[1]).toContain(VIEW_FLOW);
  });

  it('creates a default filter', () => {
    const actual = rootWrapper.emitted().saveFilter;
    expect(actual).toBeArrayOfSize(1);
    expect(actual[0][0]).toEqual(defaultFilterObject);
  });

  it('sets a single selected object by fqid when passed as an array', () => {
    wrapper.vm.setState('{"selectedObjects":["label:json"]}');
    expect(wrapper.vm.selectedLabel).toMatch('json');

    wrapper.vm.setState('{"selectedObjects":["event:44"]}');
    expect(wrapper.vm.selectedObject.toString()).toMatch('User.find_by_id!');

    wrapper.vm.setState('{"selectedObjects":["class:app/models/User"]}');
    expect(wrapper.vm.selectedObject.id).toMatch('app/models/User');

    wrapper.vm.setState('{"selectedObjects":["analysis-finding:fakeHash"]}');
    expect(wrapper.vm.selectedObject.id).toMatch('fakeHash');

    wrapper.vm.clearSelection();
  });

  it('sets multiple objects as selected when passed an array', () => {
    const objectsToSelect = ['event:44', 'class:app/models/User', 'analysis-finding:fakeHash'];
    const objectsToSelectString = JSON.stringify({ selectedObjects: objectsToSelect });
    wrapper.vm.setState(objectsToSelectString);

    const actualSelectedObjects = wrapper.vm.selectionStack.map(wrapper.vm.codeObjectToIdentifier);
    const actualSelectedObjectsString = JSON.stringify({ selectedObjects: actualSelectedObjects });
    expect(actualSelectedObjectsString).toMatch(objectsToSelectString);

    expect(wrapper.vm.selectedObject.id).toMatch('fakeHash');

    wrapper.vm.clearSelection();
  });

  it('renders the `unlicensed` notice when the user is unlicensed', async () => {
    await wrapper.setProps({ isLicensed: false });
    expect(wrapper.find('[data-cy="notice-unlicensed"]').exists()).toBe(true);
  });

  it('renders the `configuration required` notice when the user is unlicensed', async () => {
    await wrapper.setProps({ isConfigured: false });
    expect(wrapper.find('[data-cy="notice-configuration"]').exists()).toBe(true);
  });

  it('provides a button to export the sequence diagram by default', async () => {
    const state = { currentView: 'viewSequence' };
    await wrapper.vm.setState(JSON.stringify(state));

    await wrapper.find('[data-cy="export-button"] [data-cy="popper-button"]').trigger('click');
    expect(wrapper.find('[data-cy="exportSVG"]').exists()).toBe(true);
  });

  it('hides the export button when `allowExport` is false', async () => {
    const state = { currentView: 'viewSequence' };
    await wrapper.vm.setState(JSON.stringify(state));
    await wrapper.setProps({ allowExport: false });

    expect(wrapper.find('[data-cy="exportSVG"]').exists()).toBe(false);
  });

  it('can export the current AppMap data as JSON', async () => {
    const state = { filters: { hideExternalPaths: ['node_modules', 'vendor'] } };
    await wrapper.vm.setState(JSON.stringify(state));

    await wrapper.find('[data-cy="export-button"]').trigger('click');
    const exportJSON = wrapper.find('[data-cy="exportJSON"]');
    expect(exportJSON.exists()).toBe(true);

    // TODO: This is a hack to wait for the filters to be applied
    // We should really fix this at some point
    await new Promise((resolve) => setTimeout(resolve, 0));

    await exportJSON.trigger('click');

    const exportJSONEventParameters = rootWrapper.emitted()['exportJSON'];
    expect(exportJSONEventParameters).toBeArrayOfSize(1);
    const exportedData = exportJSONEventParameters[0][0];

    expect(Object.keys(exportedData).sort()).toStrictEqual([
      'classMap',
      'events',
      'metadata',
      // 'version', TODO: version should be exported, but isn't somehow.
      'viewState',
    ]);

    expect(exportedData.events.length).toEqual(22); // 36 without hideExternalPaths
    expect(exportedData.viewState.filters.hideExternalPaths.sort()).toEqual([
      'node_modules',
      'vendor',
    ]);
  });

  describe('when in the browser', () => {
    function mountWithProps(propsData) {
      wrapper = mount(VsCodeExtension, {
        stubs: {
          'v-diagram-component': true,
          'v-diagram-trace': true,
        },
        computed: {
          isInBrowser() {
            return true;
          },
        },
        propsData,
      });
      rootWrapper = createWrapper(wrapper.vm.$root);
      wrapper.vm.loadData(data);
      wrapper.vm.$store.commit(RESET_FILTERS);
    }

    beforeEach(() => {
      window.localStorage.clear();
    });

    it('does create a default filter when in the browser and one does not exist', () => {
      mountWithProps();
      const actual = rootWrapper.emitted().saveFilter;
      expect(actual).toBeArrayOfSize(1);
      expect(actual[0][0]).toEqual(defaultFilterObject);
    });

    it('does not create a default filter when in the browser and one already exists', () => {
      mountWithProps({ savedFilters: [defaultFilterObject] });
      const actual = rootWrapper.emitted().saveFilter;
      expect(actual).toBeUndefined();
    });
  });
});
