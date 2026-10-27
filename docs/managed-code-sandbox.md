# Connect the managed code sandbox

Updated 24 October 2026. **OnlineCompiler is connected and execution is enabled for students and assigned teachers in Java, JavaScript, Python and Dart.** Verification used authored fixtures, not existing student work. The running backend on port 5000 reports availability enabled for both roles in all four languages.

## Current connection

The user's existing `ONLINE_COMPILER_API_KEY` in `backend/.env` is reused without duplicating or exposing it. The following non-secret connection settings were added; keep the existing key value:

   ```env
   CODE_EXECUTION_PROVIDER=onlinecompiler
   CODE_EXECUTION_API_URL=https://api.onlinecompiler.io/api/judge0
   CODE_EXECUTION_API_KEY_HEADER=Authorization
   CODE_EXECUTION_APPROVAL_FILE="C:/path/to/Capstone/backend/code-sandbox-approval.local.json"
   ```

The actual local environment contains the correct absolute approval path for this workspace. `backend/.env`, the local approval file and temporary test reports are ignored by Git. The example approval file remains disabled. No packages were installed and no paid plan was purchased.

The profile sends the original source/stdin once through the existing authenticated activity routes. It omits unsupported Judge0 request fields, including `enable_network`: this service denies networking at the sandbox level and rejects that field. See [the provider's compatibility documentation](https://onlinecompiler.io/docs/judge0). Authentication and quota failures have sanitized user messages; credentials never reach the frontend.

## Using Run and Tests

1. Refresh the TrueSight page, or choose **Refresh execution status** in an already open editor/review.
2. Enter source for the activity's assigned language and optional Program Input, then choose **Run Code**.
3. For **Run Tests**, configure cases in the teacher's **Programming settings and test cases**. Students run public cases; the assigned teacher runs public and hidden cases. A student cannot enable hidden cases by manipulating the API.
4. Run, Tests and Save Draft do not submit work. Final submission remains separate. Optional automatic evaluation suggests technical points only; it never publishes an official teacher grade.

The provider enforces fixed **512 MB memory and 16 processes**. These effective limits are displayed and recorded; old requested memory values remain preserved but are not claimed to be enforced. The configured time limit uses wall time and provider startup allowances. Compilation failures may come back as runtime NZEC, with genuine compiler text in stderr; unavailable exit codes remain unavailable. [Provider limits](https://onlinecompiler.io/docs/limits).

## Verification and review basis

The provider documents gVisor isolation, an unprivileged user, no network, read-only language images, bounded resources and workspace cleanup. These architecture/hard-cap statements are **provider-attested**, not an independent infrastructure audit by Codex. [Security model](https://onlinecompiler.io/security).

The local 30-day review record distinguishes those statements from live checks. Renew after reviewing current evidence and rerunning verification, not by merely extending its expiry. The 21-case runtime report is stored in `backend/.tmp/onlinecompiler-verification/runtime.json` and contains no API key.

- **21 real runtime checks:** OpenJDK 25, Node.js 24, Python 3.14, Dart 3.13; hello/stdin, native syntax/runtime failures, arbitrary Java public names/packages, JS modules, timeout, whitespace, network denial, absent application credentials, fresh workspaces and bounded large output.
- **37 real HTTP responses plus output/privacy/grade assertions:** both roles Run and Tests for all four languages, hidden-case isolation, final evaluation with unchanged official grade. Temporary fixture accounts/classes/subjects were removed after testing.
- **18 running-application availability responses:** enabled for both roles in all four languages on port 5000.
- **Regression checks:** both builds, targeted lint, 164 workspace HTTP checks, 56 contract checks for ordinary Judge0 and another 56 for the OnlineCompiler profile, existing 96-assertion LMS regression and frontend checks passed. Fake-provider tests are separate from the real execution checks above.

To rerun real checks from `backend`, set `TRUESIGHT_LIVE_CODE_TEST=1` and run `node tests/onlinecompiler-runtime-smoke.mjs` or `node tests/onlinecompiler-workspace-live.mjs`. They use only authored fixtures and consume account runs; requests are paced for the account's documented limits. Normal regression suites use fake providers or explicit disabled configuration and do not send student work.

If the key, provider endpoint or approval path changes, restart the backend and refresh execution status. Expired approval, provider outage or account quota exhaustion keeps the source preserved and returns an explanatory status. Browser visual/cursor interaction has not been tested in this session.
