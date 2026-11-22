const fs = require('fs');
let c = fs.readFileSync('c:/Programming/Aureum/Aureum/js/ledger.js', 'utf8');

// Remove the duplicate showToast line (the old one without tierInfo)
c = c.replace(/    showToast\(\{title:'🧹 Chore Logged',subtitle:`\$\{hrs\}h saved\$\{note\?\`: \\\"$\{note\}\\\"`:''\}`,icon:'🏰',tier:'silver',originEvt:e\}\);\r?\n/, '');

fs.writeFileSync('c:/Programming/Aureum/Aureum/js/ledger.js', c);
console.log('Done');