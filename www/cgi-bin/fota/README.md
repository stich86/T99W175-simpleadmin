# SimpleAdmin FOTA (Firmware Over The Air) System

Automatic update system for SimpleAdmin web interface.

## 📁 Directory Structure

```
/data/simpleadmin/
├── update-state.json          # Update state
├── downloads/                 # Downloaded updates
│   └── simpleadmin-v1.1.0.tar.gz
├── config_backup/             # Configuration backups (preserved across updates)
│   ├── simpleadmin.conf
│   └── credentials.txt
└── staging/                   # Temporary extraction
    └── www/

/WEBSERVER/
├── www-v1.0.0/               # Versioned backup: 1.0.0
├── www-v1.1.0/               # Versioned backup: 1.1.0
└── www/                      # Current active version

/www/cgi-bin/fota/            # FOTA scripts
├── check_updates              # Check for updates
├── download_update            # Download update
├── get_update_status          # Read state
├── apply_update               # Apply update (launches worker via systemd-run)
├── apply_update_worker.sh     # Background update worker
├── rollback_update            # Restore from versioned backup
├── list_backups               # List available versioned backups
└── cleanup_downloads          # Cleanup old downloads
```

## 🔄 CGI Scripts

### 1. `check_updates`
Check if updates are available on GitHub.

**Request:**
```bash
GET /cgi-bin/fota/check_updates
```

**Response:**
```json
{
  "ok": true,
  "message": "New version available: 1.1.0",
  "data": {
    "current_version": "1.0.0",
    "latest_version": "1.1.0",
    "update_available": true,
    "download_url": "https://github.com/.../simpleadmin-v1.1.0.tar.gz",
    "changelog": "Fixed bug...",
    "last_check": "2025-01-04T14:30:22Z"
  }
}
```

### 2. `download_update`
Download update from GitHub.

**Request:**
```bash
POST /cgi-bin/fota/download_update
```

**Response:**
```json
{
  "ok": true,
  "message": "Update downloaded successfully",
  "data": {
    "download_path": "/data/simpleadmin/downloads/simpleadmin-v1.1.0.tar.gz",
    "size_mb": 2
  }
}
```

### 3. `get_update_status`
Read current update state.

**Request:**
```bash
GET /cgi-bin/fota/get_update_status
```

**Response:**
```json
{
  "current_version": "1.0.0",
  "latest_version": "1.1.0",
  "update_available": true,
  "update_downloaded": true,
  "backup_created": false,
  "backup_path": "",
  "download_path": "/data/simpleadmin/downloads/simpleadmin-v1.1.0.tar.gz",
  "status": "downloaded",
  "last_check": "2025-01-04T14:30:22Z",
  "download_url": "https://...",
  "changelog": "...",
  "error_message": ""
}
```

Possible states: `idle`, `downloading`, `downloaded`, `updating`, `success`, `error`

### 4. `apply_update`
Apply update using instant directory rename backup.

**Architecture:**
The update process uses **systemd-run** to launch a background worker that prevents HTTP connection timeout and completely avoids CGI fork limitations.
Backup is performed via **instant directory rename** instead of tar.gz archive.

**Flow:**
1. Backup configurations (`simpleadmin.conf`, `credentials.txt`) to `/data/simpleadmin/config_backup/`
2. **Launch worker** via `systemd-run --scope` with download path and current version
3. Return immediate HTTP response to client
4. **apply_update_worker.sh** (detached from CGI) executes:
   - Extract update to staging
   - **Rename** `/WEBSERVER/www/` → `/WEBSERVER/www-v1.0.0/` (instant!)
   - Move staging/www → `/WEBSERVER/www/` (instant!)
   - Set permissions (755)
   - Restore configurations from config_backup
   - Restart web server
   - Update state to "success"
5. Frontend polls status and shows success message

**Backup Strategy:**
- **Instant backup**: Directory rename instead of tar.gz (takes < 1 second)
- **Versioned backups**: Multiple versions can coexist (www-v1.0.0, www-v1.1.0, www-v1.2.0)
- **Instant rollback**: Just rename directories back
- **Space efficient**: Uses hard links if filesystem supports it

**systemd-run Advantages:**
- ✅ No fork limitations in CGI environment
- ✅ Process completely detached from parent
- ✅ Automatic resource cleanup
- ✅ Proper service supervision
- ✅ No additional services required

**Request:**
```bash
POST /cgi-bin/fota/apply_update
```

**Response (immediate):**
```json
{
  "ok": true,
  "message": "Update started in background",
  "data": {
    "version": "1.1.0",
    "current_version": "1.0.0"
  }
}
```

**State changes:**
- Initial: `update_downloaded: true`
- After launch: `status: "updating"`
- Worker completion: `status: "success"` or `"error"`

**Worker logs:**
```
/tmp/simpleadmin-fota-worker.log
```

### 5. `rollback_update`
Restore previous version from versioned backup using instant rename.

**Process:**
1. Read `backup_path` from state file (e.g., `/WEBSERVER/www-v1.0.0`)
2. Move current `/WEBSERVER/www/` → `/WEBSERVER/www-failed-{timestamp}/` (instant!)
3. Move backup `/WEBSERVER/www-v1.0.0/` → `/WEBSERVER/www/` (instant!)
4. Set permissions (755)
5. Restore configurations from config_backup
6. Restart web server
7. Cleanup failed directory in background

**Request:**
```bash
POST /cgi-bin/fota/rollback_update
```

**Response:**
```json
{
  "ok": true,
  "message": "Rollback completed successfully",
  "data": {
    "backup": "/WEBSERVER/www-v1.0.0"
  }
}
```

### 6. `list_backups`
List all versioned backups available in `/WEBSERVER/`.

**Request:**
```bash
GET /cgi-bin/fota/list_backups
```

**Response:**
```json
{
  "ok": true,
  "message": "Backups listed",
  "data": [
    {
      "version": "1.0.0",
      "path": "/WEBSERVER/www-v1.0.0",
      "modified": "2025-01-04 14:30:22",
      "timestamp": 1704358222
    },
    {
      "version": "1.1.0",
      "path": "/WEBSERVER/www-v1.1.0",
      "modified": "2025-01-05 10:15:00",
      "timestamp": 1704422100
    }
  ]
}
```

### 7. `cleanup_downloads`
Clean up old downloads to free space.

**Keeps:**
- Last 2 downloads

**Request:**
```bash
POST /cgi-bin/fota/cleanup_downloads
```

**Response:**
```json
{
  "ok": true,
  "message": "Cleanup completed",
  "data": {
    "disk_usage": {
      "total_mb": 1024,
      "used_mb": 512,
      "available_mb": 512,
      "usage_percent": 50
    }
  }
}
```

### 8. `apply_update_worker.sh`
**Background worker** that performs the actual update after HTTP response is sent.

**Not directly callable via HTTP** - launched by `apply_update` script.

**Purpose:**
- Prevents HTTP connection timeout during web server restart
- Allows the CGI script to return immediately while update completes in background
- Provides detailed logging for troubleshooting
- Uses **instant directory rename** for backup/restore

**Process:**
1. Acquires lock file (`/tmp/simpleadmin-fota-worker.lock`) to prevent concurrent workers
2. Waits 2 seconds for HTTP response to be sent
3. Extracts update archive to staging directory
4. Backs up configuration files to `/data/simpleadmin/config_backup/`
5. **Renames** `/WEBSERVER/www/` → `/WEBSERVER/www-v{CURRENT_VERSION}/` (< 1 second!)
6. **Moves** staging/www → `/WEBSERVER/www/` (< 1 second!)
7. Sets permissions (755 for directories, 644/600 for config files)
8. Restores configuration files from config_backup
9. Restarts web server (`systemctl restart qcmap_httpd`)
10. Cleans up staging directory
11. Updates state to "success" or "error"
12. Updates `backup_path` in state to versioned directory

**Lock file:**
```
/tmp/simpleadmin-fota-worker.lock  # Contains worker PID
```

**Logs:**
```
/tmp/simpleadmin-fota-worker.log   # Detailed worker logs
```

**Error handling:**
- If extraction fails: updates state to "error", no backup created
- If rename/move operations fail: attempts to **instant rollback** by renaming backup back
- All errors logged with timestamp
- State file updated with error details

## 🔐 Preserved Files

These files are preserved during updates:

- `config/simpleadmin.conf` - SimpleAdmin configuration
- `config/credentials.txt` - User credentials

They are saved to `/data/simpleadmin/config_backup/` before update and restored after.

## 📦 GitHub Actions

The repository includes `.github/workflows/release.yml` which:

1. Triggers automatically when you create a **new release**
2. Creates the `VERSION` file inside `www/`
3. Automatically generates `simpleadmin-v{version}.tar.gz`
4. Uploads it as a release asset

## 🚀 How to Create a Release

### Stable Releases (Production)

1. Push changes to GitHub
2. Go to **Releases** → **Draft a new release**
3. Fill in:
   - Tag: `v1.1.0`
   - Title: `Release v1.1.0`
   - Description: Changelog
   - **✅ Uncheck** "Set as a pre-release"
4. Click **Publish release**
5. GitHub Action will automatically create the tar.gz after ~30 seconds

### Beta Releases (Pre-release)

1. Push changes to GitHub
2. Go to **Releases** → **Draft a new release**
3. Fill in:
   - Tag: `v1.1.0-beta1` or `v1.2.0-rc1`
   - Title: `Release v1.1.0-beta1` (Beta) or `Release v1.2.0-rc1` (Release Candidate)
   - Description: Changelog with known issues
   - **☑️ Check** "Set as a pre-release"
4. Click **Publish release**
5. GitHub Action will automatically create the tar.gz after ~30 seconds

## 📊 Release Channels

The FOTA system supports two update channels:

### Stable Channel (Default)
- Checks for releases with **prerelease: false**
- Tags: `v1.0.0`, `v1.1.0`, `v2.0.0`
- For: Production-ready, thoroughly tested releases
- API: `/releases/latest`

### Beta Channel
- Checks for releases with **prerelease: true**
- Tags: `v1.1.0-beta1`, `v1.2.0-rc1`, `v2.0.0-alpha1`
- For: Testing new features before stable release
- API: `/releases?per_page=5` (filters for prerelease)

### Channel Selection
Users can switch between channels in the **Advanced** page:
- Default: **Stable**
- Channel preference is saved in `/data/simpleadmin/update-state.json`
- Switching channels clears cached update info and forces re-check

## ⚠️ Requirements

- `curl` - Download from GitHub
- `tar` - Extract archives
- `systemctl` - Web server service management
- `sed` / `grep` - Text processing (included in base system)

## 🧪 Testing

```bash
# On the modem
ssh root@192.168.225.1

# Check for updates
cd /www/cgi-bin/fota
./check_updates

# Read status
./get_update_status

# Download update
./download_update

# Apply update
./apply_update

# If something goes wrong, rollback
./rollback_update

# Clean up old files
./cleanup_downloads
```

## 📝 Notes

- Scripts require root or www-data permissions
- **Update process uses background worker** to prevent HTTP timeout during web server restart
- Frontend polls update status every 2 seconds until completion
- Page automatically refreshes 10 seconds after successful update
- Only one backup is maintained (previous version before update)
- Each update overwrites the previous backup
- Files in `/data/` persist across reboots
- Worker logs are saved to `/tmp/simpleadmin-fota-worker.log`
- Main FOTA logs are saved to `/tmp/simpleadmin-fota.log`
