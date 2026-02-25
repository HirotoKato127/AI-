const fs = require('fs');
const path = require('path');

const filePath = path.join('pages', 'teleapo', 'teleapo.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

const result = {
    normalizeRange: lines.slice(2340, 2360),
    rebuildRange: lines.slice(2385, 2400)
};

fs.writeFileSync('inspect_lines.json', JSON.stringify(result, null, 2), 'utf8');
console.log('Inspection file created: inspect_lines.json');
