import {type NapiConfig} from '@ast-grep/napi';
import {type Analyzer} from './types.js';

export interface CustomElementAnalysisResult {
  customElementCount: number;
}

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

export function createCustomElementAnalyzer(): Analyzer<CustomElementAnalysisResult> {
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
