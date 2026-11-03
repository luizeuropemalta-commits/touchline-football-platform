import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';

function compile(file: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const source = readFileSync(new URL(`../../components/touchline/market/${file}.tsx`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(js, { exports, require(name: string) {
    if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return jsx;
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected monetary fixture dependency: ${name}`);
  } });
  return exports;
}
export const creditAmountModule = compile('TouchlineCreditAmount', { './TouchlineMarketMarks': compile('TouchlineMarketMarks', {}) });
