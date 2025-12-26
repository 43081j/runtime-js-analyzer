import {type SgNode} from '@ast-grep/napi';
import type {ExtractedScript, AnalysisResult} from '../types.js';

export interface Analyzer {
  analyze(root: SgNode, script: ExtractedScript): void;
  getResult(): Promise<Partial<AnalysisResult>>;
}
