import {type SgNode} from '@ast-grep/napi';

export type Bundler = 'webpack' | 'rolldown';

export interface ExtractedScript {
  url: string;
  filePath: string;
}

export interface ExtractedScriptResult {
  scripts: ExtractedScript[];
  tempDir: string;
}

export interface WebPackAnalysisResult {
  duplicateFunctionCount: number;
  duplicatedBytes: number;
}

export interface CustomElementAnalysisResult {
  customElementCount: number;
}

export interface AnalysisResult {
  bundlers: Bundler[];
  bundlerAnalysis: {
    webpack?: WebPackAnalysisResult;
    rolldown?: Record<string, never>; // Empty for now, placeholder for future metadata
  };
  customElements: CustomElementAnalysisResult;
}

export interface Analyzer {
  analyze(root: SgNode, script: ExtractedScript): void;
  getResult(): Promise<Partial<AnalysisResult>>;
}
