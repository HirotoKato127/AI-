const fs = require('fs');
let content = fs.readFileSync('pages/teleapo/teleapo.js', 'utf8');

const target = `async function loadCandidates() {
  renderCsTaskTable([], { loading: true });
  renderMissingInfoTable([], { loading: true });
  try {`;

const replace = `async function loadCandidates() {
  await fetchTeleapoCsStatusOptions();
  renderCsTaskTable([], { loading: true });
  renderMissingInfoTable([], { loading: true });
  try {`;

content = content.replace(target, replace);
fs.writeFileSync('pages/teleapo/teleapo.js', content, 'utf8');
console.log("Injected fetchTeleapoCsStatusOptions into loadCandidates");
