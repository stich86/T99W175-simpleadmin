#!/bin/bash

# SimpleAdmin FOTA Background Worker
# Executes the actual update after HTTP response is sent
# Uses directory rename for instant backup/rollback

WORKER_LOG="/tmp/simpleadmin-fota-worker.log"
WORKER_LOCK="/tmp/simpleadmin-fota-worker.lock"
DOWNLOAD_PATH="$1"
CURRENT_VERSION="$2"

# Configuration
STATE_DIR="/data/simpleadmin"
STATE_FILE="${STATE_DIR}/update-state.json"
BACKUP_DIR="${STATE_DIR}/backups"
STAGING_DIR="${STATE_DIR}/staging"
CONFIG_BACKUP_DIR="${STATE_DIR}/config_backup"
WWW_DIR="/WEBSERVER/www"

# Files to preserve
PRESERVE_FILES=(
    "config/simpleadmin.conf"
    "cgi-bin/credentials.txt"
)

# Ensure log directory exists and is writable
touch "$WORKER_LOG" 2>/dev/null || {
    echo "FATAL: Cannot write to worker log: $WORKER_LOG" >&2
    exit 1
}

log_msg() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" >> "$WORKER_LOG" 2>/dev/null || echo "$msg" >&2
}

log_error() {
    log_msg "ERROR: $1"
}

log_info() {
    log_msg "INFO: $1"
}

# Update state file
update_state() {
    local status=$1
    local error_msg=$2

    sed -i 's/"status": "[^"]*"/"status": "'"$status"'"/' "$STATE_FILE" 2>/dev/null

    if [ -n "$error_msg" ]; then
        sed -i 's/"error_message": "[^"]*"/"error_message": "'"$error_msg"'"/' "$STATE_FILE" 2>/dev/null
    fi
}

# Check lock file
if [ -f "$WORKER_LOCK" ]; then
    log_error "Worker already running (lock file exists)"
    update_state "error" "Another update is already in progress"
    exit 1
fi

# Create lock file
echo "$$" > "$WORKER_LOCK"

# Cleanup on exit
cleanup() {
    local exit_code=$?
    rm -f "$WORKER_LOCK"

    # If exiting with error and status is still 'updating', mark as failed
    if [ $exit_code -ne 0 ]; then
        log_error "Worker exiting with error code: $exit_code"

        if [ -f "$STATE_FILE" ]; then
            local current_status
            current_status=$(grep '"status":' "$STATE_FILE" 2>/dev/null | sed 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

            if [ "$current_status" = "updating" ]; then
                log_info "Updating state to error"
                update_state "error" "Update failed unexpectedly (exit code: $exit_code)"
            fi
        fi
    fi

    log_info "Worker finished (exit code: $exit_code)"

    # Self-cleanup
    if [[ "$0" == /tmp/* ]] || [[ "$0" == */data/simpleadmin/apply_update_worker_* ]]; then
        log_info "Deleting worker script: $0"
        rm -f "$0"
    fi
}
trap cleanup EXIT

log_info "=== FOTA Worker Started ==="
log_info "Download path: $DOWNLOAD_PATH"
log_info "Current version: $CURRENT_VERSION"

# Wait a moment for HTTP response
sleep 2

# Create directories
mkdir -p "$BACKUP_DIR" "$CONFIG_BACKUP_DIR" "$STAGING_DIR"

# Verify paths
if [ ! -f "$STATE_FILE" ] || [ ! -f "$DOWNLOAD_PATH" ] || [ ! -d "$WWW_DIR" ]; then
    log_error "Critical paths missing"
    update_state "error" "Critical paths missing"
    exit 1
fi

# Extract field from JSON
extract_json_field() {
    local json=$1
    local field=$2
    echo "$json" | grep "\"$field\":" | sed 's/.*"'$field'" *: *"\([^"]*\)".*/\1/' | head -n 1
}

# Read state
state_data=$(cat "$STATE_FILE" 2>/dev/null)
latest_version=$(extract_json_field "$state_data" "latest_version")

# Extract archive
log_info "Extracting archive..."
rm -rf "${STAGING_DIR:?}"/*
mkdir -p "$STAGING_DIR"

if ! tar xzf "$DOWNLOAD_PATH" -C "$STAGING_DIR" 2>/dev/null; then
    log_error "Failed to extract archive"
    update_state "error" "Failed to extract update archive"
    exit 1
fi

if [ ! -d "$STAGING_DIR/www" ]; then
    log_error "Archive missing www directory"
    update_state "error" "Archive missing www directory"
    exit 1
fi

# Backup config files
log_info "Backing up config files..."
for file in "${PRESERVE_FILES[@]}"; do
    filepath="${WWW_DIR}/${file}"
    backuppath="${CONFIG_BACKUP_DIR}/$(basename $file)"

    if [ -f "$filepath" ]; then
        cp "$filepath" "$backuppath"
    fi
done

# Backup www by rename (instant!)
log_info "Creating backup: $WWW_DIR -> $WWW_DIR-$CURRENT_VERSION"
BACKUP_WWW_DIR="${WWW_DIR}-${CURRENT_VERSION}"

if [ -d "$BACKUP_WWW_DIR" ]; then
    rm -rf "$BACKUP_WWW_DIR"
fi

if ! mv "$WWW_DIR" "$BACKUP_WWW_DIR" 2>&1; then
    log_error "Failed to backup www"
    update_state "error" "Failed to backup www directory"
    exit 1
fi

# Install new www
log_info "Installing new www..."
if ! mv "$STAGING_DIR/www" "$WWW_DIR" 2>&1; then
    log_error "Failed to install new www"
    log_info "Attempting rollback..."
    mv "$BACKUP_WWW_DIR" "$WWW_DIR" 2>&1
    update_state "error" "Failed to install new www (rollback attempted)"
    systemctl restart qcmap_httpd 2>/dev/null
    exit 1
fi

# Set permissions
log_info "Setting permissions..."
chmod -R 755 "$WWW_DIR"
chmod +x "$WWW_DIR"/cgi-bin/* 2>/dev/null

# Restore config files
log_info "Restoring config files..."
for file in "${PRESERVE_FILES[@]}"; do
    filepath="${WWW_DIR}/${file}"
    backuppath="${CONFIG_BACKUP_DIR}/$(basename $file)"

    if [ -f "$backuppath" ]; then
        cp "$backuppath" "$filepath"
        if [ "$file" = "cgi-bin/credentials.txt" ]; then
            chmod 600 "$filepath"
        else
            chmod 644 "$filepath"
        fi
    fi
done

# Update state
log_info "Updating state..."
sed -i "s|\"backup_path\": \"[^\"]*\"|\"backup_path\": \"$BACKUP_WWW_DIR\"|" "$STATE_FILE" 2>/dev/null
sed -i 's/"backup_created": [^,}]*/"backup_created": true/' "$STATE_FILE" 2>/dev/null

# Restart web server
log_info "Restarting web server..."
systemctl restart qcmap_httpd

# Wait for server
sleep 3

# Cleanup
log_info "Cleanup..."
rm -rf "${STAGING_DIR}" 2>/dev/null &
rm -f "$DOWNLOAD_PATH" 2>/dev/null && log_info "Downloaded file removed"

# Update state to success
update_state "success" ""

log_info "=== Update Complete ==="
log_info "Previous: $CURRENT_VERSION, New: $latest_version"

exit 0
