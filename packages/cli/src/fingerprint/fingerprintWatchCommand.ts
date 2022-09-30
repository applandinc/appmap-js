import { FSWatcher, watch } from 'chokidar';
import { removeSync, outputFileSync } from 'fs-extra';
import { join, resolve } from 'path';
import { verbose, listAppMapFiles } from '../utils';
import FingerprintQueue from './fingerprintQueue';

export default class FingerprintWatchCommand {
  private pidfilePath: string | undefined;
  private fpQueue: FingerprintQueue;
  public watcher?: FSWatcher;
  private poller?: FSWatcher;

  constructor(private directory: string) {
    this.pidfilePath = process.env.APPMAP_WRITE_PIDFILE && join(this.directory, 'index.pid');
    this.fpQueue = new FingerprintQueue();
  }

  removePidfile() {
    if (this.pidfilePath) {
      console.log(`Removing ${this.pidfilePath}`);
      removeSync(this.pidfilePath);
      this.pidfilePath = undefined;
    }
  }

  async execute() {
    // Index existing AppMap files
    await listAppMapFiles(this.directory, (file) => this.fpQueue.push(file));
    this.fpQueue.process();

    const glob = `${this.directory}/**/*.appmap.json`;
    this.watcher = watch(glob, {
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/.git/**'],
    });
    this.poller = watch(glob, {
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/.git/**'],
      usePolling: true,
      interval: 1000,
      persistent: false,
    });

    // eslint-disable-next-line no-restricted-syntax
    for (const ch of [this.watcher, this.poller]) {
      ch.on('add', this.added.bind(this))
        .on('change', this.changed.bind(this))
        .on('unlink', this.removed.bind(this));
    }

    await Promise.all(
      [this.watcher, this.poller].map((ch) => new Promise((resolve) => ch.on('ready', resolve)))
    );
    this.ready();
  }

  async close() {
    await Promise.all([this.watcher, this.poller].map((ch) => ch?.close()));
    this.removePidfile();
    this.watcher = undefined;
    this.poller = undefined;
  }

  added(file: string) {
    if (verbose()) {
      console.warn(`AppMap added: ${file}`);
    }
    this.enqueue(file);
  }

  changed(file: string) {
    if (verbose()) {
      console.warn(`AppMap changed: ${file}`);
    }
    this.enqueue(file);
  }

  removed(file: string) {
    console.warn(`TODO: AppMap removed: ${file}`);
  }

  ready() {
    if (this.pidfilePath) {
      outputFileSync(this.pidfilePath, `${process.pid}`);
      process.on('exit', this.removePidfile.bind(this));
    }
    if (verbose()) {
      console.warn(`Watching appmaps in ${resolve(process.cwd(), this.directory)}`);
    }
  }

  enqueue(file: string) {
    // This shouldn't be necessary, but it's passing through the wrong file names.
    if (!file.includes('.appmap.json')) {
      return;
    }
    this.fpQueue.push(file);
  }
}
