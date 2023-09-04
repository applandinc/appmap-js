import assert from 'assert';
import { validateDiagram, ValidationResult } from '@appland/sequence-diagram';
import { SHOW_USER_APPMAP_DATA, SHOW_USER_DIAGRAM_DATA, INVALID_DIAGRAM_DATA } from '../util';

describe('validateDiagram', () => {
  it('returns Valid for a valid diagram', async () => {
    const result = await validateDiagram(SHOW_USER_DIAGRAM_DATA);
    assert.strictEqual(result, ValidationResult.Valid);
  });

  it('returns Invalid for an invalid diagram', async () => {
    const result = await validateDiagram(INVALID_DIAGRAM_DATA);
    assert.strictEqual(result, ValidationResult.Invalid);
  });

  it('returns AppMap for an AppMap object', async () => {
    const result = await validateDiagram(SHOW_USER_APPMAP_DATA);
    assert.strictEqual(result, ValidationResult.AppMap);
  });
});
