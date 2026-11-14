#!/usr/bin/env bash
# Run this before every commit:  bash scripts/check_secrets.sh
# It stops you if a secret is about to be committed or is already tracked.

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
fail=0

echo "1. Tracked env files (only .env.example is allowed):"
bad=$(git ls-files | grep -iE '(^|/)\.env' | grep -v '\.env\.example$')
if [ -n "$bad" ]; then echo "   FAIL, tracked: $bad"; fail=1; else echo "   ok"; fi

echo "2. Tavily-style keys in tracked files:"
if git grep -nE 'tvly-[A-Za-z0-9_-]{8,}' -- . >/dev/null 2>&1; then
  echo "   FAIL, a key-like value was found:"
  git grep -nE 'tvly-[A-Za-z0-9_-]{8,}' -- . | sed 's/tvly-[A-Za-z0-9_-]*/tvly-[hidden]/'
  fail=1
else echo "   ok"; fi

echo "3. Staged changes (not yet committed):"
if git diff --cached | grep -E '^\+' | grep -qE 'tvly-[A-Za-z0-9_-]{8,}'; then
  echo "   FAIL, a key-like value is staged"; fail=1
else echo "   ok"; fi

echo "4. Keys already in git history:"
if git log -p --all 2>/dev/null | grep -qE 'tvly-[A-Za-z0-9_-]{8,}'; then
  echo "   FAIL, a key is in the history. Revoke and regenerate it in the Tavily dashboard."
  fail=1
else echo "   ok"; fi

if [ "$fail" -eq 0 ]; then echo "All clear."; else echo "STOP. Fix the problems above before committing."; fi
exit "$fail"
