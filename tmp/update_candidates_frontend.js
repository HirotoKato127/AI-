const fs = require('fs');
let content = fs.readFileSync('pages/candidates/candidates.js', 'utf8');

const regexSave = /function saveCsStatusManageState\(\) \{[\s\S]*?\}\r?\n\}/;
const newSave = `async function saveCsStatusManageState() {
  try {
    const payload = {
      key: 'CS_STATUS',
      options: {
        custom: Array.from(customCsStatusOptions),
        deleted: Array.from(deletedDefaultCsStatuses)
      }
    };
    const res = await fetch('/api/system-options', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to save stats');
  } catch (e) {
    console.warn("Failed to save CS status options to API", e);
  }
}`;

const regexLoad = /function loadCsStatusManageState\(\) \{[\s\S]*?\}\r?\n\}/;
const newLoad = `async function loadCsStatusManageState() {
  try {
    const res = await fetch('/api/system-options?key=CS_STATUS');
    if (!res.ok) throw new Error('Failed to fetch stats');
    const data = await res.json();
    const options = data.item || { custom: [], deleted: [] };
    
    customCsStatusOptions.clear();
    deletedDefaultCsStatuses.clear();
    
    (options.custom || []).forEach(s => customCsStatusOptions.add(s));
    (options.deleted || []).forEach(s => deletedDefaultCsStatuses.add(s));
  } catch (e) {
    console.warn("Failed to load CS status options from API", e);
  }
}`;

content = content.replace(regexSave, newSave);
content = content.replace(regexLoad, newLoad);

// We need to inject `await` for `saveCsStatusManageState()` inside delete, restore, and submit functions.
// function deleteCustomCsStatus(status)
content = content.replace(/saveCsStatusManageState\(\);/g, 'await saveCsStatusManageState();');

// Also inject `await loadCsStatusManageState()` into the main init flow.
content = content.replace(/loadCsStatusManageState\(\);/g, 'await loadCsStatusManageState();');

// Also ensure functions calling await are marked async
content = content.replace(/function deleteCustomCsStatus\(status\) \{/, 'async function deleteCustomCsStatus(status) {');
content = content.replace(/function restoreDefaultCsStatus\(status\) \{/, 'async function restoreDefaultCsStatus(status) {');

// The submit handler
content = content.replace(/document\.getElementById\("candidatesCsStatusSubmit"\)\?.addEventListener\("click", \(e\) => \{/, 'document.getElementById("candidatesCsStatusSubmit")?.addEventListener("click", async (e) => {');

// initialization block `initCandidates()`
content = content.replace(/async function initCandidates\(\) \{/, 'async function initCandidates() {');

fs.writeFileSync('pages/candidates/candidates.js', content, 'utf8');
console.log("Updated candidates.js API hooks");
