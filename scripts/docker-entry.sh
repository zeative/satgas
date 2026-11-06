#!/bin/sh
# Runs the newest Satgas: the image's own, or one the app downloaded into the data volume. The container cannot replace
# its own image without the Docker socket, and agents running inside it must never hold that.
builtin="${SATGAS_BUILTIN_BIN:-/usr/local/bin/satgas}"
update="${SATGAS_DATA_DIR:-/data}/update/satgas"

newest() {
  if [ -x "$update" ]; then
    mine=$("$builtin" --version 2>/dev/null)
    theirs=$("$update" --version 2>/dev/null)
    top=$(printf '%s\n%s\n' "$mine" "$theirs" | sort -V | tail -n 1)
    if [ -n "$theirs" ] && [ "$theirs" = "$top" ] && [ "$theirs" != "$mine" ]; then
      echo "$update"
      return
    fi
  fi
  echo "$builtin"
}

while :; do
  bin=$(newest)
  started=$(date +%s)
  "$bin" "$@" &
  pid=$!
  trap 'kill -TERM "$pid" 2>/dev/null' TERM INT
  wait "$pid"
  code=$?
  # A forwarded signal ends the wait early, so stay until the app has saved and gone.
  while kill -0 "$pid" 2>/dev/null; do
    wait "$pid"
    code=$?
  done
  trap - TERM INT
  [ "$code" = 75 ] && continue
  # A downloaded version that dies right away goes, and the image's own takes over.
  if [ "$bin" = "$update" ] && [ "$code" != 0 ] && [ $(($(date +%s) - started)) -lt 30 ]; then
    echo "The downloaded version exited with $code, going back to the image's own." >&2
    rm -f "$update"
    continue
  fi
  exit "$code"
done
