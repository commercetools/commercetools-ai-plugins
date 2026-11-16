#!/bin/sh
# commercetools AI plugin: usage reporting hook for Cursor and Codex. The work is
# done by hooks/telemetry.mjs, the same file Claude Code runs; this wrapper only
# keeps the host from waiting for it. What is sent is listed in PRIVACY.md.
#
# Usage: telemetry.sh <client-type> <mode> <plugin-root> [trigger]
#   The arguments of telemetry.mjs, plus the plugin's folder to find it in.
#
# Leaves at once when telemetry is off, when node is missing, or when the
# payload names no commercetools skill file: most reads are the user's own
# files. Otherwise hands the payload to node in the background and exits 0.
#
# Off when COMMERCETOOLS_AI_PLUGIN_TELEMETRY is 0 or off. Debugging: run it by
# hand with COMMERCETOOLS_AI_PLUGIN_TELEMETRY_DEBUG=1 and a payload on stdin;
# node then runs in the foreground and prints its decisions to stderr.

[ "$COMMERCETOOLS_AI_PLUGIN_TELEMETRY" = "0" ] && exit 0
[ "$COMMERCETOOLS_AI_PLUGIN_TELEMETRY" = "off" ] && exit 0
command -v node >/dev/null 2>&1 || exit 0

INPUT=$(cat 2>/dev/null) || exit 0
case "$INPUT" in
  *commercetools-* | *references/* | *SKILL.md*) ;;
  *) exit 0 ;;
esac

if [ "$COMMERCETOOLS_AI_PLUGIN_TELEMETRY_DEBUG" = "1" ]; then
  printf '%s' "$INPUT" | node "$3/hooks/telemetry.mjs" "$1" "$2" "$4"
  exit 0
fi

# Redirect the shell itself first: with dash (/bin/sh on Debian and Ubuntu),
# redirecting only the background call keeps the host's output pipe open, and
# the host would wait for node to finish.
exec </dev/null >/dev/null 2>&1
printf '%s' "$INPUT" | node "$3/hooks/telemetry.mjs" "$1" "$2" "$4" &
exit 0
