import { vol } from 'memfs';
import { readAppMapContent } from '../../src/rpc/explain/index/appmap-index';
import { Metadata } from '@appland/models';

jest.mock('fs/promises', () => require('memfs').promises);

describe('readAppMapContent', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('reads appmap content from index files', async () => {
    const appmapName = '/appmaps/testAppMap';
    const metadata: Metadata = {
      name: 'Test AppMap',
      labels: ['test', 'appmap'],
      exception: { class: 'Exception', message: 'Test exception' },
      client: { name: 'Test client', version: '1.0.0', url: 'http://test.com' },
      recorder: { name: 'Test recorder' },
    };
    const classMap = [
      { name: 'query1', type: 'query', labels: [], children: [] },
      { name: 'route1', type: 'route', labels: [], children: [] },
    ];

    vol.fromJSON({
      [`${appmapName}/metadata.json`]: JSON.stringify(metadata),
      [`${appmapName}/classMap.json`]: JSON.stringify(classMap),
      [`${appmapName}/canonical.parameters.json`]: JSON.stringify(['param1', 'param2']),
    });

    const content = await readAppMapContent(`${appmapName}.appmap.json`);
    expect(content).toContain('Test AppMap');
    expect(content).toContain('test');
    expect(content).toContain('appmap');
    expect(content).toContain('Test exception');
    expect(content).toContain('query1');
    expect(content).toContain('route1');
    expect(content).toContain('param1');
    expect(content).toContain('param2');
  });
});
