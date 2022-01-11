import { mount, createWrapper } from '@vue/test-utils';
import VsCodeExtension from '@/pages/VsCodeExtension.vue';
import { VIEW_FLOW } from '@/store/vsCode';
import data from './fixtures/user_page_scenario.appmap.json';

describe('VsCodeExtension.vue', () => {
  let wrapper;
  let rootWrapper;

  beforeEach(() => {
    wrapper = mount(VsCodeExtension, {
      stubs: {
        'v-diagram-component': true,
        'v-diagram-trace': true,
      },
    });
    rootWrapper = createWrapper(wrapper.vm.$root);
    wrapper.vm.loadData(data);
  });

  it('sets the selected object by FQID', () => {
    wrapper.vm.setState('{"selectedObject":"label:json"}');
    expect(wrapper.vm.selectedLabel).toMatch('json');

    wrapper.vm.setState('{"selectedObject":"event:44"}');
    expect(wrapper.vm.selectedObject.toString()).toMatch('User.find_by_id!');

    wrapper.vm.setState('{"selectedObject":"class:app/models/User"}');
    expect(wrapper.vm.selectedObject.id).toMatch('app/models/User');

    wrapper.vm.clearSelection();

    const appState =
      '{"currentView":"viewComponent","filters":{"rootObjects":["package:app/controllers"],"limitRootEvents":false,"hideMediaRequests":false,"hideUnlabeled":true,"hideElapsedTimeUnder":100,"hideName":["package:json"]}}';

    wrapper.vm.setState(appState);

    expect(wrapper.vm.filters.declutter.rootObjects).toContain(
      'package:app/controllers'
    );
    expect(wrapper.vm.filters.declutter.limitRootEvents.on).toBe(false);
    expect(wrapper.vm.filters.declutter.hideMediaRequests.on).toBe(false);
    expect(wrapper.vm.filters.declutter.hideUnlabeled.on).toBe(true);
    expect(wrapper.vm.filters.declutter.hideElapsedTimeUnder.on).toBe(true);
    expect(wrapper.vm.filters.declutter.hideElapsedTimeUnder.time).toBe(100);
    expect(wrapper.vm.filters.declutter.hideName.on).toBe(true);
    expect(wrapper.vm.filters.declutter.hideName.names).toContain(
      'package:json'
    );

    expect(wrapper.vm.getState()).toEqual(appState);
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
});
