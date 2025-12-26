import {type SgNode} from '@ast-grep/napi';

export interface Analyzer<T> {
  analyze(root: SgNode): void;
  summary(): T;
}
