const fs = require('fs');
const path = require('path');

console.log('--- Applying legitimate fixes ---');

// 1. Fix candidates.js
const candidatesPath = path.join('pages', 'candidates', 'candidates.js');
if (fs.existsSync(candidatesPath)) {
    let content = fs.readFileSync(candidatesPath, 'utf8');

    // Expand settingLog search
    const oldLogFind = 'const settingLog = candidate.teleapoLogs.find(l => l.result && l.result.includes("設定"));';
    const newLogFind = 'const settingLog = candidate.teleapoLogs.find(l => l.result && (l.result.includes("設定") || l.result.includes("着座")));';
    if (content.includes(oldLogFind)) {
        content = content.replace(oldLogFind, newLogFind);
        console.log('Success: Expanded settingLog search in candidates.js');
    }

    // Change Setup Date type to datetime-local
    const oldSetupDate = '{ label: "設定日", value: scheduleConfirmedAt, path: "scheduleConfirmedAt", type: "date" },';
    const newSetupDate = '{ label: "設定日", value: scheduleConfirmedAt, path: "scheduleConfirmedAt", type: "datetime-local" },';
    if (content.includes(oldSetupDate)) {
        content = content.replace(oldSetupDate, newSetupDate);
        console.log('Success: Changed Setup Date type in candidates.js');
    }

    fs.writeFileSync(candidatesPath, content, 'utf8');
}

// 2. Fix teleapo.js
const teleapoPath = path.join('pages', 'teleapo', 'teleapo.js');
if (fs.existsSync(teleapoPath)) {
    let content = fs.readFileSync(teleapoPath, 'utf8');

    // Add csStatus to normalizeCandidateTask return object
    const oldReturn = /return \{\s+candidateId,\s+candidateName,\s+phaseText,\s+validApplication,\s+registeredAt,\s+phone,\s+contactPreferredTime,\s+isUncontacted,\s+\};/;
    const newReturn = `return {
    candidateId,
    candidateName,
    phaseText,
    validApplication,
    registeredAt,
    phone,
    contactPreferredTime,
    isUncontacted,
    csStatus: candidate.csStatus ?? candidate.cs_status ?? "",
  };`;

    if (oldReturn.test(content)) {
        content = content.replace(oldReturn, newReturn);
        console.log('Success: Added csStatus to normalizeCandidateTask in teleapo.js');
    }

    // Update rebuildCsTaskCandidates filter
    const oldFilter = '.filter((c) => c && c.validApplication && c.isUncontacted);';
    const newFilter = '.filter((c) => c && c.validApplication && !c.csStatus);';
    if (content.includes(oldFilter)) {
        content = content.replace(oldFilter, newFilter);
        console.log('Success: Updated CS Task filter in teleapo.js');
    }

    fs.writeFileSync(teleapoPath, content, 'utf8');
}

console.log('Fixes application attempt finished.');
