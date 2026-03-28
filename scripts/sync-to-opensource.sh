#!/usr/bin/env bash
set -euo pipefail

# Sync open-source files from production → origin/main
# Usage: ./scripts/sync-to-opensource.sh [commit message]
#
# Only syncs files that actually differ from what's already on main.
# Premium-only paths are always excluded.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
PREMIUM_PATHS_FILE="$REPO_ROOT/.premium-paths"

if [ ! -f "$PREMIUM_PATHS_FILE" ]; then
  echo "ERROR: .premium-paths file not found at $PREMIUM_PATHS_FILE" >&2
  exit 1
fi

PREMIUM_PATHS=()
while IFS= read -r line; do
  [ "$line" = "---" ] && continue
  line="${line%%#*}"
  line="$(echo "$line" | xargs)"
  [ -n "$line" ] && PREMIUM_PATHS+=("$line")
done < "$PREMIUM_PATHS_FILE"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

bail() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
info() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }

ORIGINAL_BRANCH=$(git branch --show-current)

if [ -n "$(git status --porcelain)" ]; then
  bail "Working tree is dirty. Commit or stash changes first."
fi

if [ "$ORIGINAL_BRANCH" != "production" ]; then
  info "Switching to production branch..."
  git checkout production --quiet
  git pull private production --quiet 2>/dev/null || true
fi

git fetch origin main --quiet 2>/dev/null || bail "Could not fetch origin/main"

all_diff=$(git diff --name-only origin/main production)

if [ -z "$all_diff" ]; then
  info "Open-source repo is already up to date. Nothing to sync."
  exit 0
fi

# Filter to open-source files only
candidate_files=()
while IFS= read -r file; do
  skip=false
  for prefix in "${PREMIUM_PATHS[@]}"; do
    if [[ "$file" == "$prefix"* ]]; then
      skip=true
      break
    fi
  done
  if [ "$skip" = false ]; then
    candidate_files+=("$file")
  fi
done <<< "$all_diff"

if [ ${#candidate_files[@]} -eq 0 ]; then
  info "All differences are production-only. Nothing to sync."
  exit 0
fi

# Switch to main and check out candidates from production
info "Switching to main to check for real changes..."
git checkout main --quiet

for f in "${candidate_files[@]}"; do
  if git cat-file -e "production:$f" 2>/dev/null; then
    dir=$(dirname "$f")
    [ "$dir" != "." ] && mkdir -p "$dir"
    git checkout production -- "$f"
  else
    if [ -f "$f" ]; then
      git rm --quiet "$f" 2>/dev/null || true
    fi
  fi
done

git add -A

# Now check what ACTUALLY changed (files already identical are ignored by git)
actually_changed=$(git diff --cached --name-only)

if [ -z "$actually_changed" ]; then
  info "Open-source repo is already up to date. Nothing to sync."
  git checkout "$ORIGINAL_BRANCH" --quiet
  exit 0
fi

changed_count=$(echo "$actually_changed" | wc -l | tr -d ' ')

echo ""
info "=== Files that will be updated on open-source ($changed_count) ==="
echo "$actually_changed" | while IFS= read -r f; do
  echo "  $f"
done

echo ""
read -p "Proceed with sync? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  warn "Aborted. Restoring main to its previous state..."
  git reset HEAD --quiet
  git checkout -- . 2>/dev/null
  git clean -fd --quiet 2>/dev/null
  git checkout "$ORIGINAL_BRANCH" --quiet
  exit 0
fi

info "Running tsc --noEmit..."
if ! npx tsc --noEmit 2>&1; then
  echo ""
  warn "TypeScript check failed. Restoring main and switching back to $ORIGINAL_BRANCH..."
  git reset HEAD --quiet
  git checkout -- . 2>/dev/null
  git clean -fd --quiet 2>/dev/null
  git checkout "$ORIGINAL_BRANCH" --quiet
  bail "Fix the TypeScript errors on production first, then re-run."
fi

info "Running tests..."
if ! npx vitest run 2>&1; then
  echo ""
  warn "Tests failed. You may want to fix before pushing."
  read -p "Push anyway? [y/N] " push_anyway
  if [[ ! "$push_anyway" =~ ^[Yy]$ ]]; then
    git reset HEAD --quiet
    git checkout -- . 2>/dev/null
    git clean -fd --quiet 2>/dev/null
    git checkout "$ORIGINAL_BRANCH" --quiet
    exit 1
  fi
fi

commit_msg="${1:-Sync open-source files from production}"
git commit -m "$commit_msg"

info "Pushing to origin/main..."
git push origin main

info "Switching back to $ORIGINAL_BRANCH..."
git checkout "$ORIGINAL_BRANCH" --quiet

echo ""
info "Done! Synced $changed_count files to origin/main."
