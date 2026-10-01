#!/bin/sh
# commercetools AI plugin telemetry — editor hook sensor.
#
# Reports skill activations and reference-file reads. This is the only layer that
# can see a PASSIVE reference read (the agent opening references/*.md without
# running anything). Runtimes without working plugin hooks — Copilot today —
# are covered by the in-skill scripts alone.
#
# Shared by Claude Code (hooks/hooks.json), Cursor (hooks/cursor-hooks.json) and
# Codex (hooks/codex-hooks.json, shipped as hooks/hooks.json in the Codex
# bundle), whose hook systems differ in event names, payload fields and root
# variable but agree on "spawn a process, hand it JSON on stdin".
#
# Invoked as: telemetry.sh <client-type> <mode> <plugin-root> [trigger]
#   mode     activation  the payload names the skill (Claude Code's Skill tool
#                        and slash-command expansion)
#            prompt      the user typed `$commercetools-…` (Codex, where the
#                        skill is injected without any file read to see)
#            resource    every matching path is a resource read, SKILL.md too
#            auto        a SKILL.md read is an activation, anything else a
#                        resource read (Cursor and Codex, which have no
#                        distinct skill-invocation event)
#   trigger  how an activation came about: user-invoked (the user named the
#            skill) or model-invoked (the model chose it). Resource reads are
#            always `read`. Sent because "did someone ask for this skill or did
#            the model reach for it" is a different question from how often it
#            is used.
#
# Which paths count. A path segment starting with `commercetools-` directly
# followed by `SKILL.md` or `references/…`, wherever it sits — absolute,
# relative, or relative to the payload's cwd when the agent works from inside
# the skill folder. Nothing else in a skill (examples/, scripts/) counts. The
# name must also exist under <plugin-root>/skills/: teams write their own skills
# with our prefix, and those names are theirs, not ours to collect.
#
# Contract, in order of importance:
#   1. Never block, never fail, never print. Always exit 0.
#   2. Cost nothing on the overwhelming majority of calls. The read matchers fire
#      on EVERY file the agent opens, so the first test below is a substring
#      check that bails before doing any work.
#   3. Send the skill name, the resource path within the skill, the runtime, the
#      model where the payload states it, a hashed conversation id, the
#      commercetools project the in-skill scripts recorded for this session, and
#      the domain of the developer's email address. Never an absolute path, and
#      never the part of an email address before the @.
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
MODE="$2"
PLUGIN_ROOT="$3"
TRIGGER="$4"

DEBUG_LOG=""
[ -f "$HOME/.commercetools-telemetry-debug" ] && DEBUG_LOG="$HOME/.commercetools-telemetry-debug"
dbg() {
  [ -n "$DEBUG_LOG" ] && printf '%s %-11s %-10s %s\n' \
    "$(date -u '+%H:%M:%S')" "$CLIENT_TYPE" "$MODE" "$*" >> "$DEBUG_LOG" 2>/dev/null
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
# user's own files. A bare `references/…` or `SKILL.md` passes too: a read
# made from inside a skill folder names no skill (see skill_paths), and whether
# it is ours is decided later, in the background.
case "$INPUT" in
  *commercetools-* | *references/* | *SKILL.md*) ;;
  *) dbg "skip: payload mentions no commercetools skill"; exit 0 ;;
esac

# Everything past this point runs in the background, and the hook returns now.
# The work below is a few dozen short-lived processes, and a process start is
# not cheap everywhere: on a Mac with endpoint security software it measured
# ~150 ms each, which added up to 4 s — past Codex's hook timeout, so the hook
# was killed and reported as failed. Cursor's beforeReadFile is worse off still,
# because the file read waits for the hook. Handing the payload to a detached
# copy of this script makes the host wait for one process start, not forty.
if [ -z "$CT_AI_PLUGIN_TELEMETRY_DETACHED" ]; then
  (printf '%s' "$INPUT" | CT_AI_PLUGIN_TELEMETRY_DETACHED=1 sh "$0" "$@" >/dev/null 2>&1 &) 2>/dev/null
  exit 0
fi

command -v curl >/dev/null 2>&1 || { dbg "skip: no curl on PATH"; exit 0; }


# Read the version we ship rather than baking it in, so a release never has to
# rewrite this file. Empty if unreadable — an empty column, not a failure. The
# Codex bundle has no root plugin.json, only its own manifest.
PLUGIN_VERSION=""
for MANIFEST in "$PLUGIN_ROOT/plugin.json" "$PLUGIN_ROOT/.codex-plugin/plugin.json"; do
  [ -n "$PLUGIN_VERSION" ] && break
  [ -n "$PLUGIN_ROOT" ] && [ -r "$MANIFEST" ] || continue
  PLUGIN_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$MANIFEST" | head -n 1)
done

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

# ---------------------------------------------------------------------------
# Reading the payload, without assuming jq is installed.
# ---------------------------------------------------------------------------

# Everything from "tool_response" on is dropped before anything is scanned. It
# holds what the tool returned — the text of the skill that was just read —
# and a skill that links to another skill would otherwise report a read of it.
SCAN_INPUT=$(printf '%s' "$INPUT" | sed 's/"tool_response".*//')

# The raw value of one JSON string field. Escaped quotes inside the value are
# kept, so a shell command that quotes a path is not cut short at the quote.
json_field() {
  printf '%s' "$SCAN_INPUT" |
    sed -n -E "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"(([^\"\\\\]|\\\\.)*)\".*/\1/p" |
    head -n 1
}

# Undo the JSON escaping that matters for paths. An escaped backslash becomes a
# forward slash, which also turns a Windows path into one the patterns below
# understand; escaped newlines and tabs separate words like spaces do.
json_unescape() {
  sed -e 's/\\\\/\//g' -e 's/\\[nt]/ /g' -e 's/\\"/"/g' -e 's/\\\//\//g'
}

# One word per line: splits a shell command, or a list of paths, at anything a
# path cannot contain unquoted.
words() {
  tr ' \t"'"'"'=;|&<>(),`' '\n\n\n\n\n\n\n\n\n\n\n\n\n' | sed '/^$/d'
}

is_shipped() {
  [ -z "$PLUGIN_ROOT" ] && return 0
  [ -d "$PLUGIN_ROOT/skills/$1" ]
}

# Lines of "<skill> <resource>" for every path in the payload that points into
# one of our skills. The resource is everything after the skill folder, e.g.
# `references/b2b/quotes.md` — the in-skill path rather than a basename, because
# reference layouts keep evolving and the shape is worth knowing.
skill_paths() {
  TEXT=$(for FIELD in file_path path command; do json_field "$FIELD"; done | json_unescape)
  CWD=$(json_field cwd | json_unescape)
  CWD_SKILL=$(printf '%s' "$CWD" | sed -n -E 's#^(.*/)?(commercetools-[a-z0-9-]+)/?$#\2#p')

  printf '%s\n' "$TEXT" | words | while IFS= read -r WORD; do
    MATCH=$(printf '%s' "$WORD" |
      sed -n -E 's#^(.*/)?(commercetools-[a-z0-9-]+)/(SKILL\.md|references(/[A-Za-z0-9_./-]*)?)$#\2 \3#p')
    if [ -z "$MATCH" ]; then
      # Working from inside the skill folder: `cat references/cart.md`. The
      # folder is the payload's cwd when the host reports it that way. Codex
      # does not — its cwd is the session root and a command's own working
      # directory is not in the payload — so the fallback is the skill this
      # session last reported, and only when that skill really has the file.
      BARE=$(printf '%s' "$WORD" |
        sed -n -E 's#^(\./)?(SKILL\.md|references(/[A-Za-z0-9_./-]*)?)$#\2#p')
      BARE="${BARE%/}"
      if [ -n "$BARE" ]; then
        if [ -n "$CWD_SKILL" ]; then
          MATCH="$CWD_SKILL $BARE"
        elif [ -n "$LAST_SKILL" ] && [ -n "$PLUGIN_ROOT" ] && [ -e "$PLUGIN_ROOT/skills/$LAST_SKILL/$BARE" ]; then
          MATCH="$LAST_SKILL $BARE"
        fi
      fi
    fi
    [ -n "$MATCH" ] && printf '%s\n' "${MATCH%/}"
  done
}

# Lines of "<skill>" named by the payload itself.
skill_names() {
  case "$MODE" in
    prompt)
      json_field prompt | grep -oE '\$(commercetools:)?commercetools-[a-z0-9-]+' |
        sed 's/.*\(commercetools-[a-z0-9-]*\)$/\1/'
      ;;
    *)
      # The namespaced form first (`commercetools:commercetools-cart`): it is
      # the invoked skill, whereas a bare name can be any skill the payload
      # happens to mention.
      printf '%s' "$SCAN_INPUT" | grep -oE 'commercetools:commercetools-[a-z0-9-]+' |
        sed 's/^commercetools://'
      printf '%s' "$SCAN_INPUT" | grep -oE 'commercetools-[a-z0-9-]+'
      ;;
  esac
}

# Lines of "<event> <skill> <resource-or-dash>", deduplicated. Capped, so a
# command listing a whole directory tree cannot fan out into a burst of requests.
collect_events() {
  case "$MODE" in
    activation)
      for NAME in $(skill_names); do
        is_shipped "$NAME" && { printf 'activation %s -\n' "$NAME"; break; }
      done
      ;;
    prompt)
      for NAME in $(skill_names); do
        is_shipped "$NAME" && printf 'activation %s -\n' "$NAME"
      done
      ;;
    resource | auto)
      skill_paths | while read -r NAME RESOURCE; do
        is_shipped "$NAME" || continue
        if [ "$MODE" = auto ] && [ "$RESOURCE" = SKILL.md ]; then
          printf 'activation %s %s\n' "$NAME" "$RESOURCE"
        else
          printf 'resource %s %s\n' "$NAME" "$RESOURCE"
        fi
      done
      ;;
  esac
}
# ---------------------------------------------------------------------------
# Session, and the commercetools project recorded for it.
# ---------------------------------------------------------------------------

# Correlate the calls of one session without learning anything about the user:
# the raw id is hashed and only a prefix is sent. Claude Code and Codex call it
# session_id, Cursor conversation_id, Copilot sessionId.
SESSION_RAW=""
for FIELD in session_id conversation_id sessionId; do
  [ -n "$SESSION_RAW" ] && break
  SESSION_RAW=$(json_field "$FIELD")
done
SESSION=""
if [ -n "$SESSION_RAW" ]; then
  if command -v shasum >/dev/null 2>&1; then
    SESSION=$(printf '%s' "$SESSION_RAW" | shasum -a 256 2>/dev/null | cut -c1-32)
  elif command -v sha256sum >/dev/null 2>&1; then
    SESSION=$(printf '%s' "$SESSION_RAW" | sha256sum 2>/dev/null | cut -c1-32)
  fi
fi

# A plain value from our own state files, restricted to what a key, region or
# domain can contain.
state_value() {
  printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" |
    head -n 1 | tr -dc 'A-Za-z0-9_.-'
}

# What this session already knows, read before the payload is interpreted: the
# commercetools project the scripts recorded, and the last skill reported.
CT_PROJECT_KEY=""
CT_REGION=""
CT_PROJECT_SOURCE=""
LAST_SKILL=""
SEQ=1
SESSION_FILE=""
if [ -n "$SESSION" ]; then
  SESSION_FILE="${TMPDIR_PATH%/}/ct-ai-plugin-invocation-${CLIENT_FAMILY}.json"
  PREVIOUS=$(cat "$SESSION_FILE" 2>/dev/null)
  if [ -n "$PREVIOUS" ] && [ "$(state_value "$PREVIOUS" id)" = "$SESSION" ]; then
    CT_PROJECT_KEY=$(state_value "$PREVIOUS" ctProjectKey)
    CT_REGION=$(state_value "$PREVIOUS" ctRegion)
    CT_PROJECT_SOURCE=$(state_value "$PREVIOUS" ctProjectSource)
    LAST_SKILL=$(state_value "$PREVIOUS" lastSkill)
    SEQ=$(printf '%s' "$PREVIOUS" | sed -n 's/.*"seq"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -n 1)
    [ -n "$SEQ" ] || SEQ=1
  fi
fi

EVENTS=$(collect_events | awk '!seen[$0]++' | head -n 10)

[ -z "$EVENTS" ] && { dbg "skip: no shipped skill in payload"; exit 0; }

# Cursor and Codex state the model in every hook payload, so on those runtimes
# this is a verified value rather than the model's self-report. Claude Code
# payloads carry no model field and the column stays empty.
MODEL=$(json_field model)

# Seed the id the in-skill scripts read, so a docs search that follows this
# activation lands in the same correlation space. The hooks are the only layer
# that knows the real session, so they are the right side to write it.
#
# The scripts store the commercetools project key and region in the same file
# once the agent passes them. Those are kept for as long as the session is the
# same one, and reported with every hook event of it; a new session starts
# without them. `lastSkill` is this hook's own note, for the bare relative
# paths above.
#
# The braces matter: `2>/dev/null` on the printf alone silences printf, not the
# shell's own "cannot create" message when the redirect target is unwritable.
# A sandbox with a read-only TMPDIR would otherwise make this hook print to
# stderr, which the host may surface as a hook failure.
if [ -n "$SESSION_FILE" ]; then
  LAST_SKILL=$(printf '%s\n' "$EVENTS" | tail -n 1 | cut -d ' ' -f 2)
  STATE=$(printf '{"id":"%s","ts":%s,"seq":%s,"src":"host"' "$SESSION" "$(( $(date +%s) * 1000 ))" "$SEQ")
  [ -n "$CT_PROJECT_KEY" ] && STATE="$STATE,\"ctProjectKey\":\"$CT_PROJECT_KEY\""
  [ -n "$CT_REGION" ] && STATE="$STATE,\"ctRegion\":\"$CT_REGION\""
  [ -n "$CT_PROJECT_SOURCE" ] && STATE="$STATE,\"ctProjectSource\":\"$CT_PROJECT_SOURCE\""
  [ -n "$LAST_SKILL" ] && STATE="$STATE,\"lastSkill\":\"$LAST_SKILL\""
  { printf '%s}' "$STATE" > "$SESSION_FILE"; } 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Email domain, per installation.
# ---------------------------------------------------------------------------

# Precedence: what the host states, then what is stored. A host that hands us
# the signed-in user's email (Cursor) is the best source there is, so its domain
# is stored on every event and overwrites whatever the scripts took from git.
# Only the part after the @ is ever read out of it.
EMAIL_DOMAIN=""
EMAIL_DOMAIN_SOURCE=""
HOST_EMAIL=$(json_field user_email)
[ -z "$HOST_EMAIL" ] && HOST_EMAIL="$CURSOR_USER_EMAIL"
case "$HOST_EMAIL" in
  *@*)
    EMAIL_DOMAIN=$(printf '%s' "${HOST_EMAIL##*@}" | tr '[:upper:]' '[:lower:]' | tr -dc 'a-z0-9.-')
    EMAIL_DOMAIN_SOURCE="$CLIENT_FAMILY"
    ;;
esac

for CANDIDATE_FILE in "$HOME/.commercetools/ai-plugin-email-domain" "${TMPDIR_PATH%/}/ct-ai-plugin-email-domain"; do
  STORED=$(cat "$CANDIDATE_FILE" 2>/dev/null)
  if [ -n "$EMAIL_DOMAIN" ]; then
    # Stored where the scripts will look first, and only when it changed.
    if [ "$(state_value "$STORED" domain)" != "$EMAIL_DOMAIN" ] ||
       [ "$(state_value "$STORED" source)" != "$EMAIL_DOMAIN_SOURCE" ]; then
      { mkdir -p "${CANDIDATE_FILE%/*}" &&
        (umask 077 && printf '{"domain":"%s","source":"%s"}\n' "$EMAIL_DOMAIN" "$EMAIL_DOMAIN_SOURCE" \
          > "$CANDIDATE_FILE"); } 2>/dev/null && break
    else
      break
    fi
  elif [ -n "$STORED" ]; then
    EMAIL_DOMAIN=$(state_value "$STORED" domain)
    EMAIL_DOMAIN_SOURCE=$(state_value "$STORED" source)
    [ -n "$EMAIL_DOMAIN" ] && break
  fi
done

# ---------------------------------------------------------------------------
# Send.
# ---------------------------------------------------------------------------

send() {
  EVENT_NAME="$1"
  SKILL="$2"
  RESOURCE="$3"
  [ "$RESOURCE" = "-" ] && RESOURCE=""
  if [ "$EVENT_NAME" = activation ]; then EVENT_TRIGGER="$TRIGGER"; else EVENT_TRIGGER=read; fi

  # --data-urlencode -G keeps paths and slugs safe without hand-rolled escaping.
  set -- \
    --get \
    --silent --show-error --output /dev/null \
    --max-time 2 \
    --user-agent "$CLIENT_TYPE/1.0 (hook)" \
    --header "X-Client-Type: $CLIENT_TYPE" \
    --header "X-Skill-Name: $SKILL" \
    --data-urlencode "event=$EVENT_NAME" \
    --data-urlencode "skillName=$SKILL" \
    --data-urlencode "clientType=$CLIENT_TYPE" \
    --data-urlencode "clientFamily=$CLIENT_FAMILY" \
    --data-urlencode "pluginVersion=$PLUGIN_VERSION" \
    --data-urlencode "source=hook"

  [ -n "$EVENT_TRIGGER" ] && set -- "$@" --data-urlencode "trigger=$EVENT_TRIGGER"
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
  [ -n "$CT_PROJECT_KEY" ] && set -- "$@" --data-urlencode "ctProjectKey=$CT_PROJECT_KEY"
  [ -n "$CT_REGION" ] && set -- "$@" --data-urlencode "ctRegion=$CT_REGION"
  [ -n "$CT_PROJECT_SOURCE" ] && set -- "$@" --data-urlencode "ctProjectSource=$CT_PROJECT_SOURCE"
  if [ -n "$EMAIL_DOMAIN" ]; then
    set -- "$@" --data-urlencode "emailDomain=$EMAIL_DOMAIN" \
                --data-urlencode "emailDomainSource=$EMAIL_DOMAIN_SOURCE"
  fi

  # Fire and forget. A PostToolUse hook is synchronous — the agent waits for it —
  # and a blocking request adds most of a second to every read of one of our
  # reference files. Detaching drops that to the cost of spawning a shell. It
  # also means delivery is not guaranteed if the process group is torn down
  # straight after, which is the right trade for telemetry: the user's latency
  # matters and a lost beacon does not.
  if [ -n "$DEBUG_LOG" ]; then
    # Synchronous while debugging, so the log can record what came back. This
    # is the one path where blocking is acceptable: you asked for it.
    CODE=$(curl "$@" --write-out '%{http_code}' "$ENDPOINT" 2>/dev/null)
    dbg "sent $EVENT_NAME trigger=${EVENT_TRIGGER:-none} skill=$SKILL resource=${RESOURCE:-none} -> HTTP ${CODE:-no-response} $ENDPOINT"
  else
    (curl "$@" "$ENDPOINT" >/dev/null 2>&1 &) 2>/dev/null
  fi
}

printf '%s\n' "$EVENTS" | while read -r EVENT_NAME SKILL RESOURCE; do
  send "$EVENT_NAME" "$SKILL" "$RESOURCE"
done

exit 0
