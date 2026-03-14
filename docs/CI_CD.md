# CI/CD Pipeline

VoxChronicle uses GitHub Actions for automated testing, building, and releasing.

## Workflows

### Test Suite (`.github/workflows/test.yml`)

Runs on every push and PR to `master` and `develop`.

- **Matrix**: Node.js 18.x and 20.x
- **Steps**: `npm ci` → `npm test` → `npm run test:integration` → coverage report
- **Coverage threshold**: 80% minimum (lines, statements, functions, branches)
- **Lint**: Runs in parallel, non-blocking (`continue-on-error: true`)

### Build & Release (`.github/workflows/release.yml`)

Runs on push to `master` and `develop`. Creates GitHub Releases automatically.

#### Branching Strategy

| Branch | Purpose | Release Tag | GitHub Release Type |
|--------|---------|-------------|---------------------|
| `master` | Stable releases | `vX.Y.Z` | Latest |
| `develop` | Release candidates | `vX.Y.Z-rc.N` | Pre-release |
| `autoclaude` / feature | Development | No release | N/A |

#### Release Flow

```
Push to master or develop
  │
  ├─ Test Gate (npm test must pass)
  │   └─ Failure → No release created
  │
  ├─ Extract version from module.json
  │
  ├─ Determine tag:
  │   ├─ master → vX.Y.Z
  │   └─ develop → vX.Y.Z-rc.N (auto-increment N)
  │
  ├─ Check if release already exists (skip if yes)
  │
  ├─ Build ZIP package:
  │   ├─ Update module.json download URL for this tag
  │   ├─ Stage files (scripts/, lang/, styles/, templates/, etc.)
  │   └─ Create ZIP in releases/
  │
  └─ Create GitHub Release:
      ├─ Upload ZIP (module installation)
      ├─ Upload module.json (manifest for Foundry)
      └─ Auto-generate release notes from commits
```

#### RC Auto-Increment

When pushing to `develop`, the workflow finds the highest existing RC number for the current version and increments it:

```
v4.0.0-rc.1  (first push to develop with version 4.0.0)
v4.0.0-rc.2  (second push)
v4.0.0-rc.3  (third push)
```

When version is bumped in `module.json` (e.g., 4.0.0 → 4.1.0), RC numbering resets:

```
v4.1.0-rc.1  (first push with new version)
```

#### Concurrency

Releases use `concurrency` groups to prevent parallel releases on the same branch. If a push is in-progress, new pushes wait.

#### Idempotency

If a release tag already exists, the workflow skips creation. This prevents duplicate releases if the same commit is pushed multiple times.

## How to Release

### Stable Release (master)

1. Update `module.json` version:
   ```json
   "version": "4.1.0"
   ```
2. Commit and push to `master`:
   ```bash
   git add module.json
   git commit -m "chore: bump version to 4.1.0"
   git push origin master
   ```
3. CI/CD automatically:
   - Runs tests
   - Builds `vox-chronicle-v4.1.0.zip`
   - Creates GitHub Release `v4.1.0` with ZIP + manifest
   - Sets as "latest" release

### Release Candidate (develop)

1. Push to `develop` (version from `module.json` is used):
   ```bash
   git push origin develop
   ```
2. CI/CD automatically:
   - Runs tests
   - Finds last RC number (e.g., `v4.1.0-rc.2`)
   - Builds `vox-chronicle-v4.1.0-rc.3.zip`
   - Creates GitHub Release `v4.1.0-rc.3` marked as pre-release

### Manual Release (fallback)

If CI/CD is unavailable:

```bash
# 1. Build
bash build.sh

# 2. Release
gh release create v4.1.0 releases/vox-chronicle-v4.1.0.zip module.json \
  --title "v4.1.0" --latest
```

## Foundry VTT Manifest URL

Users install VoxChronicle using this manifest URL in Foundry VTT:

```
https://github.com/Aiacos/VoxChronicle/releases/latest/download/module.json
```

This always points to the latest stable release (not RCs).

## Secrets & Permissions

The workflow uses `GITHUB_TOKEN` (automatically provided by GitHub Actions) with `contents: write` permission. No additional secrets are required.

## File Structure

```
.github/
  workflows/
    test.yml          # Test + lint + coverage (on push/PR)
    release.yml       # Build + release (on push to master/develop)
build.sh              # Local build script (used by CI and manually)
module.json           # Source of truth for version and download URL
```
