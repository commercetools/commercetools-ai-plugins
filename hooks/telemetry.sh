#!/bin/sh
# commercetools AI plugin: usage reporting hook. What it sends is listed in
# TELEMETRY.md; how to debug and test it is in .internal/README.md.
#
# Usage: telemetry.sh <client-type> <mode> <plugin-root> [trigger]
#   client-type  claude-code, cursor or codex
#   mode         activation  the payload names the skill (Claude Code's Skill tool)
#                prompt      the user typed `$commercetools-…` (Codex)
#                resource    every matching path is a file read, SKILL.md too
#                auto        a SKILL.md read is an activation, any other a read
#   trigger      user-invoked or model-invoked, for activations
#
# Reads the hook payload (JSON) on stdin. Sends one GET request per event to
# docs.commercetools.com and nothing else. Never blocks, never prints, always
# exits 0: everything after the first check runs in the background.
#
# Off when COMMERCETOOLS_AI_PLUGIN_TELEMETRY is 0 or off, or when the plugin's
# "Share usage data" setting is off (CLAUDE_PLUGIN_OPTION_TELEMETRY=false).

CLIENT_TYPE="$1"
MODE="$2"
PLUGIN_ROOT="$3"
TRIGGER="$4"

[ "$COMMERCETOOLS_AI_PLUGIN_TELEMETRY" = "0" ] && exit 0
[ "$COMMERCETOOLS_AI_PLUGIN_TELEMETRY" = "off" ] && exit 0
[ "$CLAUDE_PLUGIN_OPTION_TELEMETRY" = "false" ] && exit 0

ENDPOINT="https://docs.commercetools.com/apis/rest/tools/ai-plugin-telemetry"
# A local receiver for testing is the only other place it may send to.
is_local_receiver() {
  REST="${1#http://localhost:}"
  [ "$REST" = "$1" ] && REST="${1#http://127.0.0.1:}"
  [ "$REST" = "$1" ] && return 1
  case "${REST%%/*}" in '' | *[!0-9]*) return 1 ;; esac
}
is_local_receiver "$COMMERCETOOLS_AI_PLUGIN_TELEMETRY_ENDPOINT" &&
  ENDPOINT="$COMMERCETOOLS_AI_PLUGIN_TELEMETRY_ENDPOINT"

# `touch ~/.commercetools-telemetry-debug` logs every decision to that file.
DEBUG_LOG="$HOME/.commercetools-telemetry-debug"
[ -f "$DEBUG_LOG" ] || DEBUG_LOG=""
TMP="${TMPDIR:-/tmp}"
TMP="${TMP%/}"

INPUT=$(cat 2>/dev/null) || exit 0

# Most reads are the user's own files: leave before doing any work. A bare
# `references/…` or `SKILL.md` passes, for reads made from inside a skill folder.
case "$INPUT" in
  *commercetools-* | *references/* | *SKILL.md*) ;;
  *) exit 0 ;;
esac

# ---------------------------------------------------------------------------
# Helpers. None of them reads a variable that main sets after calling it.
# ---------------------------------------------------------------------------

dbg() {
  [ -n "$DEBUG_LOG" ] && printf '%s %-11s %-10s %s\n' \
    "$(date -u '+%H:%M:%S')" "$CLIENT_TYPE" "$MODE" "$*" >> "$DEBUG_LOG" 2>/dev/null
  return 0
}

# A value as sent: an unknown value is an empty string, never "null".
plain() {
  case "$1" in
    null | undefined) printf '' ;;
    *) printf '%s' "$1" ;;
  esac
}

# The raw value of one JSON string field of the payload. Escaped quotes inside
# the value are kept, so a command that quotes a path isn't cut short.
json_field() {
  printf '%s' "$SCAN_INPUT" |
    sed -n -E "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"(([^\"\\\\]|\\\\.)*)\".*/\1/p" |
    head -n 1
}

# Undo the JSON escaping that matters for paths. `\\` becomes `/`, which also
# turns a Windows path into one the patterns below understand.
json_unescape() {
  sed -e 's/\\\\/\//g' -e 's/\\[nt]/ /g' -e 's/\\"/"/g' -e 's/\\\//\//g'
}

# One word per line: splits a shell command or a list of paths.
words() {
  tr ' \t"'"'"'=;|&<>(),`' '\n\n\n\n\n\n\n\n\n\n\n\n\n' | sed '/^$/d'
}

# A plain value from our own state files: key, region, domain or id characters.
state_value() {
  printf '%s' "$1" | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" |
    head -n 1 | tr -dc 'A-Za-z0-9_.-'
}

# Only skills this plugin ships count: other teams use our prefix too.
is_shipped() {
  [ -z "$PLUGIN_ROOT" ] || [ -d "$PLUGIN_ROOT/skills/$1" ]
}

# Lines of "<skill> <file in the skill>" for every path in the payload that
# points into one of our skills: `…/commercetools-x/SKILL.md` or
# `…/commercetools-x/references/…`. A bare `references/…` is attributed to the
# skill folder the payload's cwd names, else to the skill this session last
# reported ($1) when that skill has the file (Codex reports no command cwd).
skill_paths() {
  LAST="$1"
  TEXT=$(for FIELD in file_path path command; do json_field "$FIELD"; done | json_unescape)
  CWD_SKILL=$(json_field cwd | json_unescape |
    sed -n -E 's#^(.*/)?(commercetools-[a-z0-9-]+)/?$#\2#p')

  printf '%s\n' "$TEXT" | words | while IFS= read -r WORD; do
    MATCH=$(printf '%s' "$WORD" |
      sed -n -E 's#^(.*/)?(commercetools-[a-z0-9-]+)/(SKILL\.md|references(/[A-Za-z0-9_./-]*)?)$#\2 \3#p')
    if [ -z "$MATCH" ]; then
      BARE=$(printf '%s' "$WORD" |
        sed -n -E 's#^(\./)?(SKILL\.md|references(/[A-Za-z0-9_./-]*)?)$#\2#p')
      BARE="${BARE%/}"
      if [ -n "$BARE" ] && [ -n "$CWD_SKILL" ]; then
        MATCH="$CWD_SKILL $BARE"
      elif [ -n "$BARE" ] && [ -n "$LAST" ] && [ -e "$PLUGIN_ROOT/skills/$LAST/$BARE" ]; then
        MATCH="$LAST $BARE"
      fi
    fi
    [ -n "$MATCH" ] && printf '%s\n' "${MATCH%/}"
  done
}

# Lines of "<skill>" the payload names. The namespaced form
# (`commercetools:commercetools-x`) first: it is the invoked skill.
skill_names() {
  if [ "$MODE" = prompt ]; then
    json_field prompt | grep -oE '\$(commercetools:)?commercetools-[a-z0-9-]+' |
      sed 's/.*\(commercetools-[a-z0-9-]*\)$/\1/'
  else
    printf '%s' "$SCAN_INPUT" | grep -oE 'commercetools:commercetools-[a-z0-9-]+' | sed 's/^commercetools://'
    printf '%s' "$SCAN_INPUT" | grep -oE 'commercetools-[a-z0-9-]+'
  fi
}

# Lines of "<event> <skill> <file or ->".
collect_events() {
  case "$MODE" in
    activation)
      for NAME in $(skill_names); do
        is_shipped "$NAME" && { printf 'activation %s -\n' "$NAME"; break; }
      done ;;
    prompt)
      for NAME in $(skill_names); do
        is_shipped "$NAME" && printf 'activation %s -\n' "$NAME"
      done ;;
    resource | auto)
      skill_paths "$1" | while read -r NAME FILE; do
        is_shipped "$NAME" || continue
        if [ "$MODE" = auto ] && [ "$FILE" = SKILL.md ]; then
          printf 'activation %s %s\n' "$NAME" "$FILE"
        else
          printf 'resource %s %s\n' "$NAME" "$FILE"
        fi
      done ;;
  esac
}

install_id_file() {
  if [ "$1" = home ]; then
    printf '%s' "$HOME/.commercetools/ai-plugin-install-id"
  else
    printf '%s' "$TMP/ct-ai-plugin-install-id"
  fi
}

read_install_id() {
  head -n 1 "$1" 2>/dev/null | tr -dc 'a-f0-9'
}

# ---------------------------------------------------------------------------
# main: read what is known, decide what happened, send it. Runs in the background.
# ---------------------------------------------------------------------------

main() {
  command -v curl >/dev/null 2>&1 || { dbg "skip: no curl"; return; }

  # The tool response holds the text that was read; a skill linking to another
  # skill would otherwise report a read of that one.
  SCAN_INPUT=$(printf '%s' "$INPUT" | sed 's/"tool_response".*//')

  PLUGIN_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$PLUGIN_ROOT/plugin.json" "$PLUGIN_ROOT/.codex-plugin/plugin.json" 2>/dev/null | head -n 1)

  CLIENT_FAMILY=$(printf '%s' "$CLIENT_TYPE" | tr '[:upper:]' '[:lower:]')
  case "$CLIENT_FAMILY" in
    *claude*) CLIENT_FAMILY=claude ;;
    *copilot*) CLIENT_FAMILY=copilot ;;
    *codex*) CLIENT_FAMILY=codex ;;
    *cursor*) CLIENT_FAMILY=cursor ;;
  esac

  # Installation ID: an existing one from home, then temp; otherwise a new one,
  # stored in the first place that takes it. Only an ID read back from disk is
  # sent: one that can't be stored would be new on every call.
  INSTALL_ID=""
  INSTALL_ID_SOURCE=""
  for SOURCE in home temp; do
    INSTALL_ID=$(read_install_id "$(install_id_file "$SOURCE")")
    [ -n "$INSTALL_ID" ] && { INSTALL_ID_SOURCE="$SOURCE"; break; }
  done
  if [ -z "$INSTALL_ID" ]; then
    NEW_ID=$(od -An -tx1 -N16 /dev/urandom 2>/dev/null | tr -dc 'a-f0-9')
    for SOURCE in home temp; do
      [ -n "$NEW_ID" ] || break
      FILE=$(install_id_file "$SOURCE")
      { mkdir -p "${FILE%/*}" && (umask 077 && printf '%s\n' "$NEW_ID" > "$FILE"); } 2>/dev/null
      INSTALL_ID=$(read_install_id "$FILE")
      [ -n "$INSTALL_ID" ] && { INSTALL_ID_SOURCE="$SOURCE"; break; }
    done
  fi

  # Session: a hash of the host's session ID (Claude Code and Codex session_id,
  # Cursor conversation_id, Copilot sessionId), never the ID itself.
  SESSION=""
  for FIELD in session_id conversation_id sessionId; do
    RAW=$(json_field "$FIELD")
    [ -n "$RAW" ] || continue
    SESSION=$( { printf '%s' "$RAW" | shasum -a 256 || printf '%s' "$RAW" | sha256sum; } 2>/dev/null | cut -c1-32)
    break
  done

  # Session state, shared with the skill scripts: the project key and region
  # they recorded, and the last skill this hook reported.
  CT_PROJECT=""; CT_REGION=""; CT_PROJECT_SOURCE=""; LAST_SKILL=""; SEQ=1
  SESSION_FILE="$TMP/ct-ai-plugin-invocation-$CLIENT_FAMILY.json"
  if [ -n "$SESSION" ]; then
    PREVIOUS=$(cat "$SESSION_FILE" 2>/dev/null)
    if [ "$(state_value "$PREVIOUS" id)" = "$SESSION" ]; then
      CT_PROJECT=$(state_value "$PREVIOUS" ctProjectKey)
      CT_REGION=$(state_value "$PREVIOUS" ctRegion)
      CT_PROJECT_SOURCE=$(state_value "$PREVIOUS" ctProjectSource)
      LAST_SKILL=$(state_value "$PREVIOUS" lastSkill)
      SEQ=$(printf '%s' "$PREVIOUS" | sed -n 's/.*"seq"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -n 1)
      [ -n "$SEQ" ] || SEQ=1
    fi
  fi

  # At most ten events per call, so a command listing a whole tree can't fan out.
  EVENTS=$(collect_events "$LAST_SKILL" | awk '!seen[$0]++' | head -n 10)
  [ -n "$EVENTS" ] || { dbg "skip: no shipped skill in payload"; return; }

  if [ -n "$SESSION" ]; then
    LAST_SKILL=$(printf '%s\n' "$EVENTS" | tail -n 1 | cut -d ' ' -f 2)
    STATE="{\"id\":\"$SESSION\",\"ts\":$(( $(date +%s) * 1000 )),\"seq\":$SEQ,\"src\":\"host\""
    [ -n "$CT_PROJECT" ] && STATE="$STATE,\"ctProjectKey\":\"$CT_PROJECT\""
    [ -n "$CT_REGION" ] && STATE="$STATE,\"ctRegion\":\"$CT_REGION\""
    [ -n "$CT_PROJECT_SOURCE" ] && STATE="$STATE,\"ctProjectSource\":\"$CT_PROJECT_SOURCE\""
    STATE="$STATE,\"lastSkill\":\"$LAST_SKILL\"}"
    { printf '%s' "$STATE" > "$SESSION_FILE"; } 2>/dev/null
  fi

  # Email domain: from the host when it states the signed-in user's email
  # (Cursor), stored for the scripts; else what the scripts stored from
  # `git config user.email`. Only the part after the @ is ever read.
  EMAIL_DOMAIN=""
  EMAIL_DOMAIN_SOURCE=""
  HOST_EMAIL=$(json_field user_email)
  [ -n "$HOST_EMAIL" ] || HOST_EMAIL="$CURSOR_USER_EMAIL"
  case "$HOST_EMAIL" in
    *@*)
      EMAIL_DOMAIN=$(printf '%s' "${HOST_EMAIL##*@}" | tr '[:upper:]' '[:lower:]' | tr -dc 'a-z0-9.-')
      EMAIL_DOMAIN_SOURCE="$CLIENT_FAMILY" ;;
  esac
  for FILE in "$HOME/.commercetools/ai-plugin-email-domain" "$TMP/ct-ai-plugin-email-domain"; do
    STORED=$(cat "$FILE" 2>/dev/null)
    if [ -z "$EMAIL_DOMAIN" ]; then
      EMAIL_DOMAIN=$(state_value "$STORED" domain)
      EMAIL_DOMAIN_SOURCE=$(state_value "$STORED" source)
      [ -n "$EMAIL_DOMAIN" ] && break
    elif [ "$(state_value "$STORED" domain)" = "$EMAIL_DOMAIN" ] &&
         [ "$(state_value "$STORED" source)" = "$EMAIL_DOMAIN_SOURCE" ]; then
      break
    else
      { mkdir -p "${FILE%/*}" && (umask 077 &&
        printf '{"domain":"%s","source":"%s"}\n' "$EMAIL_DOMAIN" "$EMAIL_DOMAIN_SOURCE" > "$FILE"); } 2>/dev/null && break
    fi
  done

  # Cursor and Codex state the model in the payload; Claude Code doesn't.
  MODEL=$(json_field model)

  printf '%s\n' "$EVENTS" | while read -r EVENT SKILL FILE; do
    [ "$FILE" = "-" ] && FILE=""
    if [ "$EVENT" = activation ]; then EVENT_TRIGGER="$TRIGGER"; else EVENT_TRIGGER=read; fi
    # Every field is sent, empty when unknown.
    CODE=$(curl --get --silent --output /dev/null --max-time 2 \
      --write-out '%{http_code}' \
      --user-agent "$CLIENT_TYPE/1.0 (hook)" \
      --data-urlencode "event=$EVENT" \
      --data-urlencode "trigger=$(plain "$EVENT_TRIGGER")" \
      --data-urlencode "skillName=$(plain "$SKILL")" \
      --data-urlencode "resource=$(plain "$FILE")" \
      --data-urlencode "source=hook" \
      --data-urlencode "clientType=$(plain "$CLIENT_TYPE")" \
      --data-urlencode "clientFamily=$(plain "$CLIENT_FAMILY")" \
      --data-urlencode "model=$(plain "$MODEL")" \
      --data-urlencode "pluginVersion=$(plain "$PLUGIN_VERSION")" \
      --data-urlencode "installId=$(plain "$INSTALL_ID")" \
      --data-urlencode "installIdSource=$(plain "$INSTALL_ID_SOURCE")" \
      --data-urlencode "invocation=$(plain "$SESSION")" \
      --data-urlencode "invocationSource=${SESSION:+host}" \
      --data-urlencode "ctProjectKey=$(plain "$CT_PROJECT")" \
      --data-urlencode "ctRegion=$(plain "$CT_REGION")" \
      --data-urlencode "ctProjectSource=$(plain "$CT_PROJECT_SOURCE")" \
      --data-urlencode "emailDomain=$(plain "$EMAIL_DOMAIN")" \
      --data-urlencode "emailDomainSource=$(plain "$EMAIL_DOMAIN_SOURCE")" \
      "$ENDPOINT" 2>/dev/null)
    dbg "sent $EVENT trigger=${EVENT_TRIGGER:-none} skill=$SKILL resource=${FILE:-none} -> HTTP ${CODE:-none} $ENDPOINT"
  done
}

# Redirect the shell itself first: with dash (/bin/sh on Debian and Ubuntu),
# redirecting only the background call keeps the host's output pipe open, and
# the host would wait for main to finish.
exec </dev/null >/dev/null 2>&1
main &
exit 0
