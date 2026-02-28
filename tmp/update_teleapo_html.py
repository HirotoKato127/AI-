
import os
import re

file_path = r'c:\Users\hirot\OneDrive\ドキュメント\GitHub\AI-\pages\teleapo\index.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add CSS
new_css = """  /* CSステータス管理モーダル */
  .teleapo-status-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .teleapo-status-modal.hidden {
    display: none;
  }

  .teleapo-status-panel {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 400px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  /* 検索機能付きドロップダウンの基盤 */
  .searchable-dropdown-container {
    position: relative !important;
    width: 100% !important;
  }

  .searchable-dropdown-list {
    position: absolute !important;
    top: calc(100% + 4px) !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 9999 !important;
    background: #ffffff !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 12px !important;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
    max-height: 280px !important;
    overflow-y: auto !important;
    padding: 6px !important;
    animation: dropdown-slide-down 0.2s cubic-bezier(0, 0, 0.2, 1) !important;
  }

  @keyframes dropdown-slide-down {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .searchable-dropdown-item {
    padding: 10px 14px !important;
    font-size: 13.5px !important;
    color: #334155 !important;
    cursor: pointer !important;
    border-radius: 8px !important;
    transition: all 0.15s ease !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
  }

  .searchable-dropdown-item:hover {
    background: #f8fafc !important;
    color: #2563eb !important;
  }

  .searchable-dropdown-item.is-active {
    background: #eff6ff !important;
    color: #2563eb !important;
    font-weight: 600 !important;
  }

  .searchable-dropdown-item::before {
    content: ' ';
    display: inline-block;
    width: 4px;
    height: 4px;
    background: #cbd5e1;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .searchable-dropdown-empty {
    padding: 20px !important;
    font-size: 13px !important;
    color: #94a3b8 !important;
    text-align: center !important;
  }

  .searchable-dropdown-hint {
    padding: 8px !important;
    font-size: 10px !important;
    color: #94a3b8 !important;
    text-align: center !important;
    border-top: 1px dashed #f1f5f9 !important;
    margin-top: 4px !important;
  }

  .hidden { display: none !important; }"""

pattern_css = re.compile(r'/\* ===== CS Status Management Modal ===== \*/.*?}\s*</style>', re.DOTALL)
content = pattern_css.sub(new_css + "\n</style>", content)

# 2. Wrap Candidate Search (Dial Form)
pattern_dial_candidate = re.compile(r'<div class="teleapo-form-field">\s*<label>候補者名</label>\s*<input id="dialFormCandidateSearch" type="search" placeholder="候補者名で検索" autocomplete="off" />\s*<select id="dialFormCandidateSelect" required></select>\s*<input id="dialFormCandidateName" type="hidden" />\s*</div>', re.DOTALL)
replacement_dial_candidate = """        <div class="teleapo-form-field">
          <label>候補者名</label>
          <div class="searchable-dropdown-container">
            <input id="dialFormCandidateSearch" type="search" placeholder="候補者名で検索" autocomplete="off" />
            <div id="dialFormCandidateSearchDropdown" class="searchable-dropdown-list hidden"></div>
          </div>
          <select id="dialFormCandidateSelect" class="hidden" required></select>
          <input id="dialFormCandidateName" type="hidden" />
        </div>"""
content = pattern_dial_candidate.sub(replacement_dial_candidate, content)

# 3. Wrap CS Status (Dial Form)
pattern_dial_cs = re.compile(r'<div class="teleapo-form-field">\s*<label>CSステータス</label>\s*<select id="dialFormCsStatus">.*?</select>\s*</div>', re.DOTALL)
replacement_dial_cs = """        <div class="teleapo-form-field">
          <label>CSステータス</label>
          <div class="searchable-dropdown-container">
            <input type="text" id="dialFormCsStatusSearch" placeholder="ステータスを検索/選択..." autocomplete="off" />
            <div id="dialFormCsStatusDropdown" class="searchable-dropdown-list hidden"></div>
          </div>
          <select id="dialFormCsStatus" class="hidden">
            <option value="">-</option>
            <option value="未対応">未対応</option>
            <option value="対応中">対応中</option>
            <option value="対応完了">対応完了</option>
            <option value="対応保留">対応保留</option>
          </select>
        </div>"""
content = pattern_dial_cs.sub(replacement_dial_cs, content)

# 4. Wrap Candidate Search (SMS Form)
pattern_sms_candidate = re.compile(r'<div class="teleapo-form-field">\s*<label>候補者名</label>\s*<input id="smsFormCandidateSearch" type="search" placeholder="候補者名で検索" autocomplete="off" />\s*<select id="smsFormCandidateSelect" required></select>\s*<input id="smsFormCandidateName" type="hidden" />\s*</div>', re.DOTALL)
replacement_sms_candidate = """        <div class="teleapo-form-field">
          <label>候補者名</label>
          <div class="searchable-dropdown-container">
            <input id="smsFormCandidateSearch" type="search" placeholder="候補者名で検索" autocomplete="off" />
            <div id="smsFormCandidateSearchDropdown" class="searchable-dropdown-list hidden"></div>
          </div>
          <select id="smsFormCandidateSelect" class="hidden" required></select>
          <input id="smsFormCandidateName" type="hidden" />
        </div>"""
content = pattern_sms_candidate.sub(replacement_sms_candidate, content)

# 5. Wrap CS Status (SMS Form)
pattern_sms_cs = re.compile(r'<div class="teleapo-form-field">\s*<label>CSステータス</label>\s*<select id="smsFormCsStatus">.*?</select>\s*</div>', re.DOTALL)
replacement_sms_cs = """        <div class="teleapo-form-field">
          <label>CSステータス</label>
          <div class="searchable-dropdown-container">
            <input type="text" id="smsFormCsStatusSearch" placeholder="ステータスを検索/選択..." autocomplete="off" />
            <div id="smsFormCsStatusDropdown" class="searchable-dropdown-list hidden"></div>
          </div>
          <select id="smsFormCsStatus" class="hidden">
            <option value="">-</option>
            <option value="未対応">未対応</option>
            <option value="対応中">対応中</option>
            <option value="対応完了">対応完了</option>
            <option value="対応保留">対応保留</option>
          </select>
        </div>"""
content = pattern_sms_cs.sub(replacement_sms_cs, content)

with open(file_path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print("Successfully updated teleapo/index.html")
