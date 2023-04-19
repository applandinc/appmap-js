import { Browser } from 'puppeteer';
import { verbose } from '../utils';
import { serveAndOpenSequenceDiagram } from '../lib/serveAndOpen';
import assert from 'assert';
import BrowserRenderer from '../cmds/sequenceDiagram/browserRenderer';

export async function renderSequenceDiagramPNG(
  outputPath: string,
  diagramPath: string,
  browser: BrowserRenderer
): Promise<void> {
  return new Promise((resolve, reject) =>
    serveAndOpenSequenceDiagram(diagramPath, false, async (url) => {
      try {
        if (verbose()) console.warn(`Rendering PNG`);
        assert(browser, 'Browser not initialized');

        await browser.screenshot(url, outputPath);

        resolve();
      } catch (e) {
        reject(e);
      }
    })
  );
}
