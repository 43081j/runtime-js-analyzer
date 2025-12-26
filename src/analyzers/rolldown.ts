import {type Analyzer} from '../types.js';

const rolldownRuntimePattern = /rolldown-runtime\.[a-zA-Z0-9]+\.mjs$/;

export function createRolldownAnalyzer(): Analyzer {
  let detected = false;

  return {
    analyze(_root, script) {
      if (rolldownRuntimePattern.test(script.url)) {
        detected = true;
      }
    },

    async getResult() {
      if (!detected) {
        return {};
      }

      return {
        bundlers: ['rolldown'],
        bundlerAnalysis: {
          rolldown: {}
        }
      };
    }
  };
}
