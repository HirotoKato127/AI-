const fs = require('fs');

const findings = {};

function findDollars(filename) {
    if (!fs.existsSync(filename)) {
        findings[filename] = "not found";
        return;
    }
    const content = fs.readFileSync(filename, 'utf8');
    const lines = content.split('\n');
    const fileFindings = [];
    lines.forEach((line, i) => {
        if (line.includes('$')) {
            fileFindings.push({ line: i + 1, content: line.trim() });
        }
    });
    findings[filename] = fileFindings;
}

findDollars('scripts/router.js');
findDollars('pages/teleapo/teleapo.js');

fs.writeFileSync('dollar_findings.json', JSON.stringify(findings, null, 2), 'utf8');
console.log('Results saved to dollar_findings.json');
