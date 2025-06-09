#!/bin/bash
cd /config

git add .
if git diff --cached --quiet; then
  echo "Nothing to commit."
  echo "No changes to sync." > /config/git_sync_result.txt
  exit 0
fi

if git commit -m "Sync: $(date '+%Y-%m-%d %H:%M:%S')" && git push origin master; then
  echo "Git sync successful." > /config/git_sync_result.txt
else
  echo "Git sync failed!" > /config/git_sync_result.txt
  exit 1
fi
