// SimpleAdmin FOTA Manager
// Alpine.js component for firmware update management

// Global Alpine Store for FOTA modal state
document.addEventListener('alpine:init', () => {
  Alpine.store('fotaModal', {
    show: false,
    title: '',
    message: '',
    countdown: 0,
    action: null,
    hideButtons: false,  // New flag to hide buttons during countdown

    open(title, message, action) {
      this.title = title;
      this.message = message;
      this.action = action;
      this.countdown = 0; // Start at 0 for confirmation
      this.hideButtons = false;
      this.show = true;
    },

    close() {
      this.show = false;
      this.action = null;
      this.hideButtons = false;
    },

    confirm() {
      if (this.action) {
        this.action();
      }
      this.close();
    },

    showSuccess(title, message, countdownSeconds = 5, autoRefresh = true) {
      this.title = title;
      this.countdown = countdownSeconds;
      this.show = true;
      this.action = null;
      this.hideButtons = true;  // Hide buttons during countdown

      // Update message with initial countdown
      this.updateCountdownMessage(message);

      // Start countdown
      const countdownInterval = setInterval(() => {
        this.countdown--;
        this.updateCountdownMessage(message);

        if (this.countdown <= 0) {
          clearInterval(countdownInterval);
          if (autoRefresh) {
            // Reload the page
            window.location.reload();
          } else {
            // Just close the modal
            this.show = false;
            this.hideButtons = false;
          }
        }
      }, 1000);
    },

    showMessage(title, message, autoHide = true, onClose = null) {
      this.title = title;
      this.message = message;
      this.countdown = 0;  // No countdown
      this.action = null;
      this.hideButtons = true;  // Hide buttons
      this.show = true;

      if (autoHide) {
        // Auto-hide after 4 seconds
        setTimeout(() => {
          this.show = false;
          this.hideButtons = false;
          // Call onClose callback if provided
          if (onClose && typeof onClose === 'function') {
            onClose();
          }
        }, 4000);
      }
    },

    updateCountdownMessage(baseMessage) {
      this.message = baseMessage + this.countdown + ' seconds...';
    }
  });
});

// Make it globally available for Alpine.js
window.fotaManager = function() {
  return {
    updateChannel: 'stable',
    currentVersion: '',
    latestVersion: '',
    selectedVersion: '',
    updateAvailable: false,
    updateDownloaded: false,
    hasBackup: false,
    isLoading: false,
    statusMessage: '',
    changelog: '',
    availableReleases: [],
    updateInProgress: false,
    pollingInterval: null,

    init() {
      console.log('[FOTA] Initializing...');

      // Check for completed update on page load
      this.checkUpdateStatusOnLoad().then(() => {
        // Only check for updates if status is idle (not after update)
        this.getStatus().then(data => {
          if (data.status === 'idle') {
            this.checkUpdates();
          } else {
            // Just load the status without checking GitHub
            this.loadStatus();
          }
        });

        // Check if update is in progress and start polling
        this.$nextTick(() => {
          this.checkUpdateInProgress();
        });
      });
    },

    async getStatus() {
      try {
        const response = await fetch('/cgi-bin/fota/get_update_status');
        return await response.json();
      } catch (error) {
        console.error('[FOTA] Failed to get status:', error);
        return { status: 'idle' };
      }
    },

    async checkUpdateStatusOnLoad() {
      try {
        // First call: get status WITHOUT reset
        const response = await fetch('/cgi-bin/fota/get_update_status');
        const data = await response.json();

        // Check if status exists and is success
        if (data.status === 'success') {
          console.log('[FOTA] Update successful, showing banner');
          // Show success notification (no countdown, just message)
          // Pass a callback that will be executed after the banner closes
          Alpine.store('fotaModal').showMessage(
            '✓ Update Complete!',
            `Updated to version ${data.latest_version}.`,
            true,  // autoHide
            async () => {
              // After banner closes (4 sec), reset status and reload UI
              console.log('[FOTA] Banner closed, resetting status and reloading UI');
              await fetch('/cgi-bin/fota/get_update_status?reset=true');
              this.loadStatus();
            }
          );

        } else if (data.status === 'error') {
          // Show error notification
          this.statusMessage = 'Update failed: ' + (data.error_message || 'Unknown error');
          setTimeout(() => {
            if (confirm('Update failed: ' + (data.error_message || 'Unknown error') + '\n\nClick OK to reset.')) {
              fetch('/cgi-bin/fota/get_update_status?reset=true');
              this.loadStatus();
            }
          }, 500);

        } else if (data.status === 'updating') {
          // Update in progress - could be stale if older than 5 min
          // But let polling handle it
          console.log('[FOTA] Update in progress');
        }
      } catch (error) {
        console.error('[FOTA] Failed to check update status on load:', error);
      }
    },

    async checkUpdateInProgress() {
      try {
        const response = await fetch('/cgi-bin/fota/get_update_status');
        const data = await response.json();

        if (data.status === 'updating') {
          console.log('[FOTA] Update in progress, starting polling...');
          this.startPolling();
        }
      } catch (error) {
        console.error('[FOTA] Failed to check update status:', error);
      }
    },

    startPolling() {
      if (this.pollingInterval) {
        return; // Already polling
      }

      this.updateInProgress = true;
      this.statusMessage = 'Updating... Please wait.';

      console.log('[FOTA] Starting status polling...');

      this.pollingInterval = setInterval(async () => {
        try {
          const response = await fetch('/cgi-bin/fota/get_update_status');
          const data = await response.json();

          console.log('[FOTA] Poll status:', data.status);

          if (data.status === 'success') {
            this.stopPolling();
            this.updateInProgress = false;
            this.isLoading = false;

            // Show success modal with countdown
            Alpine.store('fotaModal').showSuccess(
              'Update Complete!',
              `Updated to version ${data.latest_version || this.latestVersion}. Refreshing in `,
              10
            );
          } else if (data.status === 'error') {
            this.stopPolling();
            this.updateInProgress = false;
            this.isLoading = false;
            this.statusMessage = 'Update failed: ' + (data.error_message || 'Unknown error');
          }
          // Keep polling if status is still 'updating'
        } catch (error) {
          console.error('[FOTA] Polling error:', error);
          // Don't stop polling on network errors, might be temporary
        }
      }, 2000); // Poll every 2 seconds
    },

    stopPolling() {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
        console.log('[FOTA] Stopped polling');
      }
    },

    selectRelease(version) {
      console.log('[FOTA] Selected release:', version);

      // Find the release in available releases
      const release = this.availableReleases.find(r => r.version === version);
      if (!release) {
        console.error('[FOTA] Release not found:', version);
        return;
      }

      // Update selected version and changelog
      this.selectedVersion = version;
      this.changelog = release.changelog;

      // Update the download URL for this specific version
      // This will be used when downloading
      this.updateDownloadUrl = release.downloadUrl;

      console.log('[FOTA] Updated to version:', version, 'URL:', release.downloadUrl);
    },

    async loadStatus() {
      try {
        const response = await fetch('/cgi-bin/fota/get_update_status');
        const data = await response.json();

        // Update state
        this.updateChannel = data.channel || 'stable';
        this.currentVersion = data.current_version;
        this.latestVersion = data.latest_version;
        this.selectedVersion = data.latest_version; // Default to latest
        this.updateAvailable = data.update_available;
        this.updateDownloaded = data.update_downloaded;
        this.hasBackup = data.backup_created;
        this.changelog = data.changelog || '';

        // Parse available releases
        if (data.available_releases && Array.isArray(data.available_releases)) {
          this.availableReleases = data.available_releases.map(release => ({
            version: release.tag_name.replace(/^v/, ''),
            downloadUrl: release.assets?.find(a => a.name.endsWith('.tar.gz'))?.browser_download_url || '',
            changelog: release.body || '',
            prerelease: release.prerelease || false,
            publishedAt: release.published_at || ''
          }));
        }

        // Update status message
        if (data.status === 'downloading') {
          this.statusMessage = 'Downloading update...';
          this.isLoading = true;
        } else if (data.status === 'applying') {
          this.statusMessage = 'Applying update...';
          this.isLoading = true;
        } else if (data.status === 'rollback') {
          this.statusMessage = 'Rolling back...';
          this.isLoading = true;
        } else if (data.status === 'error') {
          this.statusMessage = 'Error: ' + (data.error_message || 'Unknown error');
          this.isLoading = false;
        } else if (this.updateAvailable) {
          this.statusMessage = `New ${this.updateChannel} version available: ${this.latestVersion}`;
          this.isLoading = false;
        } else {
          this.statusMessage = 'Already up to date';
          this.isLoading = false;
        }

      } catch (error) {
        console.error('[FOTA] Failed to load status:', error);
      }
    },

    async checkUpdates() {
      this.isLoading = true;
      this.statusMessage = 'Checking for updates...';

      try {
        const response = await fetch(`/cgi-bin/fota/check_updates?channel=${this.updateChannel}`);
        const data = await response.json();

        if (data.ok) {
          await this.loadStatus();
        } else {
          this.statusMessage = 'Error: ' + data.message;
          this.isLoading = false;
        }
      } catch (error) {
        console.error('[FOTA] Check updates failed:', error);
        this.statusMessage = 'Failed to check for updates';
        this.isLoading = false;
      }
    },

    async changeChannel() {
      console.log('[FOTA] Changing channel to:', this.updateChannel);
      // Clear state and trigger re-check
      this.latestVersion = '';
      this.updateAvailable = false;
      this.updateDownloaded = false;
      this.changelog = '';
      // Check for updates on new channel
      await this.checkUpdates();
    },

    async downloadUpdate() {
      if (!this.updateAvailable) {
        this.statusMessage = 'No update available to download';
        return;
      }

      this.isLoading = true;
      this.statusMessage = 'Starting download...';

      try {
        // If a specific version is selected, pass its download URL
        let downloadUrl = this.updateDownloadUrl || '';

        // Find the selected release to get its download URL
        if (!downloadUrl && this.selectedVersion && this.availableReleases.length > 0) {
          const selectedRelease = this.availableReleases.find(r => r.version === this.selectedVersion);
          if (selectedRelease) {
            downloadUrl = selectedRelease.downloadUrl;
          }
        }

        const response = await fetch('/cgi-bin/fota/download_update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            download_url: downloadUrl,
            version: this.selectedVersion || this.latestVersion
          })
        });
        const data = await response.json();

        if (data.ok) {
          this.statusMessage = 'Download completed';
          await this.loadStatus();
        } else {
          this.statusMessage = 'Download failed: ' + data.message;
          this.isLoading = false;
        }
      } catch (error) {
        console.error('[FOTA] Download failed:', error);
        this.statusMessage = 'Download failed';
        this.isLoading = false;
      }
    },

    applyUpdate() {
      console.log('[FOTA] applyUpdate called, updateDownloaded:', this.updateDownloaded);
      if (!this.updateDownloaded) {
        console.error('[FOTA] Cannot apply - no update downloaded');
        this.statusMessage = 'No update downloaded';
        return;
      }

      console.log('[FOTA] Showing confirmation modal via store');
      // Show confirmation modal with target version using Alpine Store
      Alpine.store('fotaModal').open(
        'Update Web UI',
        `This will update to version ${this.latestVersion}. The update will install in the background and the page will refresh automatically when complete.`,
        () => this.performApplyUpdate()
      );
    },

    async performApplyUpdate() {
      this.isLoading = true;
      this.statusMessage = 'Starting update process...';

      try {
        console.log('[FOTA] Starting background update...');
        const response = await fetch('/cgi-bin/fota/apply_update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': '0'
          },
          body: ''
        });

        console.log('[FOTA] Response status:', response.status);
        console.log('[FOTA] Response ok:', response.ok);

        // Check if response is ok before parsing JSON
        if (!response.ok) {
          console.error('[FOTA] HTTP error:', response.status, response.statusText);
          this.statusMessage = `HTTP error ${response.status}: ${response.statusText}`;
          this.isLoading = false;
          return;
        }

        // Get raw text first for debugging
        const responseText = await response.text();
        console.log('[FOTA] Response text:', responseText);

        // Parse JSON
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[FOTA] Failed to parse JSON:', parseError);
          console.error('[FOTA] Response was:', responseText);
          this.statusMessage = 'Invalid server response';
          this.isLoading = false;
          return;
        }

        console.log('[FOTA] Response data:', data);

        if (data.ok) {
          console.log('[FOTA] Update worker launched successfully');
          console.log('[FOTA] Target version:', data.data?.version);

          // Check if response includes refresh_after instruction
          if (data.refresh_after) {
            const refreshSeconds = data.refresh_after;
            console.log('[FOTA] Will refresh after', refreshSeconds, 'seconds');

            // Show countdown modal and refresh
            Alpine.store('fotaModal').showSuccess(
              'Update in Progress',
              'Update in progress. Page will refresh in ',
              refreshSeconds
            );
          } else {
            // Old behavior: start polling
            this.startPolling();
            this.statusMessage = 'Update in progress... This may take a minute.';
          }
        } else {
          this.statusMessage = 'Apply failed: ' + (data.message || 'Unknown error');
          this.isLoading = false;
        }
      } catch (error) {
        console.error('[FOTA] Network error:', error);
        this.statusMessage = 'Apply failed: ' + error.message;
        this.isLoading = false;
      }
    },

    rollbackUpdate() {
      if (!this.hasBackup) {
        this.statusMessage = 'No backup available';
        return;
      }

      // Show confirmation modal with version info using Alpine Store
      Alpine.store('fotaModal').open(
        'Rollback Update',
        `This will rollback to version ${this.currentVersion}. The interface will refresh automatically.`,
        () => this.performRollback()
      );
    },

    async performRollback() {
      this.isLoading = true;
      this.statusMessage = 'Rolling back...';

      try {
        const response = await fetch('/cgi-bin/fota/rollback_update', {
          method: 'POST'
        });
        const data = await response.json();

        if (data.ok) {
          // Show success modal with countdown
          Alpine.store('fotaModal').showSuccess(
            'Rollback Complete!',
            `Rolled back to version ${this.currentVersion}. Refreshing in `,
            5
          );
        } else {
          this.statusMessage = 'Rollback failed: ' + data.message;
          this.isLoading = false;
        }
      } catch (error) {
        console.error('[FOTA] Rollback failed:', error);
        this.statusMessage = 'Rollback failed';
        this.isLoading = false;
      }
    },

    async clearCache() {
      this.isLoading = true;
      this.statusMessage = 'Clearing cache...';

      try {
        const response = await fetch('/cgi-bin/fota/cleanup_downloads', {
          method: 'POST'
        });
        const data = await response.json();

        if (data.ok) {
          this.statusMessage = 'Cache cleared successfully';
          // Clear local state
          this.updateDownloaded = false;
          this.latestVersion = '';
          this.updateAvailable = false;
          this.changelog = '';
          // Re-check for updates
          await this.checkUpdates();
        } else {
          this.statusMessage = 'Clear cache failed: ' + data.message;
          this.isLoading = false;
        }
      } catch (error) {
        console.error('[FOTA] Clear cache failed:', error);
        this.statusMessage = 'Failed to clear cache';
        this.isLoading = false;
      }
    },
  };
}