#!/bin/bash
cd /config || exit 1

# Stage all changes, including new and deleted files
git add -A

# Debug: List what's staged
echo "Staged files:" > /config/git_sync_result.txt
git diff --cached --name-only >> /config/git_sync_result.txt

# If nothing is staged, exit early
if git diff --cached --quiet; then
  echo -e "\nNothing to commit." >> /config/git_sync_result.txt
  exit 0
fi

# Commit and push
if git commit -m "Manual sync via dashboard button" >> /config/git_sync_result.txt 2>&1 && \
   git push origin main >> /config/git_sync_result.txt 2>&1; then
  echo -e "\n✅ Git sync successful." >> /config/git_sync_result.txt
else
  echo -e "\n❌ Git sync failed!" >> /config/git_sync_result.txt
  exit 1
fi
