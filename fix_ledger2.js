const fs = require('fs');
let c = fs.readFileSync('c:/Programming/Aureum/Aureum/js/ledger.js', 'utf8');
const lines = c.split('\n');

// Remove line 128 (0-indexed: 127) - the duplicate showToast
lines.splice(127, 1);

fs.writeFileSync('c:/Programming/Aureum/Aureum/js/ledger.js', lines.join('\n'));
console.log('Done');