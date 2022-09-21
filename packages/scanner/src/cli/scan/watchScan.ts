import { writeFile } from 'fs/promises';
import * as chokidar from 'chokidar';

import Configuration from '../../configuration/types/configuration';

import { formatReport } from './formatReport';
import { default as buildScanner } from './scanner';
import { exists } from 'fs';
import { promisify } from 'util';
import { parseConfigFile } from '../../configuration/configurationProvider';
import assert from 'assert';
import path from 'path';

type WatchScanOptions = {
  appId?: string;
  appmapDir: string;
  configFile: string;
};

export class Watcher {
  config?: Configuration;
  appmapWatcher?: chokidar.FSWatcher;
  configWatcher?: chokidar.FSWatcher;

  constructor(private options: WatchScanOptions) {}

  async watch(): Promise<void> {
    await this.reloadConfig();

    this.configWatcher = chokidar.watch(this.options.configFile, {
      ignoreInitial: true,
    });
    this.configWatcher
      .on('add', this.reloadConfig.bind(this))
      .on('change', this.reloadConfig.bind(this));

    // Chokidar struggles with relative paths. Make sure the watch pattern is absolute.
    const watchPattern = path.resolve(this.options.appmapDir, '**', 'mtime');
    this.appmapWatcher = chokidar.watch(watchPattern, {
      ignoreInitial: false,
    });
    this.appmapWatcher
      .on('add', (filePath) => this.scan(filePath))
      .on('change', (filePath) => this.scan(filePath));
  }

  close(): void {
    if (!this.appmapWatcher) return;

    assert(
      this.configWatcher,
      `configWatcher should always be defined if appmapWatcher is defined`
    );

    this.appmapWatcher.close();
    this.configWatcher.close();
    this.appmapWatcher = undefined;
    this.configWatcher = undefined;
  }

  protected async scan(fileName: string): Promise<void> {
    assert(this.config, `config should always be loaded before appmapWatcher triggers a scan`);

    const pathTokens = fileName.split('/');
    const appmapDir = pathTokens.slice(0, pathTokens.length - 1).join('/');
    const appmapFile = [appmapDir, 'appmap.json'].join('.');
    const reportFile = [appmapDir, 'appmap-findings.json'].join('/');

    if (!(await promisify(exists)(appmapFile))) return;

    const scanner = await buildScanner(true, this.config, [appmapFile]);

    const rawScanResults = await scanner.scan();

    // Always report the raw data
    await writeFile(reportFile, formatReport(rawScanResults));
  }

  protected async reloadConfig(): Promise<void> {
    this.config = await parseConfigFile(this.options.configFile);
  }
}

export default async function watchScan(options: WatchScanOptions): Promise<void> {
  return new Watcher(options).watch();
}
