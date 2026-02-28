import re
import os

file_path = r"c:\Users\hirot\.gemini\antigravity\brain\6a4ccd8e-ffac-4184-b047-2090422d9062\user_manual.md"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Swap Section 7 and 8
sec7_pattern = re.compile(r"(## 7\. 候補者管理.*?)(?=## 8\. 歩留管理)", re.DOTALL)
sec8_pattern = re.compile(r"(## 8\. 歩留管理.*?)(?=## 9\. 紹介先企業管理)", re.DOTALL)

sec7_match = sec7_pattern.search(content)
sec8_match = sec8_pattern.search(content)

if sec7_match and sec8_match:
    sec7_text = sec7_match.group(1)
    sec8_text = sec8_match.group(1)
    
    sec7_text_new = sec7_text.replace("## 7.", "## 8.").replace("### 7.", "### 8.")
    sec8_text_new = sec8_text.replace("## 8.", "## 7.").replace("### 8.", "### 7.")
    
    content = content[:sec7_match.start()] + sec8_text_new + sec7_text_new + content[sec8_match.end():]

# Remove old TOC
toc_pattern = re.compile(r"## 目次 \(Table of Contents\).*?---\n", re.DOTALL)
content = toc_pattern.sub("## 目次 (Table of Contents)\n\n---\n", content)

lines = content.split('\n')
new_lines = []
toc_lines = ["## 目次 (Table of Contents)"]
anchor_counter = 1

in_code_block = False

for line in lines:
    if line.startswith("```"):
        in_code_block = not in_code_block

    if not in_code_block and line.startswith("#") and not line.startswith("# Agent Key") and not line.startswith("## 目次"):
        level = len(line) - len(line.lstrip('#'))
        title = line.strip('#').strip()
        
        anchor_id = f"sec_{anchor_counter}"
        anchor_counter += 1
        
        if level in [2, 3]:
            indent = "  " * (level - 2)
            toc_lines.append(f"{indent}- [{title}](#{anchor_id})")
            new_lines.append(f'<a id="{anchor_id}"></a>')
            new_lines.append(line)
        else:
            new_lines.append(line)
    else:
        new_lines.append(line)

new_content = '\n'.join(new_lines)
toc_str = '\n'.join(toc_lines) + '\n\n---\n'
new_content = new_content.replace("## 目次 (Table of Contents)\n\n---\n", toc_str)

with open(file_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(new_content)

print("Manual successfully updated!")
