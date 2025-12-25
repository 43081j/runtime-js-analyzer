import {chromium} from 'playwright';
import {mkdtemp, writeFile, readFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {ts, type NapiConfig, type SgNode} from '@ast-grep/napi';

const TEMP_DIR_PREFIX = 'runtime-js-scan-';

export interface ExtractedScript {
  url: string;
  filePath: string;
}

export interface ExtractedScriptResult {
  scripts: ExtractedScript[];
  tempDir: string;
}

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

export interface WebPackAnalysisResult {
  duplicateFunctionCount: number;
}

export interface CustomElementAnalysisResult {
  customElementCount: number;
}

export interface AnalysisResult {
  webpack: WebPackAnalysisResult | null;
  customElements: CustomElementAnalysisResult;
}

interface Analyzer<T> {
  analyze(root: SgNode): void;
  summary(): T;
}

const webpackChunkRule: NapiConfig = {
  rule: {
    pattern: {
      context:
        '(globalThis.$NAME = globalThis.$NAME || []).push([$KEYS, $OBJ])',
      strictness: 'relaxed'
    }
  },
  constraints: {
    NAME: {
      regex: '^webpackChunk_'
    }
  }
};

const customElementRule: NapiConfig = {
  rule: {
    any: [
      {
        pattern: {
          context: 'customElements.define($_, $_)',
          strictness: 'relaxed'
        }
      },
      {
        pattern: {
          context: 'window.customElements.define($_, $_)',
          strictness: 'relaxed'
        }
      }
    ]
  }
};

function createWebpackAnalyzer(): Analyzer<WebPackAnalysisResult | null> {
  const seenHashes = new Set<string>();
  let duplicateFunctionCount = 0;
  let foundWebpack = false;

  return {
    analyze(root) {
      const webpackChunk = root.findAll(webpackChunkRule);

      if (webpackChunk.length === 0) {
        return;
      }

      foundWebpack = true;

      for (const chunk of webpackChunk) {
        const obj = chunk.getMatch('OBJ');
        if (!obj) {
          continue;
        }

        for (const child of obj.children()) {
          if (child.kind() !== 'pair') {
            continue;
          }

          const value = child.field('value');
          if (!value) {
            continue;
          }

          const valueText = value.text();
          const hash = createHash('sha256').update(valueText).digest('hex');

          if (seenHashes.has(hash)) {
            duplicateFunctionCount++;
          } else {
            seenHashes.add(hash);
          }
        }
      }
    },

    summary() {
      if (!foundWebpack) {
        return null;
      }
      return {duplicateFunctionCount};
    }
  };
}

function createCustomElementAnalyzer(): Analyzer<CustomElementAnalysisResult> {
  let customElementCount = 0;

  return {
    analyze(root) {
      const customElements = root.findAll(customElementRule);
      customElementCount += customElements.length;
    },

    summary() {
      return {customElementCount};
    }
  };
}

export async function analyzeScripts(
  scripts: ExtractedScript[]
): Promise<AnalysisResult> {
  const webpackAnalyzer = createWebpackAnalyzer();
  const customElementAnalyzer = createCustomElementAnalyzer();

  for (const script of scripts) {
    let ast;

    try {
      const code = await readFile(script.filePath, 'utf-8');
      ast = ts.parse(code);
    } catch {
      continue;
    }

    const root = ast.root();
    webpackAnalyzer.analyze(root);
    customElementAnalyzer.analyze(root);
  }

  return {
    webpack: webpackAnalyzer.summary(),
    customElements: customElementAnalyzer.summary()
  };
}
