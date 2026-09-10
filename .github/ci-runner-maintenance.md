# CI runner maintenance

How the GitHub-hosted runner labels in `.github/workflows/publish.yml` are kept
current, and the exact procedure for the one change no bot can do on its own:
demoting a target from real execution to format-only verification when its
runner disappears.

## The invariant

Every platform/architecture the package supports (see the table in `README.md`,
which mirrors the arch logic in `post-install.js`) must be exercised by CI on
**every supported Node major** (`test-native` + `test-cross` matrices, currently
Node 18, 20, 22, 24, 26).

- **Prefer real execution** — a job in `test-native` that installs the package
  and runs an actual `protoc` code-gen.
- **Fall back to format verification** — a job in `test-cross` that runs
  `post-install.js` with `PROTOC_GEN_JS_PLATFORM` / `PROTOC_GEN_JS_ARCH` set and
  asserts the downloaded binary's format with `file`. Use this only when no
  GitHub-hosted runner can execute that target.

`all-tests-pass` aggregates both matrices and is the single required status
check, so branch protection never needs editing when legs move between matrices.

## Runner labels: who maintains what

| Label style | Example | Maintenance |
| --- | --- | --- |
| `*-latest` alias | `ubuntu-latest`, `macos-latest`, `windows-latest` | GitHub repoints the alias; nothing to do. PR CI catches any breakage. |
| plain pinned | `macos-16`, `ubuntu-26.04` | Renovate opens a bump PR (regex `customManager` in `.renovaterc.json5`, `github-runners` datasource). |
| suffixed pinned | `macos-15-intel`, `ubuntu-24.04-arm` | **Manual / agent.** The `github-runners` datasource has no `-intel` / `-arm` variants, so Renovate can't track these. GitHub deprecates them on its own schedule (deprecation notices land in the job logs and in <https://github.com/actions/runner-images> releases). |

## Procedure: an Intel macOS runner (or any native runner) is deprecated / removed

Trigger: a `test-native` leg fails to start with a "no runner matching label"
error, or a deprecation notice appears for `macos-15-intel` (or whatever the
current Intel label is), or a newer Intel label is not offered at all.

If a **newer Intel label still exists** (e.g. `macos-16-intel`): just replace the
label in both places in `test-native` (`strategy.matrix.os` and the matching
`strategy.matrix.include` row) and stop here.

If **Intel execution is gone entirely**, demote `darwin-x64` to `test-cross`:

1. `.github/workflows/publish.yml` → `test-native`:
   - Remove the Intel label (e.g. `macos-15-intel`) from `strategy.matrix.os`.
   - Remove the `strategy.matrix.include` entry whose `target` is `darwin-x64`.
2. `.github/workflows/publish.yml` → `test-cross`:
   - Add `darwin-x64` to `strategy.matrix.target`.
   - Add this `strategy.matrix.include` entry:
     ```yaml
     - target: darwin-x64
       platform: darwin
       arch: x64
       expect: 'Mach-O.*x86_64'
     ```
3. `README.md`: no change to the supported-arch table (macOS x64 is still
   supported), but note in the surrounding text if you track coverage type that
   darwin-x64 is now format-verified only.
4. Commit message / PR body: update the leg counts (`test-native` 25 → 20,
   `test-cross` 20 → 25) and the `test-native` platform list.
5. Nothing else — `all-tests-pass`, `gate`, `publish`, and branch protection are
   unaffected.

### Verify locally before opening the PR

```sh
rm -f bin/protoc-gen-js
PROTOC_GEN_JS_PLATFORM=darwin PROTOC_GEN_JS_ARCH=x64 node post-install.js
file bin/protoc-gen-js      # expect: Mach-O 64-bit executable x86_64
```

The same shape applies to any other target that loses its runner (e.g. an
`ubuntu-*-arm` withdrawal → move `linux-arm64` to `test-cross` with
`platform: linux`, `arch: arm64`, `expect: 'aarch64'`).

## Procedure: a new macOS / Ubuntu / Windows image goes GA

Usually Renovate's `customManager` opens the bump PR for plain labels. If it is a
`*-latest` alias, GitHub handles it. Otherwise bump the pinned label by hand in
every `strategy.matrix.os` list and `runs-on:` that references it. Let the full
matrix + `all-tests-pass` validate the PR.

## The Gemini model pin

`.github/workflows/ci-runner-maintenance.yml` pins the model in **two** places -
the `gemini_model:` input and the `"model"` field inside `settings` (the input
alone has not reliably stuck). The choice is driven by **free-tier
requests-per-day**, not capability - one agentic pass makes many API calls:

- Use a current **3.x-or-newer `*-flash-lite`** model (e.g. `gemini-3.5-flash-lite`),
  which allows ~500 requests/day free.
- Do **not** use `gemini-2.5-flash-lite` (~20/day), nor any `flash` / `pro` /
  `ultra` model.

When Google deprecates the pinned model, update **both** occurrences to the
newest such model listed at <https://ai.google.dev/gemini-api/docs/models>. The
scheduled job checks this itself and includes the bump in its PR; a human only
needs to act if the model is removed outright (the run then fails at the "Run
Gemini CLI" step with a quota/`404` error). A `429 ... exhausted your daily
quota` is not a model problem - the request budget is used up; it resets daily
and the monthly schedule normally leaves plenty of headroom.

## Running this as an agent

`.github/workflows/ci-runner-maintenance.yml` runs this procedure automatically:
monthly (and on `workflow_dispatch`) it invokes `google-github-actions/run-gemini-cli`
with this file as its instructions, and opens a PR if anything needs changing.
It needs a `GEMINI_API_KEY` secret (Google AI Studio, free tier).

The PR is opened with the default `GITHUB_TOKEN`, which does not trigger the
`Test and Publish` workflow via `pull_request`. So the job dispatches that
workflow onto the PR branch (`gh workflow run "Test and Publish" --ref <branch>`)
and enables GitHub native auto-merge (`gh pr merge --squash --auto`). The PR
merges itself once the required `all tests pass` check is green, or stays open
for review if it fails. Repo setting **Allow auto-merge** must be enabled (it
is).

To run it ad hoc without the workflow:

```sh
gemini --yolo --prompt "Follow .github/ci-runner-maintenance.md. Check whether
any runner label in .github/workflows/publish.yml is deprecated or removed, and
whether the gemini_model pin in .github/workflows/ci-runner-maintenance.yml is
current; if either needs changing, apply the documented fix on a new branch,
verify locally, and open a PR. Otherwise do nothing."
```
