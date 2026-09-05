import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** Execute the actual module against controlled I/O, without needing a GPU. */
export function loadTs(file, imports, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (id) => {
      if (!(id in imports)) throw new Error(`Missing test import: ${id}`);
      return imports[id];
    },
    performance, Blob, Error, DOMException, Map, Set, structuredClone,
    crypto: globalThis.crypto, clearTimeout, console,
    ...globals,
  }, { filename: file });
  return exports;
}
