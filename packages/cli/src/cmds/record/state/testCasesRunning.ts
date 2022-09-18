import RecordContext from '../recordContext';
import TestCaseRecording from '../testCaseRecording';
import { State } from '../types/state';
import testCasesComplete from './testCasesComplete';

export default async function testCasesRunning(recordContext: RecordContext): Promise<State> {
  await TestCaseRecording.waitFor(recordContext);

  await recordContext.populateAppMapCount();

  return testCasesComplete;
}
