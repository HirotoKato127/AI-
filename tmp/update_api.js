const fs = require('fs');
const path = require('path');

const targetPath = 'c:/Users/hirot/OneDrive/ドキュメント/GitHub/AI-/tmp/lambda/prod-candidates-detail/index.mjs';
let content = fs.readFileSync(targetPath, 'utf8');

const target1 = `        relocationImpossibleReason: b.relocation_impossible_reason ?? "",\n        personalConcerns: b.personal_concerns ?? "",\n\n        selectionProgress,`;
const replace1 = `        relocationImpossibleReason: b.relocation_impossible_reason ?? "",\n        personalConcerns: b.personal_concerns ?? "",\n        workLocation: b.work_location ?? "",\n\n        selectionProgress,`;

const target2 = `              relocation_possible = COALESCE($41, relocation_possible),\n              relocation_impossible_reason = COALESCE($42, relocation_impossible_reason),\n              personal_concerns = COALESCE($43, personal_concerns)\n            WHERE id = $1`;
const replace2 = `              relocation_possible = COALESCE($41, relocation_possible),\n              relocation_impossible_reason = COALESCE($42, relocation_impossible_reason),\n              personal_concerns = COALESCE($43, personal_concerns),\n              work_location = COALESCE($44, work_location)\n            WHERE id = $1`;

const target3 = `                        toBooleanOrNull(payload.relocationPossible),\n                        emptyToNull(payload.relocationImpossibleReason),\n                        emptyToNull(payload.personalConcerns)\n                    ];`;
const replace3 = `                        toBooleanOrNull(payload.relocationPossible),\n                        emptyToNull(payload.relocationImpossibleReason),\n                        emptyToNull(payload.personalConcerns),\n                        emptyToNull(payload.workLocation ?? payload.work_location)\n                    ];`;

let success = true;

if (!content.includes(target1)) {
    console.log("Could not find target1");
    // try replacing \n with \r\n
    const t1 = target1.replace(/\n/g, '\r\n');
    const r1 = replace1.replace(/\n/g, '\r\n');
    if (content.includes(t1)) {
        content = content.replace(t1, r1);
        console.log("Replaced target1 with CRLF");
    } else {
        success = false;
    }
} else {
    content = content.replace(target1, replace1);
    console.log("Replaced target1");
}

if (!content.includes(target2)) {
    console.log("Could not find target2");
    const t2 = target2.replace(/\n/g, '\r\n');
    const r2 = replace2.replace(/\n/g, '\r\n');
    if (content.includes(t2)) {
        content = content.replace(t2, r2);
        console.log("Replaced target2 with CRLF");
    } else {
        success = false;
    }
} else {
    content = content.replace(target2, replace2);
    console.log("Replaced target2");
}

if (!content.includes(target3)) {
    console.log("Could not find target3");
    const t3 = target3.replace(/\n/g, '\r\n');
    const r3 = replace3.replace(/\n/g, '\r\n');
    if (content.includes(t3)) {
        content = content.replace(t3, r3);
        console.log("Replaced target3 with CRLF");
    } else {
        success = false;
    }
} else {
    content = content.replace(target3, replace3);
    console.log("Replaced target3");
}

if (success) {
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log("Successfully updated index.mjs");
} else {
    process.exit(1);
}
