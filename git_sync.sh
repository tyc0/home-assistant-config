#!/bin/bash
cd /config

# Auto-commit with timestamp
git add .
git commit -m "Sync: $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main
