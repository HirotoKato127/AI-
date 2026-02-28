# Walkthrough - Removing Evaluation Period Setting

We have removed the "Evaluation Period Setting" (評価期間設定) section from the Goal Settings page as it is now redundant with the new MS Period Settings page.

## Changes Made

### 1. Goal Settings HTML (`pages/goal-settings/index.html`)
- Removed the `settings-card` containing the "評価期間設定" title and radio buttons from the "Company Settings" tab.
- Added a comment to indicate it was removed as per request.

### 2. Goal Settings JavaScript (`pages/goal-settings/goal-settings.js`)
- Commented out the `renderEvaluationRuleSection()` call in the `mount()` function.
- Removed or commented out event listeners for rule selection and saving.
- Removed or commented out the implementation of `handleSaveEvaluationRule` and `renderEvaluationRuleSection`.
- Fixed the file structure to ensure no accidental function nesting occurred during the edit.

## Verification

### UI Verification
1. Navigate to the "評価・目標設定" (Goal Settings) page.
2. In the "会社設定" (Company Settings) tab, verify that the "評価期間設定" section is gone.
3. Verify that "期間目標設定 (会社共通)" is now the first section.
4. Switch to the "個人設定" (Personal Settings) tab and verify it still works correctly.

### Logic Verification
- Ensure that switching tabs still works.
- Ensure that saving targets in other sections still works.
