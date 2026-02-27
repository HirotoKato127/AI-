const fs = require('fs');
const path = require('path');

const targetPath = 'c:/Users/hirot/OneDrive/ドキュメント/GitHub/AI-/pages/candidates/candidates.js';
let content = fs.readFileSync(targetPath, 'utf8');

const target1 = `  candidate.addressDetail = candidate.addressDetail ?? candidate.address_detail ?? "";\n  candidate.address = candidate.address ?? [candidate.addressPref, candidate.addressCity, candidate.addressDetail]`;
const replace1 = `  candidate.addressDetail = candidate.addressDetail ?? candidate.address_detail ?? "";\n  candidate.workLocation = candidate.workLocation ?? candidate.work_location ?? "";\n  candidate.address = candidate.address ?? [candidate.addressPref, candidate.addressCity, candidate.addressDetail]`;

const target2 = `    relocationImpossibleReason: candidate.relocationImpossibleReason,\n    personalConcerns: candidate.personalConcerns,\n    desiredInterviewDates: candidate.desiredInterviewDates,`;
const replace2 = `    relocationImpossibleReason: candidate.relocationImpossibleReason,\n    personalConcerns: candidate.personalConcerns,\n    workLocation: candidate.workLocation,\n    desiredInterviewDates: candidate.desiredInterviewDates,`;

const target3 = `    { label: "番地・建物", value: candidate.addressDetail, path: "addressDetail", span: "full" },\n    { label: "最終学歴", value: candidate.education, path: "education", span: "full" },`;
const replace3 = `    { label: "番地・建物", value: candidate.addressDetail, path: "addressDetail", span: "full" },\n    { label: "勤務地", value: candidate.workLocation, path: "workLocation", span: "full" },\n    { label: "最終学歴", value: candidate.education, path: "education", span: "full" },`;

let success = true;

const replaceTarget = (target, replaceVal, id) => {
    if (!content.includes(target)) {
        console.log(`Could not find ${id}`);
        // try replacing \n with \r\n
        const t = target.replace(/\n/g, '\r\n');
        const r = replaceVal.replace(/\n/g, '\r\n');
        if (content.includes(t)) {
            content = content.replace(t, r);
            console.log(`Replaced ${id} with CRLF`);
        } else {
            console.log(`Failed to replace ${id} even with CRLF`);
            success = false;
        }
    } else {
        content = content.replace(target, replaceVal);
        console.log(`Replaced ${id}`);
    }
};

replaceTarget(target1, replace1, "target1");
replaceTarget(target2, replace2, "target2");
replaceTarget(target3, replace3, "target3");

if (success) {
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log("Successfully updated candidates.js");
} else {
    process.exit(1);
}
