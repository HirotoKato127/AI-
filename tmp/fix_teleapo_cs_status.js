const fs = require('fs');
const path = require('path');

const targetPath = 'c:/Users/hirot/OneDrive/ドキュメント/GitHub/AI-/pages/teleapo/teleapo.js';
let content = fs.readFileSync(targetPath, 'utf8');

const target = `  const normalizedUpdated = normalizeCandidateDetail(updated) || updated;
  if (candidateDetailCache) {
    candidateDetailCache.set(idNum, normalizedUpdated);
  }
  return normalizedUpdated;
}

async function updateCandidateOtherSelectionStatus`;

const replaceVal = `  const normalizedUpdated = normalizeCandidateDetail(updated) || updated;
  if (candidateDetailCache) {
    candidateDetailCache.set(idNum, normalizedUpdated);
  }

  const masterEntry = findTeleapoCandidate({ candidateId: idNum });
  if (masterEntry) {
    masterEntry.csStatus = status;
    masterEntry.cs_status = status;
  }
  teleapoLogData.forEach(log => {
      if (String(log.candidateId) === String(idNum)) {
          log.csStatus = status;
          log.cs_status = status;
      }
  });

  return normalizedUpdated;
}

async function updateCandidateOtherSelectionStatus`;

let success = true;

const replaceTarget = (t, r, id) => {
    if (!content.includes(t)) {
        console.log(`Could not find ${id}`);
        // try replacing \n with \r\n
        const t2 = t.replace(/\n/g, '\r\n');
        const r2 = r.replace(/\n/g, '\r\n');
        if (content.includes(t2)) {
            content = content.replace(t2, r2);
            console.log(`Replaced ${id} with CRLF`);
        } else {
            console.log(`Failed to replace ${id} even with CRLF`);
            success = false;
        }
    } else {
        content = content.replace(t, r);
        console.log(`Replaced ${id}`);
    }
};

replaceTarget(target, replaceVal, "target_cache_update");

if (success) {
    fs.writeFileSync(targetPath, content, 'utf8');
    console.log("Successfully updated teleapo.js");
} else {
    process.exit(1);
}
