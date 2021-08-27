/* eslint-disable no-restricted-syntax */
import { join } from 'path';
import tmp from 'tmp';
import fs from 'fs-extra';

import {
  PoetryInstaller,
  PipInstaller,
} from '../../../src/cmds/agentInstaller/pythonAgentInstaller';

tmp.setGracefulCleanup();

const fixtureDir = join(__dirname, '..', 'fixtures', 'python');

function getProjectDirectory(projectType) {
  const projectFixtures = join(fixtureDir, projectType);
  const projectDir = tmp.dirSync({} as any).name;

  fs.copySync(projectFixtures, projectDir);

  return projectDir;
}

describe('Python Agent Installation', () => {
  describe('poetry support', () => {
    let btInstaller: PoetryInstaller;

    beforeAll(() => {
      btInstaller = new PoetryInstaller(getProjectDirectory('poetry'));
    });

    it('detects poetry project', async () => {
      expect(btInstaller.available()).resolves.toBe(true);
    });

    it('provides the correct verify command', async () => {
      const cmdStruct = btInstaller.verifyCommand();
      expect(cmdStruct.program).toBe('poetry');
      expect(cmdStruct.args).toEqual([
        'add',
        '--dev',
        '--allow-prereleases',
        'appmap',
      ]);
    });

    it('provides the correct init command', async () => {
      const cmdStruct = btInstaller.initCommand();
      expect(cmdStruct.program).toBe('poetry');
      expect(cmdStruct.args).toEqual(['run', 'appmap-agent-init']);
    });

    describe('pip support', () => {
      let btInstaller: PipInstaller;
      let projectDirectory: string;

      beforeAll(() => {
        projectDirectory = getProjectDirectory('pip');
        btInstaller = new PipInstaller(projectDirectory);
      });

      it('detects pip project', async () => {
        expect(btInstaller.available()).resolves.toBe(true);
      });

      it('provides the correct verify command', async () => {
        const cmdStruct = btInstaller.verifyCommand();
        expect(cmdStruct.program).toBe('pip');
        expect(cmdStruct.args).toEqual(['install', '-r', 'requirements.txt']);
      });

      it('adds appmap to requirements.txt when missing', async () => {
        const status = await btInstaller.installAgent();
        const requirementsTxt = fs.readFileSync(
          join(projectDirectory, 'requirements.txt'),
          'utf8'
        );
        expect(requirementsTxt).toMatch(/^appmap>=/);
      });

      it('replaces existing appmap in requirements.txt', async () => {
        const requirementsPath = join(projectDirectory, 'requirements.txt');
        fs.writeFileSync(requirementsPath, ' appmap == 1.0.0');

        const status = await btInstaller.installAgent();
        const requirementsTxt = fs.readFileSync(
          join(projectDirectory, 'requirements.txt'),
          'utf8'
        );
        expect(requirementsTxt).toMatch(/^appmap>=/);
      });

      it("doesn't munge a non-matching requirement", async () => {
        const requirementsPath = join(projectDirectory, 'requirements.txt');
        fs.writeFileSync(requirementsPath, ' not-appmap == 1.0.0');

        const status = await btInstaller.installAgent();
        const requirementsTxt = fs.readFileSync(
          join(projectDirectory, 'requirements.txt'),
          'utf8'
        );
        expect(requirementsTxt).toMatch(/^appmap>=/m);
        expect(requirementsTxt).toMatch(/^ not-appmap == 1.0.0/m);
      });

      it('provides the correct init command', async () => {
        const cmdStruct = btInstaller.initCommand();
        expect(cmdStruct.program).toBe('appmap-agent-init');
        expect(cmdStruct.args).toEqual([]);
      });
    });
  });
});
