import {parseArgs} from 'node:util';
import {rm} from 'node:fs/promises';
import * as prompts from '@clack/prompts';
import {extractScripts, analyzeScripts} from './main.js';

const args = parseArgs({
  options: {},
  allowPositionals: true
});

async function main() {
  const url = args.positionals[0];

  if (!url) {
    prompts.log.error('Usage: cli <URL>');
    process.exit(1);
  }

  prompts.intro('Runtime JS Scanner');

  const extractSpinner = prompts.spinner();
  extractSpinner.start('Extracting JavaScript files');

  const result = await extractScripts(url);
  extractSpinner.stop(`Extracted ${result.scripts.length} script(s)`);

  try {
    const analyzeSpinner = prompts.spinner();
    analyzeSpinner.start('Analyzing scripts');

    const analysis = await analyzeScripts(result.scripts);
    analyzeSpinner.stop('Analysis complete');

    prompts.log.info('Project');
    prompts.log.message(`  URL: ${url}`);
    if (analysis.webpack) {
      prompts.log.message('  Bundler: webpack');
    }

    prompts.log.info('Custom Elements');
    prompts.log.message(
      `  Found ${analysis.customElements.customElementCount} custom element definition(s)`
    );

    if (analysis.webpack) {
      prompts.log.info('Webpack Analysis');
      prompts.log.message(
        `  Duplicate functions: ${analysis.webpack.duplicateFunctionCount}`
      );
    }

    prompts.outro('Scan complete!');
  } catch (error) {
    prompts.log.error('Error during analysis');
    console.error(error);
    process.exit(1);
  } finally {
    await rm(result.tempDir, {recursive: true, force: true});
  }
}

main();
