'use strict';
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'apps-script-source');
const OUT_DIR = path.join(__dirname, '..', 'apps-script-source-refactored');

const TARGETS = ['Index.html', 'Client.html', 'TrainerApp.html'];
let ok = true;

for (const file of TARGETS) {
  const base = file.replace(/\.html$/, '');
  const original = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
  let refactored = fs.readFileSync(path.join(OUT_DIR, file), 'utf8');

  const stylesPartial = fs.readFileSync(path.join(OUT_DIR, `${base}_Styles.html`), 'utf8').replace(/\n$/, '');
  const scriptPartial = fs.readFileSync(path.join(OUT_DIR, `${base}_Script.html`), 'utf8').replace(/\n$/, '');

  const reconstructed = refactored
    .replace(`<?!= include('${base}_Styles'); ?>`, stylesPartial)
    .replace(`<?!= include('${base}_Script'); ?>`, scriptPartial);

  if (reconstructed === original) {
    console.log(`${file}: OK (reconstructs byte-identical)`);
  } else {
    console.error(`${file}: MISMATCH`);
    ok = false;
    // show first diff position
    for (let i = 0; i < Math.max(reconstructed.length, original.length); i++) {
      if (reconstructed[i] !== original[i]) {
        console.error('  first diff at char', i, JSON.stringify(original.slice(i-30, i+30)), 'vs', JSON.stringify(reconstructed.slice(i-30, i+30)));
        break;
      }
    }
  }
}

process.exit(ok ? 0 : 1);
