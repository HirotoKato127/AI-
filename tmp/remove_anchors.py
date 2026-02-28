import re
import os

file_path = r"c:\Users\hirot\.gemini\antigravity\brain\6a4ccd8e-ffac-4184-b047-2090422d9062\user_manual.md"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove all <a id="sec_X"></a> tags
content = re.sub(r'<a id="sec_\d+"></a>\n?', '', content)

# 2. Strip brackets and parentheses from the TOC area
# We only want to replace lines in the TOC, which starts at "## 目次" and ends at "---"
toc_start = content.find("## 目次 (Table of Contents)")
toc_end = content.find("---", toc_start)

if toc_start != -1 and toc_end != -1:
    toc_section = content[toc_start:toc_end]
    # Replace "- [Link Text](#sec_id)" with "- Link Text"
    cleaned_toc = re.sub(r'- \[(.*?)\]\(#sec_\d+\)', r'- \1', toc_section)
    content = content[:toc_start] + cleaned_toc + content[toc_end:]

with open(file_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

print("Anchors removed successfully!")
