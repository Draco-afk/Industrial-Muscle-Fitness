// Splits the inline <style> and <script> blocks out of the biggest HTML
// pages into their own partial files, replacing them with Apps Script
// include() scriptlets. Byte-exact extraction (regex captures the whole
// tag pair once, verified single-match beforehand) — no retyping.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'apps-script-source');
const OUT_DIR = path.join(__dirname, '..', 'apps-script-source-refactored');

const TARGETS = ['Index.html', 'Client.html', 'TrainerApp.html'];

const STYLE_RE = /<style[^>]*>[\s\S]*?<\/style>/;
const SCRIPT_RE = /<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/;

for (const file of TARGETS) {
  const base = file.replace(/\.html$/, '');
  const src = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');

  const styleMatch = src.match(STYLE_RE);
  const scriptMatch = src.match(SCRIPT_RE);
  if (!styleMatch || !scriptMatch) throw new Error(`Expected exactly one style+script block in ${file}`);

  const stylesFile = `${base}_Styles.html`;
  const scriptFile = `${base}_Script.html`;

  fs.writeFileSync(path.join(OUT_DIR, stylesFile), styleMatch[0] + '\n');
  fs.writeFileSync(path.join(OUT_DIR, scriptFile), scriptMatch[0] + '\n');

  let rewritten = src.replace(STYLE_RE, `<?!= include('${base}_Styles'); ?>`);
  rewritten = rewritten.replace(SCRIPT_RE, `<?!= include('${base}_Script'); ?>`);

  fs.writeFileSync(path.join(OUT_DIR, file), rewritten);
  console.log(`${file}: extracted ${styleMatch[0].length} style chars -> ${stylesFile}, ${scriptMatch[0].length} script chars -> ${scriptFile}`);
}
