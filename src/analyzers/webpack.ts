import {createHash} from 'node:crypto';
import {type NapiConfig} from '@ast-grep/napi';
import {type Analyzer} from './types.js';

export interface WebPackAnalysisResult {
  duplicateFunctionCount: number;
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

export function createWebpackAnalyzer(): Analyzer<WebPackAnalysisResult | null> {
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
