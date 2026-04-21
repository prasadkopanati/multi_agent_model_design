#!/usr/bin/env bash
# Creates the directory structure required by agenticspiq in the current directory.
set -euo pipefail

dirs=(
  artifacts/compiled
  artifacts/failures
  artifacts/logs
  artifacts/output
  worktrees
  repo
  tasks
)

for dir in "${dirs[@]}"; do
  mkdir -p "$dir"
  touch "$dir/.gitkeep"
done

if [ ! -f req.md ]; then
  cat > req.md << 'EOF'
# Feature Request

## Objective
<!-- What do you want to build? -->

## Target Users
<!-- Who will use this? -->

## Core Features
<!-- List the key functionality -->

## Acceptance Criteria
<!-- How will you know it is done? -->

## Tech Stack
<!-- Preferred technologies -->

## Constraints
<!-- Boundaries and limitations -->
EOF
  echo "Created req.md — fill it in before running agenticspiq"
fi

echo "Workspace initialised in $(pwd)"
