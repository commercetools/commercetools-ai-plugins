#!/bin/sh
# commercetools AI plugin telemetry — editor hook sensor.
#
# Reports skill activations and reference-file reads. This is the only layer that
# can see a PASSIVE reference read (the agent opening references/*.md without
# running anything). Runtimes without plugin hooks — Codex, Copilot — fall back
# to the in-skill telemetry.mjs beacon alone.
#
# Shared by Claude Code (hooks/hooks.json) and Cursor (hooks/cursor-hooks.json),
# whose hook systems differ in event names, payload fields and root variable but
# agree on "spawn a process, hand it JSON on stdin".
#
# Invoked as: telemetry.sh <client-type> <activation|resource|auto> <plugin-root> [setting]
#   trigger  which matcher fired: user-invoked (the user named the skill),
#            model-invoked (the model chose it), or read. Sent as a parameter,
#            because "did someone ask for this skill or did the model reach for
#            it" is a different question about a skill than how often it is used.
#   auto  derive the event from the path: a SKILL.md read is an activation,
#         anything else under the skill is a resource read. Used by Cursor, which
#         has no distinct skill-invocation event.
#
# Contract, in order of importance:
#   1. Never block, never fail, never print. Always exit 0.
#   2. Cost nothing on the overwhelming majority of calls. The read matchers fire
#      on EVERY file the agent opens, so the first test below is a substring
#      check that bails before doing any work.
#   3. Send the skill name, the resource path within the skill, the runtime, the
#      model where the payload states it, and a hashed conversation id. Nothing
#      else. Cursor payloads carry a user_email field and both runtimes carry
#      absolute paths — neither is ever forwarded.
#
# Opt out with COMMERCETOOLS_AI_PLUGIN_TELEMETRY=0.
#
# Debugging: `touch ~/.commercetools-telemetry-debug` and every invocation
# appends a line to that file saying what it decided and why. A marker file
# rather than an env var because the editors that run this are GUI apps, where
# exporting a variable into the process is awkward. Delete the file to stop.

# Overridable so the pipeline can be pointed at a local receiver for testing.
ENDPOINT="${COMMERCETOOLS_AI_PLUGIN_TELEMETRY_ENDPOINT:-https://docs.commercetools.com/apis/rest/tools/ai-plugin-telemetry}"

[ "$COMMERCETOOLS_AI_PLUGIN_TELEMETRY" = "0" ] && exit 0
[ "$COMMERCETOOLS_AI_PLUGIN_TELEMETRY" = "off" ] && exit 0

CLIENT_TYPE="$1"
EVENT="$2"
PLUGIN_ROOT="$3"
TRIGGER="$4"

DEBUG_LOG=""
[ -f "$HOME/.commercetools-telemetry-debug" ] && DEBUG_LOG="$HOME/.commercetools-telemetry-debug"
dbg() {
  [ -n "$DEBUG_LOG" ] && printf '%s %-11s %-10s %s\n' \
    "$(date -u '+%H:%M:%S')" "$CLIENT_TYPE" "$EVENT" "$*" >> "$DEBUG_LOG" 2>/dev/null
  return 0
}

# The plugin-level toggle the user is shown when enabling the plugin. Read from
# the environment, not from an argument: the host REJECTS a shell-form command
# that interpolates ${user_config.*}, because the substituted value would be
# re-parsed by the shell. Interpolating it silently disabled every hook in this
# plugin — the error is only visible under `claude --debug hooks`.
[ "$CLAUDE_PLUGIN_OPTION_TELEMETRY" = "false" ] && { dbg "skip: plugin setting is off"; exit 0; }

INPUT=$(cat 2>/dev/null) || exit 0

# Fast path: bail before spending anything on the ~99% of reads that are the
# user's own files.
case "$INPUT" in
  *commercetools-*) ;;
  *) dbg "skip: payload mentions no commercetools skill"; exit 0 ;;
esac

command -v curl >/dev/null 2>&1 || { dbg "skip: no curl on PATH"; exit 0; }

# Read the version we ship rather than baking it in, so a release never has to
# rewrite this file. Empty if unreadable — an empty column, not a failure.
PLUGIN_VERSION=""
if [ -n "$PLUGIN_ROOT" ] && [ -r "$PLUGIN_ROOT/plugin.json" ]; then
  PLUGIN_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN_ROOT/plugin.json" | head -n 1)
fi

# A random id for this installation, stable across sessions. Never removed when
# telemetry is switched off: the switch is an environment variable, so it is
# per-shell and per-directory, and a session that has it set must not destroy
# state belonging to sessions that do not. Nothing is written while it is off
# either — the opt-out check above returns before this point.
# Home first, then the temp dir. A sandbox commonly denies $HOME while allowing
# temp writes, and such a sandbox is often kept for a whole task rather than
# rebuilt per command, so a temp-scoped id still identifies something real —
# just something shorter-lived. Reported as installIdSource so the two are never
# confused: `home` is durable, `temp` dies with the temp dir.
#
# An id that cannot be persisted is never sent: it would be new on every call
# and would report one machine as many. Written 0600 so a shared /tmp does not
# hand one id to two users.
INSTALL_ID=""
INSTALL_ID_SOURCE=""
TMPDIR_PATH="${TMPDIR:-/tmp}"

for CANDIDATE_SOURCE in home temp; do
  [ -n "$INSTALL_ID" ] && break
  if [ "$CANDIDATE_SOURCE" = home ]; then
    CANDIDATE_DIR="$HOME/.commercetools"
    CANDIDATE_FILE="$CANDIDATE_DIR/ai-plugin-install-id"
  else
    CANDIDATE_DIR="${TMPDIR_PATH%/}"
    CANDIDATE_FILE="$CANDIDATE_DIR/ct-ai-plugin-install-id"
  fi

  if [ -r "$CANDIDATE_FILE" ]; then
    INSTALL_ID=$(head -n 1 "$CANDIDATE_FILE" 2>/dev/null | tr -dc 'a-f0-9')
    [ -n "$INSTALL_ID" ] && INSTALL_ID_SOURCE="$CANDIDATE_SOURCE"
  fi
done

if [ -z "$INSTALL_ID" ] && [ -r /dev/urandom ]; then
  NEW_ID=$(od -An -tx1 -N16 /dev/urandom 2>/dev/null | tr -dc 'a-f0-9')
  if [ -n "$NEW_ID" ]; then
    for CANDIDATE_SOURCE in home temp; do
      [ -n "$INSTALL_ID" ] && break
      if [ "$CANDIDATE_SOURCE" = home ]; then
        CANDIDATE_DIR="$HOME/.commercetools"
        CANDIDATE_FILE="$CANDIDATE_DIR/ai-plugin-install-id"
      else
        CANDIDATE_DIR="${TMPDIR_PATH%/}"
        CANDIDATE_FILE="$CANDIDATE_DIR/ct-ai-plugin-install-id"
      fi
      { mkdir -p "$CANDIDATE_DIR" &&
        (umask 077 && printf '%s\n' "$NEW_ID" > "$CANDIDATE_FILE"); } 2>/dev/null || true
      # Read back rather than trusting the write: a read-only mount can fail
      # silently, and an id we did not store must not be sent.
      if [ -r "$CANDIDATE_FILE" ]; then
        INSTALL_ID=$(head -n 1 "$CANDIDATE_FILE" 2>/dev/null | tr -dc 'a-f0-9')
        [ -n "$INSTALL_ID" ] && INSTALL_ID_SOURCE="$CANDIDATE_SOURCE"
      fi
    done
  fi
fi

# Coarse vendor, sent alongside the precise clientType. The same runtime has
# been reported three different ways over time, and folding those together
# belongs in the data rather than in whatever queries the logs. Substring match,
# so "vscode-copilot" folds to copilot rather than vscode.
CLIENT_FAMILY=$(printf '%s' "$CLIENT_TYPE" | tr '[:upper:]' '[:lower:]')
case "$CLIENT_FAMILY" in
  *claude*) CLIENT_FAMILY=claude ;;
  *copilot*) CLIENT_FAMILY=copilot ;;
  *codex*) CLIENT_FAMILY=codex ;;
  *cursor*) CLIENT_FAMILY=cursor ;;
esac

SKILL=""
RESOURCE=""

if [ "$EVENT" = "activation" ]; then
  # Claude Code's Skill tool names the skill in the payload. Scanning for the
  # slug is payload-shape agnostic, but a bare pattern match would also hit a
  # string like "someone@commercetools-labs.com", so every candidate is checked
  # against the skills we actually ship and anything else is dropped. We never
  # want a user identifier, not even a fragment of one.
  for CANDIDATE in $(printf '%s' "$INPUT" | grep -oE 'commercetools-[a-z0-9-]+' | sort -u); do
    if [ -d "$PLUGIN_ROOT/skills/$CANDIDATE" ]; then
      SKILL="$CANDIDATE"
      break
    fi
  done
else
  # Pull the file path out of the payload without assuming jq is installed, then
  # keep only paths inside one of our skills. Anything else is not our data.
  FILE_PATH=$(printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
  case "$FILE_PATH" in
    */skills/commercetools-*) ;;
    *) dbg "skip: read outside a skill dir"; exit 0 ;;
  esac
  SKILL=$(printf '%s' "$FILE_PATH" | sed -n 's|.*/skills/\(commercetools-[^/]*\)/.*|\1|p')
  # Same guarantee as the activation path: only names we ship are ever reported.
  [ -n "$PLUGIN_ROOT" ] && [ ! -d "$PLUGIN_ROOT/skills/$SKILL" ] && { dbg "skip: $SKILL is not a shipped skill"; exit 0; }
  # Everything after the skill directory: 'references/b2b/quotes.md', 'SKILL.md'.
  # The full in-skill path rather than a basename, since reference layouts will
  # keep evolving and the shape is worth knowing. Never the absolute path.
  RESOURCE=$(printf '%s' "$FILE_PATH" | sed -n 's|.*/skills/commercetools-[^/]*/||p')

  if [ "$EVENT" = "auto" ]; then
    # Reading a skill's own SKILL.md is how that skill gets activated.
    case "$RESOURCE" in
      SKILL.md) EVENT="activation" ;;
      *) EVENT="resource" ;;
    esac
  fi
fi

[ -z "$SKILL" ] && { dbg "skip: no shipped skill named in payload"; exit 0; }

# Cursor states the model in every hook payload, so on that runtime this is a
# verified value rather than the model's self-report. Claude Code payloads carry
# no model field and the column stays empty.
MODEL=$(printf '%s' "$INPUT" | sed -n 's/.*"model"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)

# Correlate the calls of one session without learning anything about the user:
# the raw id is hashed and only a prefix is sent. Claude Code calls it
# session_id, Cursor calls it conversation_id.
SESSION_RAW=$(printf '%s' "$INPUT" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
[ -z "$SESSION_RAW" ] && SESSION_RAW=$(printf '%s' "$INPUT" | sed -n 's/.*"conversation_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
SESSION=""
if [ -n "$SESSION_RAW" ]; then
  if command -v shasum >/dev/null 2>&1; then
    SESSION=$(printf '%s' "$SESSION_RAW" | shasum -a 256 2>/dev/null | cut -c1-32)
  elif command -v sha256sum >/dev/null 2>&1; then
    SESSION=$(printf '%s' "$SESSION_RAW" | sha256sum 2>/dev/null | cut -c1-32)
  fi
fi

# Seed the id the in-skill scripts read, so a docs search that follows this
# activation lands in the same correlation space. The hooks are the only layer
# that knows the real session, so they are the right side to write it.
# The braces matter: `2>/dev/null` on the printf alone silences printf, not the
# shell's own "cannot create" message when the redirect target is unwritable.
# A sandbox with a read-only TMPDIR would otherwise make this hook print to
# stderr, which the host may surface as a hook failure.
if [ -n "$SESSION" ]; then
  TMPDIR_PATH="${TMPDIR:-/tmp}"
  { printf '{"id":"%s","ts":%s,"seq":1,"src":"host"}' "$SESSION" "$(( $(date +%s) * 1000 ))" \
      > "${TMPDIR_PATH%/}/ct-ai-plugin-invocation-${CLIENT_FAMILY}.json"; } 2>/dev/null || true
fi

# --data-urlencode -G keeps paths and slugs safe without hand-rolled escaping.
set -- \
  --get \
  --silent --show-error --output /dev/null \
  --max-time 2 \
  --user-agent "$CLIENT_TYPE/1.0 (hook)" \
  --header "X-Client-Type: $CLIENT_TYPE" \
  --header "X-Skill-Name: $SKILL" \
  --data-urlencode "event=$EVENT" \
  --data-urlencode "skillName=$SKILL" \
  --data-urlencode "clientType=$CLIENT_TYPE" \
  --data-urlencode "clientFamily=$CLIENT_FAMILY" \
  --data-urlencode "pluginVersion=$PLUGIN_VERSION" \
  --data-urlencode "source=hook"

[ -n "$TRIGGER" ] && set -- "$@" --data-urlencode "trigger=$TRIGGER"

[ -n "$RESOURCE" ] && set -- "$@" --data-urlencode "resource=$RESOURCE"
if [ -n "$INSTALL_ID" ]; then
  set -- "$@" --data-urlencode "installId=$INSTALL_ID" \
              --data-urlencode "installIdSource=$INSTALL_ID_SOURCE"
fi
if [ -n "$SESSION" ]; then
  set -- "$@" --data-urlencode "invocation=$SESSION" \
              --data-urlencode "invocationSource=host"
fi
if [ -n "$MODEL" ]; then
  set -- "$@" --data-urlencode "model=$MODEL" --header "X-Model: $MODEL"
fi

# Fire and forget. A PostToolUse hook is synchronous — the agent waits for it —
# and a blocking request adds most of a second to every read of one of our
# reference files. Detaching drops that to the cost of spawning a shell. It also
# means delivery is not guaranteed if the process group is torn down straight
# after, which is the right trade for telemetry: the user's latency matters and
# a lost beacon does not.
if [ -n "$DEBUG_LOG" ]; then
  # Synchronous while debugging, so the log can record what came back. This is
  # the one path where blocking is acceptable: you asked for it.
  CODE=$(curl "$@" --write-out '%{http_code}' "$ENDPOINT" 2>/dev/null)
  dbg "sent trigger=${TRIGGER:-none} skill=$SKILL resource=${RESOURCE:-none} -> HTTP ${CODE:-no-response} $ENDPOINT"
else
  (curl "$@" "$ENDPOINT" >/dev/null 2>&1 &) 2>/dev/null
fi

exit 0
