
import os
import re

file_path = r'c:\\Users\\hirot\\OneDrive\\ドキュメント\\GitHub\\AI-\\pages\\teleapo\\teleapo.js'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add setupSearchableDropdown and helper
dropdown_util = """
function setupSearchableDropdown(inputId, dropdownId, hiddenIdOrSelectId, getOptionsFn, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const targetElement = document.getElementById(hiddenIdOrSelectId);
  if (!input || !dropdown) return;

  const showDropdown = () => {
    const options = getOptionsFn();
    const query = input.value.trim().toLowerCase();
    let filtered = options.filter(opt => {
      const label = typeof opt === "string" ? opt : opt.label;
      return String(label || "").toLowerCase().includes(query);
    });
    const limit = 50;
    const itemsToShow = filtered.slice(0, limit);
    if (itemsToShow.length === 0) {
      if (query) {
        dropdown.innerHTML = '<div class="searchable-dropdown-empty">一致する候補がありません</div>';
        dropdown.classList.remove("hidden");
      } else if (options.length > 0) {
        const defaultShow = options.slice(0, limit);
        dropdown.innerHTML = defaultShow.map(opt => {
          const value = typeof opt === "string" ? opt : opt.value;
          const label = typeof opt === "string" ? opt : opt.label;
          const isActive = targetElement && String(targetElement.value) === String(value) ? "is-active" : "";
          return `<div class="searchable-dropdown-item ${isActive}" data-value="${escapeHtml(String(value))}">${escapeHtml(label)}</div>`;
        }).join("");
        if (options.length > limit) {
          dropdown.innerHTML += `<div class="searchable-dropdown-hint">${options.length - limit}件以上あります。絞り込んでください。</div>`;
        }
        dropdown.classList.remove("hidden");
      } else {
        dropdown.classList.add("hidden");
      }
    } else {
      dropdown.innerHTML = itemsToShow.map(opt => {
        const value = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const isActive = targetElement && String(targetElement.value) === String(value) ? "is-active" : "";
        return `<div class="searchable-dropdown-item ${isActive}" data-value="${escapeHtml(String(value))}">${escapeHtml(label)}</div>`;
      }).join("");
      if (filtered.length > limit) {
        dropdown.innerHTML += `<div class="searchable-dropdown-hint">${filtered.length - limit}件以上が一致しています。絞り込んでください。</div>`;
      }
      dropdown.classList.remove("hidden");
    }
  };

  const hideDropdown = () => { setTimeout(() => { dropdown.classList.add("hidden"); }, 200); };
  input.addEventListener("focus", showDropdown);
  input.addEventListener("input", showDropdown);
  input.addEventListener("blur", hideDropdown);
  dropdown.addEventListener("click", (e) => {
    const item = e.target.closest(".searchable-dropdown-item");
    if (!item) return;
    const value = item.dataset.value;
    const label = item.textContent;
    input.value = label;
    if (targetElement) {
      targetElement.value = value;
      targetElement.dispatchEvent(new Event("change"));
    }
    if (onSelect) onSelect(value, label);
    dropdown.classList.add("hidden");
  });
}

function initializeTeleapoSearchableDropdowns() {
  // 1. Candidate Name (Dial Form)
  setupSearchableDropdown(
    "dialFormCandidateSearch",
    "dialFormCandidateSearchDropdown",
    "dialFormCandidateSelect",
    () => candidateNameList.map(name => ({ value: candidateNameMap.get(name), label: name })),
    (value) => {
       if (typeof setDialFormCandidateSelection === 'function') setDialFormCandidateSelection(value);
    }
  );

  // 2. CS Status (Dial Form)
  setupSearchableDropdown(
    "dialFormCsStatusSearch",
    "dialFormCsStatusDropdown",
    "dialFormCsStatus",
    () => {
      const candidates = (typeof teleapoCandidateMaster !== 'undefined') ? teleapoCandidateMaster : [];
      return buildTeleapoCsStatusOptions({ candidates });
    }
  );

  // 3. Candidate Name (SMS Form)
  setupSearchableDropdown(
    "smsFormCandidateSearch",
    "smsFormCandidateSearchDropdown",
    "smsFormCandidateSelect",
    () => candidateNameList.map(name => ({ value: candidateNameMap.get(name), label: name })),
    (value) => {
       if (typeof setSmsFormCandidateSelection === 'function') setSmsFormCandidateSelection(value);
    }
  );

  // 4. CS Status (SMS Form)
  setupSearchableDropdown(
    "smsFormCsStatusSearch",
    "smsFormCsStatusDropdown",
    "smsFormCsStatus",
    () => {
      const candidates = (typeof teleapoCandidateMaster !== 'undefined') ? teleapoCandidateMaster : [];
      return buildTeleapoCsStatusOptions({ candidates });
    }
  );
}
"""

if "function setupSearchableDropdown" not in content:
    pattern_helper = re.compile(r'function escapeHtml\(str\) \{.*?\}', re.DOTALL)
    content = pattern_helper.sub(lambda m: m.group(0) + "\n" + dropdown_util, content)

# 2. Update initDialForm
pattern_init_dial = re.compile(r'function initDialForm\(\) \{(.*?)\}', re.DOTALL)
if "initializeTeleapoSearchableDropdowns();" not in content:
    content = pattern_init_dial.sub(r'function initDialForm() {\1  initializeTeleapoSearchableDropdowns();\n}', content)

# 3. Update initSmsForm
pattern_init_sms = re.compile(r'function initSmsForm\(\) \{(.*?)\}', re.DOTALL)
if "initializeTeleapoSearchableDropdowns();" not in content:
   # This will be handled if above didn't match both, but re.DOTALL might match multiple. 
   # Actually pattern_init_dial matches the first one. 
   pass

content = re.sub(r'function initSmsForm\(\) \{(.*?)\}', r'function initSmsForm() {\1  initializeTeleapoSearchableDropdowns();\n}', content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print("Successfully updated teleapo.js")
