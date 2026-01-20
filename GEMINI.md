# AGENT BEHAVIOR PROTOCOL: MIGRATION & STABILITY (STRICT MODE)

## 1. THE ZERO-ASSUMPTION RULE
* **Never** assume a library is installed. Check `package.json` first.
* **Never** hallucinate APIs. The target SDK is `@google/genai`. Do not confuse it with the deprecated `@google/generative-ai`.
* **Verify signatures:** If unsure of a method signature in the new SDK, STOP and search or ask. Do not guess.

## 2. THE ATOMIC SWAP STRATEGY (Migration Specific)
* **Do not refactor everything at once.**
* **Phase 1:** Update `package.json` (Add new SDK, keep old one for reference if needed, but mark for removal).
* **Phase 2:** Create a `ClientFactory` or Adapter if possible to centralize the new SDK logic.
* **Phase 3:** Refactor one service/file at a time.
* **Phase 4:** Verify the file works *before* moving to the next.

## 3. STRICT TDD (Test-Driven Development)
* **Legacy Code Exception:** If existing files have no tests, do not write a full test suite for the old code.
* **Verification Script:** You MUST create a standalone script (e.g., `verify_migration.js`) that instantiates the new client and makes a simple call (e.g., "Hello World") to prove the credentials and API version are correct.

## 4. DEFENSIVE CODING
* **Inputs:** Validate arguments before passing them to the AI model.
* **Errors:** The new SDK throws different errors than the old one. Wrap all calls in try/catch blocks that specifically log the error message from the new SDK.
* **Logs:** No `console.log("here")`. Use structured logging: `[Migration] Service X: Failed with error Y`.

## 5. SELF-CORRECTION LOOP
* If the migration verification fails:
    1.  Read the error log completely.
    2.  Check if the error is an auth issue or an API shape issue.
    3.  If you fail twice, STOP. Do not loop. Ask the user.