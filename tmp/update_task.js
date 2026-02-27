const fs = require('fs');
let content = fs.readFileSync('c:\\Users\\hirot\\.gemini\\antigravity\\brain\\6a4ccd8e-ffac-4184-b047-2090422d9062\\task.md', 'utf8');

const target = `- [/] 3. フロントエンドの連携修正 (\`pages/teleapo/teleapo.js\`)
  - [/] \`readTeleapoCsStatusStorage\` をAPIから取得する関数（非同期）に書き換え
  - [/] \`addTeleapoCsStatus\`, \`deleteTeleapoCsStatus\`, \`restoreTeleapoCsStatus\` をAPI更新（PUT）するように書き換え
  - [ ] 画面読み込み時にAPIから設定を取得してUIに反映する処理の追加
- [ ] 4. テストと動作確認
  - [ ] 選択肢の追加・削除がDBに反映されるか確認
  - [ ] ブラウザをハードリロードしても設定が保持されるか確認`;

const replace = `- [x] 3. フロントエンドの連携修正 (\`pages/teleapo/teleapo.js\`, \`pages/candidates/candidates.js\`)
  - [x] APIから取得する関数（非同期）に書き換え
  - [x] API更新（PUT）するように書き換え
  - [x] 画面読み込み時にAPIから設定を取得してUIに反映する処理の追加
- [/] 4. テストと動作確認
  - [/] 選択肢の追加・削除がDBに反映されるか確認
  - [ ] ブラウザをハードリロードしても設定が保持されるか確認`;

const newContent = content.replace(target, replace);
fs.writeFileSync('c:\\Users\\hirot\\.gemini\\antigravity\\brain\\6a4ccd8e-ffac-4184-b047-2090422d9062\\task.md', newContent, 'utf8');
