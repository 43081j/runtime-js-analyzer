import {createHash} from 'node:crypto';
import {type NapiConfig} from '@ast-grep/napi';
import {type Analyzer} from '../types.js';

const webpackChunkRule: NapiConfig = {
  rule: {
    any: [
      {
        pattern: {
          context:
            '(globalThis.$NAME = globalThis.$NAME || []).push([$KEYS, $OBJ])',
          strictness: 'relaxed'
        }
      },
      {
        pattern: {
          context: '(self.$NAME = self.$NAME || []).push([$KEYS, $OBJ])',
          strictness: 'relaxed'
        }
      }
    ]
  },
  constraints: {
    NAME: {
      regex: '^webpackChunk'
    }
  }
};

export function createWebpackAnalyzer(): Analyzer {
  const seenHashes = new Map<string, number>();
  let duplicateFunctionCount = 0;
  let duplicatedBytes = 0;
  let foundWebpack = false;

  return {
    analyze(root, _script) {
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
          const byteLength = Buffer.byteLength(valueText, 'utf8');

          const existingByteLength = seenHashes.get(hash);
          if (existingByteLength !== undefined) {
            duplicateFunctionCount++;
            duplicatedBytes += existingByteLength;
          } else {
            seenHashes.set(hash, byteLength);
          }
        }
      }
    },

    async getResult() {
      if (!foundWebpack) {
        return {};
      }

      return {
        bundlers: ['webpack'],
        bundlerAnalysis: {
          webpack: {duplicateFunctionCount, duplicatedBytes}
        }
      };
    }
  };
}
