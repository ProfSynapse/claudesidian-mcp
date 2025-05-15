#!/bin/bash

# Clear terminal
clear

echo "This script will replace the claudesidian-mem branch with a clean version"
echo "It will completely remove the commit with the API key"
echo ""
echo "1. Creating backup of the current branch"
git checkout new-clean-mem
git checkout -b backup-claudesidian-mem-$(date +%s) claudesidian-mem

echo ""
echo "2. Force copying new-clean-mem to claudesidian-mem branch"
git branch -D claudesidian-mem || true
git checkout -b claudesidian-mem
git add .
git commit --allow-empty -m "fix: Clean branch with data.json added to gitignore"

echo ""
echo "3. Instructions for pushing to GitHub:"
echo ""
echo "To push this clean branch to GitHub, run:"
echo "git push -f origin claudesidian-mem"
echo ""
echo "If that doesn't work, you'll need to go to this URL to unblock the secret:"
echo "https://github.com/ProfSynapse/claudesidian-mcp/security/secret-scanning/unblock-secret/2x8PH8c5MQxuqyKSFPEB6wqdndV"
echo ""
echo "Done! Your local branch is now clean with no API key in history."