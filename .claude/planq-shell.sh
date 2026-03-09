#!/usr/bin/env bash
# planq-shell.sh — Interactive REPL for planq.
#
# Type commands exactly as you would pass them to planq.sh on the command line:
#   list              list [-a]           l [-a]
#   show [N]          s [-a] [N]
#   r [N]             run [N] [--dry-run]
#   create "desc"     c -t plan -f file.md
#   mark done N       m underway N        mark:done N
#   delete N          x N
#   archive [N]       a --unarchive N
#   daemon status     d start
#   help
#   quit / exit / q / Ctrl+D

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLANQ="$SCRIPT_DIR/planq.sh"

if [ ! -f "$PLANQ" ]; then
    echo "Error: planq.sh not found at $PLANQ" >&2
    exit 1
fi

echo "planq shell — type commands as planq args (e.g. 'list', 'r 3', 'create \"desc\"', 'help')"
echo "Ctrl+D or 'quit' to exit."
echo ""

while true; do
    if [ -t 0 ]; then
        IFS= read -r -e -p "planq> " line || { echo ""; break; }
        [ -n "$line" ] && history -s "$line"
    else
        IFS= read -r line || break
    fi

    [[ -z "${line// }" ]] && continue

    case "${line%% *}" in
        quit|exit|q) break ;;
    esac

    eval "set -- $line" 2>/dev/null || { echo "parse error: $line" >&2; continue; }
    bash "$PLANQ" "$@"
    echo ""
done

echo "Bye."
