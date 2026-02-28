const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../pages/candidates/candidates.js');
let content = fs.readFileSync(file, 'utf8');

const replace = `    let masterDataUsers = Array.isArray(json.users) ? json.users : null;
    
    if (!masterDataUsers) {
      try {
        const listRes = await fetch(candidatesApi(\`\${CANDIDATES_LIST_PATH}?limit=1\`));
        if (listRes.ok) {
          const listJson = await listRes.json();
          if (listJson.items && listJson.items.length > 0) {
            const sampleId = listJson.items[0].id;
            const detailRes = await fetch(candidatesApi(\`\${CANDIDATES_LIST_PATH}/\${sampleId}?includeMaster=true\`));
            if (detailRes.ok) {
              const detailJson = await detailRes.json();
              if (detailJson && detailJson.masters && Array.isArray(detailJson.masters.users)) {
                 masterDataUsers = detailJson.masters.users;
              }
            }
          }
        }
      } catch (e) {
        console.warn("Fallback master user fetch failed:", e);
      }
    }

    if (Array.isArray(masterDataUsers)) {
      masterUsers = masterDataUsers;
      const filteredAdvisors = masterDataUsers.filter(u => u.role === 'advisor' && u.active !== false).map(u => u.name);
      const filteredCsUsers = masterDataUsers.filter(u => u.role === 'caller' && u.active !== false).map(u => u.name);
      if (filteredAdvisors.length) setFilterSelectOptions("candidatesFilterAdvisor", filteredAdvisors);
      if (filteredCsUsers.length) setFilterSelectOptions("candidatesFilterCs", filteredCsUsers);
    } else {
      if (advisors.length) {
        setFilterSelectOptions("candidatesFilterAdvisor", advisors);
      }
      if (facetsCsUsers.length || advisors.length) {
        setFilterSelectOptions("candidatesFilterCs", facetsCsUsers.length ? facetsCsUsers : advisors);
      }
    }`;

const startStr = "if (Array.isArray(json.users)) {";
const endStr1 = "setFilterSelectOptions(\"candidatesFilterCs\", facetsCsUsers);\r\n    }";
const endStr2 = "setFilterSelectOptions(\"candidatesFilterCs\", facetsCsUsers);\n    }";

const startIndex = content.indexOf(startStr);
let endIndex = content.indexOf(endStr1, startIndex);
let endLength = endStr1.length;

if (endIndex === -1) {
  endIndex = content.indexOf(endStr2, startIndex);
  endLength = endStr2.length;
}

if (startIndex !== -1 && endIndex !== -1) {
  // We need to also catch the preceding spaces
  const actualStartIndex = content.lastIndexOf("    " + startStr, startIndex) !== -1 ? content.lastIndexOf("    " + startStr, startIndex) : startIndex;
  const before = content.substring(0, actualStartIndex);
  const after = content.substring(endIndex + endLength);
  content = before + replace + after;
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully replaced logic via script');
} else {
  console.log('Target block not found. start:', startIndex, 'end1:', content.indexOf(endStr1), 'end2:', content.indexOf(endStr2));

  // Fallback: try to find startStr again
  if (startIndex !== -1) {
    let snippet = content.substring(startIndex, startIndex + 500);
    console.log("Snippet at start:", snippet);
  }
}
