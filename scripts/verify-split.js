// Verifies that every FunctionDeclaration and top-level var from the original
// Code.js appears byte-for-byte identical somewhere in apps-script-source-refactored/,
// exactly once, with nothing extra and nothing missing.
'use strict';
const acorn = require('acorn');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'apps-script-source', 'Code.js');
const OUT_DIR = path.join(__dirname, '..', 'apps-script-source-refactored');

function extractDecls(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  const funcs = new Map(); // name -> normalized body text
  const vars = [];
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration') {
      funcs.set(node.id.name, src.slice(node.start, node.end));
    } else if (node.type === 'VariableDeclaration') {
      vars.push(src.slice(node.start, node.end));
    }
  }
  return { funcs, vars };
}

const original = extractDecls(SRC);

const combinedFuncs = new Map();
const combinedVars = [];
const dupFuncNames = [];

for (const file of fs.readdirSync(OUT_DIR)) {
  if (!file.endsWith('.js')) continue;
  const { funcs, vars } = extractDecls(path.join(OUT_DIR, file));
  for (const [name, body] of funcs) {
    if (combinedFuncs.has(name)) dupFuncNames.push(name);
    combinedFuncs.set(name, body);
  }
  combinedVars.push(...vars);
}

let ok = true;

// 1. Every original function must exist in combined, with identical text.
for (const [name, body] of original.funcs) {
  if (!combinedFuncs.has(name)) {
    console.error('MISSING function:', name);
    ok = false;
  } else if (combinedFuncs.get(name) !== body) {
    console.error('MODIFIED function body:', name);
    ok = false;
  }
}

// 2. No extra functions in combined that weren't in original.
for (const name of combinedFuncs.keys()) {
  if (!original.funcs.has(name)) {
    console.error('EXTRA function not in original:', name);
    ok = false;
  }
}

// 3. No duplicates.
if (dupFuncNames.length) {
  console.error('DUPLICATE functions across files:', dupFuncNames);
  ok = false;
}

// 4. Var declarations: same multiset of exact text.
const sortedOrigVars = [...original.vars].sort();
const sortedCombinedVars = [...combinedVars].sort();
if (JSON.stringify(sortedOrigVars) !== JSON.stringify(sortedCombinedVars)) {
  console.error('VAR DECLARATIONS MISMATCH');
  console.error('Original count:', sortedOrigVars.length, 'Combined count:', sortedCombinedVars.length);
  ok = false;
}

console.log('Original function count:', original.funcs.size);
console.log('Combined function count:', combinedFuncs.size);
console.log(ok ? 'VERIFICATION PASSED: every function and constant is byte-identical, no loss, no duplication.' : 'VERIFICATION FAILED');
process.exit(ok ? 0 : 1);
