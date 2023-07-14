import { mount, createWrapper } from '@vue/test-utils';
import Status, { InstructionStep, StepStatus } from '@/components/install-guide/Status.vue';

describe('Status.vue', () => {
  let wrapper, root;
  const projectName = 'my-project';
  const numAppMaps = 256;

  beforeEach(() => {
    wrapper = mount(Status, {
      propsData: {
        currentStep: 0,
        viewingStep: InstructionStep.RecordAppMaps,
        statusStates: [0, 0, 0, 0, 0],
        projectName,
        numAppMaps,
      },
    });
    root = createWrapper(wrapper.vm.$root);
  });

  it('renders segments as step state changes', async () => {
    for (let stepIndex = 0; stepIndex < InstructionStep.NumSteps; ++stepIndex) {
      for (let state = 0; state < StepStatus.NumStatuses; ++state) {
        const statusStates = [
          ...Array(stepIndex).fill(StepStatus.Completed),
          state,
          ...Array(InstructionStep.NumSteps - stepIndex - 1).fill(StepStatus.NotStarted),
        ];

        await wrapper.setProps({ statusStates });

        expect(wrapper.findAll('path.segment').length).toBe(5);
        expect(wrapper.findAll('path.segment.completed').length).toBe(
          stepIndex + (state == StepStatus.Completed ? 1 : 0)
        );
        expect(wrapper.findAll('path.segment.in-progress').length).toBe(
          state === StepStatus.InProgress ? 1 : 0
        );
        expect(wrapper.findAll('.status-message__progress-indicator--success').length).toBe(
          statusStates.every((s) => s === StepStatus.Completed) ? 1 : 0
        );
      }
    }
  });

  it('renders dynamic props correctly', async () => {
    await wrapper.setProps({
      statusStates: [2, 2, 0, 0, 0],
      viewingStep: InstructionStep.RecordAppMaps,
    });
    expect(wrapper.text()).toContain(`${numAppMaps} AppMaps have been recorded for ${projectName}`);
  });

  it('informs the user to go back to a previous step if ahead', async () => {
    await wrapper.setProps({
      statusStates: [2, 1, 0, 0, 0],
      viewingStep: InstructionStep.GenerateOpenApi,
    });
    expect(wrapper.find('.status-message__prompt').text()).toMatch(/Go\s+back\s+and\s+record/gm);
  });

  it('emits an event when the user clicks the next step button', async () => {
    await wrapper.setProps({
      statusStates: [2, 2, 0, 0, 0],
      viewingStep: InstructionStep.RecordAppMaps,
    });

    wrapper.find('button').trigger('click');

    const events = root.emitted();
    expect(events['status-jump']).toBeTruthy();
    expect(events['status-jump']).toEqual([[InstructionStep.ExploreAppMaps]]);
  });

  it('emits an event when the user clicks "go back"', async () => {
    await wrapper.setProps({
      statusStates: [2, 1, 0, 0, 0],
      viewingStep: InstructionStep.GenerateOpenApi,
    });

    wrapper.find('a').trigger('click');

    const events = root.emitted();
    expect(events['status-jump']).toBeTruthy();
    expect(events['status-jump']).toEqual([[InstructionStep.RecordAppMaps]]);
  });

  it('displays the current in progress step if looking ahead', async () => {
    await wrapper.setProps({
      statusStates: [2, 1, 0, 0, 0],
      viewingStep: InstructionStep.GenerateOpenApi,
    });
    expect(wrapper.find('.status-message__heading.status-message--warning').text()).toBe(
      `No AppMaps have been recorded yet for ${projectName}`
    );
  });

  it('displays the next step when viewing a complete step', async () => {
    await wrapper.setProps({
      statusStates: [2, 2, 0, 0, 0],
      viewingStep: InstructionStep.RecordAppMaps,
    });

    expect(wrapper.find('.status-message__prompt').text()).toMatch(/Next step:\s+Open an AppMap/gm);
    expect(wrapper.find('button').text()).toBe('Next step: Explore AppMaps');
  });

  it('has no next step on the final step once complete', async () => {
    await wrapper.setProps({
      statusStates: Array(InstructionStep.NumSteps).fill(StepStatus.Completed),
      viewingStep: InstructionStep.NumSteps - 1,
    });

    expect(
      wrapper
        .find('.status-message__progress-indicator.status-message__progress-indicator--success')
        .isVisible()
    ).toBe(true);
    expect(wrapper.findAll('.status-message__prompt').length).toBe(0);
    expect(wrapper.find('.status-message__heading').text()).toBe(
      `AppMap setup is complete for ${projectName}`
    );
  });

  it('declares success when all steps are complete', async () => {
    await wrapper.setProps({
      statusStates: Array(InstructionStep.NumSteps).fill(StepStatus.Completed),
      viewingStep: InstructionStep.RecordAppMaps,
    });

    expect(wrapper.find('[data-cy="header"]').text()).toBe(
      `AppMap setup is complete for ${projectName}`
    );
    expect(wrapper.find('[data-cy="next-step"]').text()).toBe('Next step: Explore AppMaps');
  });

  it('does not show a next step when everything is complete and the page is runtime analysis', async () => {
    await wrapper.setProps({
      statusStates: Array(InstructionStep.NumSteps).fill(StepStatus.Completed),
      viewingStep: InstructionStep.RuntimeAnalysis,
    });

    expect(wrapper.find('[data-cy="header"]').text()).toBe(
      `AppMap setup is complete for ${projectName}`
    );
    expect(wrapper.findAll('[data-cy="next-step"]').length).toBe(0);
  });

  it('prompts the user to go back if a previous step changes to be incomplete', async () => {
    await wrapper.setProps({
      statusStates: [2, 1, 2, 2, 2],
      viewingStep: InstructionStep.ExploreAppMaps,
    });

    expect(wrapper.find('.status-message__prompt').text()).toMatch(/Go\s+back\s+and\s+record/gm);
  });

  it('uses proper pluralization', async () => {
    await wrapper.setProps({
      statusStates: [2, 2, 0, 0, 0],
      viewingStep: InstructionStep.RecordAppMaps,
    });
    expect(wrapper.text()).toContain(`${numAppMaps} AppMaps have been recorded for ${projectName}`);

    await wrapper.setProps({
      numAppMaps: 1,
    });
    expect(wrapper.text()).toContain(`1 AppMap has been recorded for ${projectName}`);
  });
});
