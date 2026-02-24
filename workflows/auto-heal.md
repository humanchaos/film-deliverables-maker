---
description: Automatically diagnose, fix, and verify build failures with a max 3-iteration loop
---

# Workflow: Auto-Heal & Optimize

## Trigger
- Detected failed exit code in terminal or new file in `.incidents/`.

## Execution Steps
1. **Diagnose:** Trigger @Diagnostician to create the Incident Report.
2. **Heal:** Trigger @Engineer to create a fix branch based on the report.
3. **Verify:** Trigger @Auditor to run the build on that branch.
   - *If Failure:* Repeat Step 1 with new logs (Max 3 attempts).
4. **Enhance:** Once @Auditor passes, trigger @Optimizer to review the changes for efficiency.
5. **Approval:** Present the final git diff and test results to the user.

## Persistence
- Log every attempt in `.agent/logs/heal_history.md`.