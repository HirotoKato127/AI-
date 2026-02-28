const fs = require('fs');
const path = require('path');

const cssPath = 'c:\\Users\\hirot\\OneDrive\\ドキュメント\\GitHub\\AI-\\pages\\candidates\\candidates.css';
let content = fs.readFileSync(cssPath, 'utf8');

const newCss = `
/* Sales & Refund Tab Refinement */
.money-summary-section {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.money-summary-header {
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
}

.money-summary-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.money-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.25rem;
  margin-bottom: 1.5rem;
}

.money-summary-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: all 0.2s ease;
}

.money-summary-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.money-summary-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
}

.money-summary-value.is-net {
  color: #2563eb; /* default primary if var is missing */
  color: var(--app-primary, #2563eb);
}

.money-summary-value.is-negative {
  color: #ef4444;
}

.money-status-row {
  display: flex;
  gap: 1.5rem;
  padding: 1rem 1.25rem;
  background: #f1f5f9;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
  margin-bottom: 1.5rem;
  align-items: center;
}

.money-status-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.money-status-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #334155;
}

.money-warning {
  background: #fff7ed;
  border: 1px solid #ffedd5;
  color: #c2410c;
  padding: 0.875rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.money-warning::before {
  content: '⚠️';
}

.detail-table-wrapper h5 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  color: #1e293b;
  border-left: 4px solid #cbd5e1;
  padding-left: 0.75rem;
  margin-top: 2rem;
  margin-bottom: 1rem;
}
`;

if (!content.includes('.money-summary-grid')) {
    fs.writeFileSync(cssPath, content + newCss, 'utf8');
    console.log('Appended CSS to candidates.css');
} else {
    // If it partially exists or exists, replace everything after /* Sales & Refund Tab Refinement */
    const idx = content.indexOf('/* Sales & Refund Tab Refinement */');
    if (idx !== -1) {
        content = content.substring(0, idx);
        fs.writeFileSync(cssPath, content + newCss, 'utf8');
        console.log('Replaced CSS in candidates.css');
    } else {
        fs.writeFileSync(cssPath, content + newCss, 'utf8');
        console.log('Appended again as comment not found');
    }
}
