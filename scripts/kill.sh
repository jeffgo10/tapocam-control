#!/bin/zsh
# Stop the login agent so launchd does not start it again until the next login.
set -euo pipefail

domain="gui/$(id -u)"
label="com.tapocam.control"
target="${domain}/${label}"
root="$(cd "$(dirname "$0")/.." && pwd)"

if launchctl print "$target" >/dev/null 2>&1; then
  launchctl bootout "$target"
  echo "Stopped the login agent."
else
  echo "Login agent is not loaded."
fi

# A terminal `npm start` is not the agent. Stop it when it is this project.
listener_pid="$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"
if [[ -n "${listener_pid}" ]]; then
  cwd="$(lsof -a -p "$listener_pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { print substr($0, 2); exit }')"
  if [[ "$cwd" == "$root" ]]; then
    kill "$listener_pid"
    echo "Stopped the server on port 3000."
  fi
fi

echo "It stays stopped until the next login, or until you run scripts/start.sh."
echo "MySQL and MediaMTX keep running. Stop them with: docker compose stop"
