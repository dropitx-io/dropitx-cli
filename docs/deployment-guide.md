# DropItX CLI - Deployment Guide

## Overview

This guide covers building, testing, and publishing the DropItX CLI package to PyPI. The project uses standard Python packaging with setuptools.

**Current Status:** CI exists (tests run on push/PR), but PyPI publishing is manual. No release automation.

## Prerequisites

- Python 3.9+ (practical minimum; code uses PEP 585 generics)
- pip (usually bundled with Python)
- PyPI account and API token (for publishing)
- git (for versioning)

## Repository

- **Public repo:** https://github.com/phuongddx/dropitx-cli
- **License:** MIT (Copyright 2026 DropItX)
- **Clone:** `git clone https://github.com/phuongddx/dropitx-cli.git`
- **SSH:** `git@github.com-phuongddx:phuongddx/dropitx-cli.git` (via host alias)

## Local Development Setup

### Clone & Install

```bash
# Clone repository (HTTPS or SSH)
git clone https://github.com/phuongddx/dropitx-cli.git
cd dropitx-cli

# Create virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install in development mode (editable)
pip install -e .
```

**Editable install (`-e`):** Changes to source files take effect immediately without reinstalling. Use this for development.

### Install with Optional Dependencies

```bash
# Install with QR code support
pip install -e '.[qr]'

# Install with dev dependencies (includes pytest)
pip install -e '.[dev]'
```

### Verify Installation

```bash
# Check version
dropitx --version

# Show help
dropitx --help

# Test basic command
dropitx config show
```

## Building for Distribution

### Build Source and Wheel

```bash
# Install build tools
pip install build twine

# Build distribution packages
python -m build

# Output in dist/:
# dist/dropitx-1.0.0.tar.gz   (source distribution)
# dist/dropitx-1.0.0-py3-none-any.whl  (wheel)
```

### Check Build

```bash
# Validate package metadata
twine check dist/*

# Should output: "Checking dist/dropitx-1.0.0.tar.gz: PASSED"
```

### Test Build Locally

```bash
# Install from built wheel
pip install dist/dropitx-1.0.0-py3-none-any.whl

# Verify it works
dropitx --version
dropitx upload --help
```

## Version Bumping

DropItX version is declared in **two places** (must match):

### 1. `pyproject.toml`
```toml
[project]
name = "dropitx"
version = "1.0.0"  # <-- Update this
```

### 2. `dropitx/__init__.py`
```python
__version__ = "1.0.0"  # <-- Update this
```

### Bump Process

```bash
# Example: bump to 1.1.0
# Edit pyproject.toml: version = "1.1.0"
# Edit dropitx/__init__.py: __version__ = "1.1.0"

# Verify consistency
grep -n "version\|__version__" pyproject.toml dropitx/__init__.py

# Commit changes
git add pyproject.toml dropitx/__init__.py
git commit -m "Bump version to 1.1.0"
```

## Publishing to PyPI

### Manual Publish (Current Method)

```bash
# Build package
python -m build

# Upload to PyPI (requires PyPI API token)
twine upload dist/*

# Or upload to TestPyPI first
twine upload --repository testpypi dist/*
```

**Setup PyPI Token:**
```bash
# Create token at https://pypi.org/manage/account/token/
# Store in ~/.pypirc
[pypi]
username = __token__
password = pypi-xxxx...  # Your PyPI token
```

### Tag Best Practice

```bash
# Tag the release
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# Then build and publish
python -m build
twine upload dist/*
```

## Automated Release (Proposed)

**Current State:** CI exists (tests only). No PyPI publish workflow. Publishing is manual.

### Proposed Workflow: `.github/workflows/release.yml`

```yaml
name: Publish to PyPI

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read
  id-token: write  # Required for trusted publishing

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install build dependencies
        run: |
          pip install build twine
      
      - name: Build package
        run: python -m build
      
      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
```

**Requires:** PyPI trusted publishing configured (OIDC).

## Testing Before Release

### Manual Test Checklist

```bash
# 1. Install clean version
pip uninstall dropitx
pip install dropitx

# 2. Test basic commands
dropitx --version
dropitx --help
dropitx config show

# 3. Test upload (requires API)
echo "test" | dropitx

# 4. Test QR (if installed)
pip install 'dropitx[qr]'
dropitx qr https://example.com

# 5. Test config commands
dropitx config set-key test_key
dropitx config show
dropitx config set-url https://api.example.com
```

### Run Test Suite

```bash
# Install dev dependencies
pip install -e '.[dev]'

# Run tests (13 tests, network-free)
pytest

# Run with coverage
pytest --cov=dropitx --cov-report=term-missing
```

**Test coverage:**
- Package version and module imports
- CLI surface (help, version, subcommands)
- `UploadResult` field mapping (camelCase → snake_case)
- Config/env resolution precedence
- QR generation (with optional dep guards)

### CI Status

Tests run automatically on:
- Push to `main` branch
- Pull requests

**Matrix:** Python 3.9 + 3.12  
**Status:** All 13 tests passing on both versions  
**Workflow:** `.github/workflows/ci.yml`

## Environment Variables for Deployment

### PyPI Upload
```bash
# Set PyPI token (if not using ~/.pypirc)
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-xxxx...

# Or use TestPyPI
export TWINE_REPOSITORY=testpypi
export TWINE_USERNAME=__token__
export TWINE_PASSWORD=pypi-xxxx...
```

### For Users (Runtime)
```bash
# API key (optional)
export DROPITX_API_KEY=shk_xxxxxxxxxxxxx

# Custom API URL
export DROPITX_API_URL=https://api.dropitx.site
```

## Common Issues

### Build Fails with "ModuleNotFoundError"

```bash
# Ensure all deps are installed
pip install -e '.[qr,dev]'

# Check pyproject.toml dependencies
cat pyproject.toml | grep dependencies
```

### Upload Fails with "403 Forbidden"

- Check PyPI token has write permissions
- Verify package name isn't taken (for new packages)
- Ensure version doesn't already exist on PyPI

### Version Mismatch Warning

```bash
# Verify version consistency
grep "version" pyproject.toml
grep "__version__" dropitx/__init__.py

# Must match exactly
```

## Release Checklist

### Before Release
- [ ] Bump version in `pyproject.toml` and `__init__.py`
- [ ] Update CHANGELOG.md (if it exists)
- [ ] Test all commands locally
- [ ] Run test suite (if tests exist)
- [ ] Build package: `python -m build`
- [ ] Check build: `twine check dist/*`

### After Release
- [ ] Tag release in git: `git tag -a v1.x.x`
- [ ] Push tags: `git push origin --tags`
- [ ] Upload to PyPI: `twine upload dist/*`
- [ ] Verify on PyPI: `pip install dropitx==1.x.x`
- [ ] Update GitHub Releases page

## Rollback Procedure

If a bad release is published:

```bash
# 1. Yank the release on PyPI (requires admin rights)
# Visit: https://pypi.org/manage/project/dropitx/releases/
# Click "Yank" for the bad version

# 2. Fix the issue locally
# 3. Bump version to new patch release
# 4. Publish new version
# 5. Update README to point users to new version
```

**Note:** PyPI doesn't allow deleting releases, only yanking (still installable but marked as yanked).

## Security Considerations

### Protecting API Tokens
- Never commit PyPI tokens to repo
- Use GitHub Secrets for CI/CD
- Rotate tokens if leaked

### Package Integrity
- Always verify with `twine check` before upload
- Use trusted publishing (OIDC) instead of tokens
- Check published package on PyPI after upload

---

**Last Updated:** 2026-06-28  
**Automation Status:** CI exists (tests green on 3.9+3.12); PyPI publishing is manual
