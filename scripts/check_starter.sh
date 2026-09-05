#!/usr/bin/env bash
set -euo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
starter_dir="$skill_dir/assets/starter"

cd "$starter_dir"
npm install
npm run verify:qr
npm run verify:import
npm run verify:colored
npm run verify:nature
npm run check
npm run build
