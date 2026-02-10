#!/usr/bin/env bash
set -euo pipefail

# ─── Init: Install observability hooks into a target repo ───
# Copies .claude/ hook infrastructure into a target repo non-destructively.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_CLAUDE="$(cd "$SCRIPT_DIR/../.claude" && pwd)"

# ─── Defaults ───
DRY_RUN=false
FORCE=false
WITH_AGENTS=false
WITH_COMMANDS=false
WITH_SKILLS=false
WITH_OUTPUT_STYLES=false
SOURCE_APP=""
TARGET=""

# ─── Counters ───
INSTALLED=0
SKIPPED=0
SKIPPED_FILES=()

usage() {
  cat <<'EOF'
Usage: init.sh [flags] <target-repo-path>

Install observability hooks into a target repo's .claude/ directory.

Flags:
  --source-app <name>    Set OBSERVABILITY_APP_NAME (default: target dir basename)
  --dry-run              Show what would be done without writing
  --force                Overwrite existing files
  --with-agents          Also install agents/
  --with-commands        Also install commands/
  --with-skills          Also install skills/
  --with-output-styles   Also install output-styles/
  --with-all             Install all optional extras
  -h, --help             Show this help
EOF
  exit 0
}

# ─── Argument parsing ───
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-app) SOURCE_APP="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --force) FORCE=true; shift ;;
    --with-agents) WITH_AGENTS=true; shift ;;
    --with-commands) WITH_COMMANDS=true; shift ;;
    --with-skills) WITH_SKILLS=true; shift ;;
    --with-output-styles) WITH_OUTPUT_STYLES=true; shift ;;
    --with-all)
      WITH_AGENTS=true; WITH_COMMANDS=true; WITH_SKILLS=true; WITH_OUTPUT_STYLES=true
      shift ;;
    -h|--help) usage ;;
    -*) echo "Unknown flag: $1" >&2; exit 1 ;;
    *) TARGET="$1"; shift ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "Error: target repo path is required." >&2
  usage
fi

TARGET="$(cd "$TARGET" 2>/dev/null && pwd || echo "$TARGET")"
TARGET_CLAUDE="$TARGET/.claude"

if [[ -z "$SOURCE_APP" ]]; then
  SOURCE_APP="$(basename "$TARGET")"
fi

# ─── Helpers ───

copy_file() {
  local rel="$1"  # relative path from .claude/
  local src="$SOURCE_CLAUDE/$rel"
  local dst="$TARGET_CLAUDE/$rel"

  if [[ ! -f "$src" ]]; then
    return
  fi

  if [[ -f "$dst" ]] && [[ "$FORCE" != true ]]; then
    SKIPPED=$((SKIPPED + 1))
    SKIPPED_FILES+=("$rel")
    return
  fi

  if [[ "$DRY_RUN" == true ]]; then
    echo "  [dry-run] $rel"
    INSTALLED=$((INSTALLED + 1))
    return
  fi

  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  INSTALLED=$((INSTALLED + 1))
}

copy_dir() {
  local dir="$1"  # relative dir from .claude/
  local src_dir="$SOURCE_CLAUDE/$dir"

  if [[ ! -d "$src_dir" ]]; then
    return
  fi

  while IFS= read -r -d '' file; do
    local rel="${file#"$SOURCE_CLAUDE/"}"
    copy_file "$rel"
  done < <(find "$src_dir" -type f -not -path '*/__pycache__/*' -print0)
}

# ─── settings.json merge ───

merge_settings() {
  local target_settings="$TARGET_CLAUDE/settings.json"
  local source_settings="$SOURCE_CLAUDE/settings.json"

  if [[ "$DRY_RUN" == true ]]; then
    echo "  [dry-run] settings.json (merge)"
    INSTALLED=$((INSTALLED + 1))
    return
  fi

  mkdir -p "$TARGET_CLAUDE"

  python3 -c "
import json, sys

source_app = sys.argv[1]
source_path = sys.argv[2]
target_path = sys.argv[3]

with open(source_path) as f:
    source = json.load(f)

# Load existing target or start fresh
try:
    with open(target_path) as f:
        target = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    target = {}

# Merge hooks: add hook types that don't exist in target
source_hooks = source.get('hooks', {})
target_hooks = target.setdefault('hooks', {})
for hook_type, hook_val in source_hooks.items():
    if hook_type not in target_hooks:
        target_hooks[hook_type] = hook_val

# Set statusLine only if absent
if 'statusLine' not in target:
    target['statusLine'] = source.get('statusLine')

# Set env.OBSERVABILITY_APP_NAME only if not already set
target_env = target.setdefault('env', {})
if 'OBSERVABILITY_APP_NAME' not in target_env:
    target_env['OBSERVABILITY_APP_NAME'] = source_app

with open(target_path, 'w') as f:
    json.dump(target, f, indent=2)
    f.write('\n')
" "$SOURCE_APP" "$source_settings" "$target_settings"

  INSTALLED=$((INSTALLED + 1))
}

# ─── Main ───

echo "Observability init: $SOURCE_CLAUDE → $TARGET_CLAUDE"
echo "  source-app: $SOURCE_APP"
[[ "$DRY_RUN" == true ]] && echo "  (dry-run mode)"
[[ "$FORCE" == true ]] && echo "  (force mode)"
echo ""

# Core: top-level hook scripts (excluding test_hitl.py)
for file in "$SOURCE_CLAUDE"/hooks/*.py; do
  base="$(basename "$file")"
  [[ "$base" == "test_hitl.py" ]] && continue
  copy_file "hooks/$base"
done

# Core: hooks/utils/
copy_dir "hooks/utils"

# Core: status_lines/
copy_dir "status_lines"

# Core: settings.json (merged)
merge_settings

# Optional extras
[[ "$WITH_AGENTS" == true ]] && copy_dir "agents"
[[ "$WITH_COMMANDS" == true ]] && copy_dir "commands"
[[ "$WITH_SKILLS" == true ]] && copy_dir "skills"
[[ "$WITH_OUTPUT_STYLES" == true ]] && copy_dir "output-styles"

# ─── Summary ───
echo ""
echo "Done: $INSTALLED installed, $SKIPPED skipped"
if [[ ${#SKIPPED_FILES[@]} -gt 0 ]]; then
  echo "Skipped (already exist):"
  for f in "${SKIPPED_FILES[@]}"; do
    echo "  $f"
  done
fi
