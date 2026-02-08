# SimpleAdmin FOTA (Firmware Over The Air) System

Automatic update system for SimpleAdmin web interface.

## 📁 Directory Structure

```
/data/simpleadmin/
├── update-state.json          # Update state
├── backups/                   # Single /www/ backup
│   └── www_previous.tar.gz
├── downloads/                 # Downloaded updates
│   └── simpleadmin-v1.1.0.tar.gz
├── config_backup/             # Configuration backups
│   ├── simpleadmin.conf
│   └── credentials.txt
└── staging/                   # Temporary extraction
    └── www/

/www/cgi-bin/fota/            # FOTA scripts
├── check_updates              # Check for updates
├── download_update            # Download update
├── get_update_status          # Read state
├── apply_update               # Apply update
├── rollback_update            # Restore backup
├── list_backups               # List available backup
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
Apply update (backup → extract → replace).

**Flow:**
1. Backup configurations (`simpleadmin.conf`, `credentials.txt`)
2. Full backup of `/www/`
3. Extract update
4. Replace files
5. Restore configurations
6. Restart web server

**Request:**
```bash
POST /cgi-bin/fota/apply_update
```

**Response:**
```json
{
  "ok": true,
  "message": "Update applied successfully",
  "data": {
    "version": "1.1.0",
    "backup": "/data/simpleadmin/backups/www_previous.tar.gz"
  }
}
```

### 5. `rollback_update`
Restore previous version from backup.

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
    "backup": "/data/simpleadmin/backups/www_previous.tar.gz"
  }
}
```

### 6. `list_backups`
List the current backup.

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
      "filename": "www_previous.tar.gz",
      "path": "/data/simpleadmin/backups/www_previous.tar.gz",
      "size_mb": 3,
      "modified": "2025-01-04 14:30:22",
      "timestamp": 1704358222
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
- The web server is restarted during updates
- Only one backup is maintained (previous version before update)
- Each update overwrites the previous backup
- Files in `/data/` persist across reboots
