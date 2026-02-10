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
    hideButtons: false,

    open(title, message, action) {
      this.title = title;
      this.message = message;
      this.action = action;
      this.countdown = 0;
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
      this.hideButtons = true;

      this.updateCountdownMessage(message);

      const countdownInterval = setInterval(() => {
        this.countdown--;
        this.updateCountdownMessage(message);

        if (this.countdown <= 0) {
          clearInterval(countdownInterval);
          if (autoRefresh) {
            window.location.reload();
          } else {
            this.show = false;
            this.hideButtons = false;
          }
        }
      }, 1000);
    },

    showMessage(title, message, autoHide = true, onClose = null) {
      this.title = title;
      this.message = message;
      this.countdown = 0;
      this.action = null;
      this.hideButtons = true;
      this.show = true;

      if (autoHide) {
        setTimeout(() => {
          this.show = false;
          this.hideButtons = false;
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
    previousVersion: '',
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
      this.checkUpdateStatusOnLoad().then(() => {
        this.getStatus().then(data => {
          if (data.status === 'idle') {
            this.checkUpdates();
          } else {
            this.loadStatus();
          }
        });

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
        const response = await fetch('/cgi-bin/fota/get_update_status');
        const data = await response.json();

        if (data.status === 'success') {
          const isRollback = data.previous_version &&
                             data.previous_version !== data.current_version &&
                             data.latest_version === data.previous_version;

          if (isRollback) {
            Alpine.store('fotaModal').showMessage(
              '✓ Rollback Complete!',
              `Rolled back to version ${data.current_version}.`,
              true,
              async () => {
                await fetch('/cgi-bin/fota/get_update_status?reset=true');
                this.loadStatus();
              }
            );
          } else {
            Alpine.store('fotaModal').showMessage(
              '✓ Update Complete!',
              `Updated to version ${data.current_version}.`,
              true,
              async () => {
                await fetch('/cgi-bin/fota/get_update_status?reset=true');
                this.loadStatus();
              }
            );
          }
        } else if (data.status === 'error') {
          this.statusMessage = 'Update failed: ' + (data.error_message || 'Unknown error');
          setTimeout(() => {
            if (confirm('Update failed: ' + (data.error_message || 'Unknown error') + '\n\nClick OK to reset.')) {
              fetch('/cgi-bin/fota/get_update_status?reset=true');
              this.loadStatus();
            }
          }, 500);
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
          this.startPolling();
        }
      } catch (error) {
        console.error('[FOTA] Failed to check update status:', error);
      }
    },

    startPolling() {
      if (this.pollingInterval) {
        return;
      }

      this.updateInProgress = true;
      this.statusMessage = 'Updating... Please wait.';
      console.log('[FOTA] Started polling for update status');

      this.pollingInterval = setInterval(async () => {
        try {
          const response = await fetch('/cgi-bin/fota/get_update_status');
          const data = await response.json();

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
        } catch (error) {
          console.error('[FOTA] Polling error:', error);
        }
      }, 2000);
    },

    stopPolling() {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
        console.log('[FOTA] Stopped polling');
      }
    },

    selectRelease(version) {
      const release = this.availableReleases.find(r => r.version === version);
      if (!release) {
        console.error('[FOTA] Release not found:', version);
        return;
      }

      this.selectedVersion = version;
      this.changelog = release.changelog;
      this.updateDownloadUrl = release.downloadUrl;
    },

    async loadStatus() {
      try {
        const response = await fetch('/cgi-bin/fota/get_update_status');
        const data = await response.json();

        // Update state
        this.updateChannel = data.channel || 'stable';
        this.currentVersion = data.current_version;
        this.latestVersion = data.latest_version;
        this.previousVersion = data.previous_version || '';
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
        `Update from version ${this.currentVersion} to ${this.latestVersion}. The update will install in the background and the page will refresh automatically when complete.`,
        () => this.performApplyUpdate()
      );
    },

    async performApplyUpdate() {
      this.isLoading = true;
      this.statusMessage = 'Starting update process...';

      try {
        const response = await fetch('/cgi-bin/fota/apply_update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': '0'
          },
          body: ''
        });

        if (!response.ok) {
          this.statusMessage = `HTTP error ${response.status}: ${response.statusText}`;
          this.isLoading = false;
          return;
        }

        const responseText = await response.text();
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          this.statusMessage = 'Invalid server response';
          this.isLoading = false;
          return;
        }

        if (data.ok) {
          if (data.refresh_after) {
            Alpine.store('fotaModal').showSuccess(
              'Update in Progress',
              `Updating to version ${this.latestVersion}. Page will refresh in `,
              data.refresh_after
            );
          } else {
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

      // Show confirmation modal with previous version info
      Alpine.store('fotaModal').open(
        'Rollback Update',
        `Rollback from version ${this.currentVersion} to ${this.previousVersion || 'previous'}. The interface will refresh automatically.`,
        () => this.performRollback()
      );
    },

    async performRollback() {
      this.isLoading = true;
      this.statusMessage = 'Rolling back...';

      try {
        const response = await fetch('/cgi-bin/fota/rollback_update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': '0'
          },
          body: ''
        });

        if (!response.ok) {
          this.statusMessage = `HTTP error ${response.status}: ${response.statusText}`;
          this.isLoading = false;
          return;
        }

        const responseText = await response.text();
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          this.statusMessage = 'Invalid server response';
          this.isLoading = false;
          return;
        }

        if (data.ok) {
          if (data.refresh_after) {
            Alpine.store('fotaModal').showSuccess(
              'Rollback in Progress',
              `Rolling back to version ${this.previousVersion}. Page will refresh in `,
              data.refresh_after
            );
          } else {
            this.statusMessage = 'Rollback completed. Please refresh the page.';
            this.isLoading = false;
          }
        } else {
          this.statusMessage = 'Rollback failed: ' + (data.message || 'Unknown error');
          this.isLoading = false;
        }
      } catch (error) {
        console.error('[FOTA] Network error:', error);
        this.statusMessage = 'Rollback failed: ' + error.message;
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