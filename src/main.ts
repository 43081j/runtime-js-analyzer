import {chromium} from 'playwright';
import {mkdtemp, writeFile, readFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {ts} from '@ast-grep/napi';
import {createWebpackAnalyzer} from './analyzers/webpack.js';
import {createCustomElementAnalyzer} from './analyzers/customElement.js';
import {createRolldownAnalyzer} from './analyzers/rolldown.js';
import type {
  ExtractedScript,
  ExtractedScriptResult,
  AnalysisResult
} from './types.js';

const TEMP_DIR_PREFIX = 'runtime-js-scan-';

export type {
  Bundler,
  ExtractedScript,
  ExtractedScriptResult,
  AnalysisResult,
  WebPackAnalysisResult,
  CustomElementAnalysisResult
} from './types.js';

export async function extractScripts(
  url: string
): Promise<ExtractedScriptResult> {
  const scripts: ExtractedScript[] = [];
  const tempDir = await mkdtemp(join(tmpdir(), TEMP_DIR_PREFIX));
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('response', async (response) => {
      const contentType = response.headers()['content-type'] || '';
      const resourceUrl = response.url();

      if (
        contentType.includes('javascript') ||
        contentType.includes('ecmascript') ||
        resourceUrl.endsWith('.js') ||
        resourceUrl.endsWith('.mjs')
      ) {
        try {
          const body = await response.body();
          const hash = createHash('sha256')
            .update(resourceUrl)
            .digest('hex')
            .slice(0, 16);
          const filePath = join(tempDir, `${hash}.js`);
          const writeStream = createWriteStream(filePath);
          await pipeline(Readable.from(body), writeStream);
          scripts.push({url: resourceUrl, filePath});
        } catch (err) {
          // Ignore responses we can't read
        }
      }
    });

    await page.goto(url, {waitUntil: 'networkidle'});

    const inlineScripts = await page.evaluate(() => {
      const scriptElements = document.querySelectorAll('script');
      const results: Array<{src: string | null; content: string}> = [];

      scriptElements.forEach((script) => {
        if (!script.src && script.textContent) {
          results.push({
            src: null,
            content: script.textContent
          });
        }
      });

      return results;
    });

    for (let i = 0; i < inlineScripts.length; i++) {
      const script = inlineScripts[i];
      const scriptUrl = `${url}#inline-${i}`;
      const filePath = join(tempDir, `inline-${i}.js`);
      await writeFile(filePath, script.content, 'utf-8');
      scripts.push({url: scriptUrl, filePath});
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return {scripts, tempDir};
}

export async function analyzeScripts(
  scripts: ExtractedScript[]
): Promise<AnalysisResult> {
  const analyzers = [
    createWebpackAnalyzer(),
    createRolldownAnalyzer(),
    createCustomElementAnalyzer()
  ];

  for (const script of scripts) {
    let ast;

    try {
      const code = await readFile(script.filePath, 'utf-8');
      ast = ts.parse(code);
    } catch {
      continue;
    }

    const root = ast.root();
    for (const analyzer of analyzers) {
      analyzer.analyze(root, script);
    }
  }

  let result: AnalysisResult = {
    bundlers: [],
    bundlerAnalysis: {},
    customElements: {customElementCount: 0}
  };

  for (const analyzer of analyzers) {
    const partial = await analyzer.getResult();
    result = {
      bundlers: [...result.bundlers, ...(partial.bundlers || [])],
      bundlerAnalysis: {...result.bundlerAnalysis, ...partial.bundlerAnalysis},
      customElements: {...result.customElements, ...partial.customElements}
    };
  }

  return result;
}
