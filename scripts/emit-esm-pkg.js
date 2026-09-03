// Marks dist/esm as ES modules so Node resolves it correctly under the
// "import" export condition, while the package itself stays CommonJS.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'dist', 'esm');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, 'package.json'),
  JSON.stringify({ type: 'module', sideEffects: false }, null, 2) + '\n'
);
console.log('wrote dist/esm/package.json');
