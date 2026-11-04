#!/bin/zsh
# Load the login agent. It runs `npm start` and brings up Docker Compose.
set -euo pipefail

domain="gui/$(id -u)"
label="com.tapocam.control"
target="${domain}/${label}"
plist="${HOME}/Library/LaunchAgents/${label}.plist"

if [[ ! -f "$plist" ]]; then
  echo "Missing ${plist}" >&2
  exit 1
fi

launchctl enable "$target"

if launchctl print "$target" >/dev/null 2>&1; then
  echo "tapocam-control is already running."
  exit 0
fi

launchctl bootstrap "$domain" "$plist"
echo "Started tapocam-control (npm start)."
