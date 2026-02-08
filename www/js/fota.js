// SimpleAdmin FOTA Manager
// Alpine.js component for firmware update management

function fotaManager() {
  return {
    updateChannel: 'stable',
    currentVersion: '',
    latestVersion: '',
    updateAvailable: false,
    updateDownloaded: false,
    hasBackup: false,
    isLoading: false,
    statusMessage: '',
    changelog: '',
    showFotaModal: false,
    fotaModalTitle: '',
    fotaModalMessage: '',
    fotaCountdown: 0,
    fotaAction: '', // 'apply' or 'rollback'

    init() {
      console.log('[FOTA] Initializing...');
      // Load status and check for updates on page load
      this.checkUpdates();
    },

    async loadStatus() {
      try {
        const response = await fetch('/cgi-bin/fota/get_update_status');
        const data = await response.json();

        if (data.ok === false) {
          console.error('[FOTA] Error loading status:', data.message);
          return;
        }

        // Update state
        this.updateChannel = data.channel || 'stable';
        this.currentVersion = data.current_version;
        this.latestVersion = data.latest_version;
        this.updateAvailable = data.update_available;
        this.updateDownloaded = data.update_downloaded;
        this.hasBackup = data.backup_created;
        this.changelog = data.changelog || '';

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
        const response = await fetch('/cgi-bin/fota/download_update', {
          method: 'POST'
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

    async applyUpdate() {
      if (!this.updateDownloaded) {
        this.statusMessage = 'No update downloaded';
        return;
      }

      // Show confirmation modal
      this.fotaModalTitle = 'Apply Update';
      this.fotaModalMessage = 'This will apply the update and refresh the interface. Continue?';
      this.fotaAction = 'apply';
      this.showFotaModal = true;
      this.fotaCountdown = 0;
    },

    async rollbackUpdate() {
      if (!this.hasBackup) {
        this.statusMessage = 'No backup available';
        return;
      }

      // Show confirmation modal
      this.fotaModalTitle = 'Rollback Update';
      this.fotaModalMessage = 'This will rollback to the previous version and refresh the interface. Continue?';
      this.fotaAction = 'rollback';
      this.showFotaModal = true;
      this.fotaCountdown = 0;
    },

    async confirmFotaAction() {
      this.showFotaModal = false;
      this.isLoading = true;

      const isApply = this.fotaAction === 'apply';
      const endpoint = isApply ? '/cgi-bin/fota/apply_update' : '/cgi-bin/fota/rollback_update';
      const successTitle = isApply ? 'Update Applied!' : 'Rollback Complete!';
      const successMessage = isApply ? 'The update has been applied successfully.' : 'The system has been rolled back to the previous version.';

      this.statusMessage = isApply ? 'Applying update...' : 'Rolling back...';

      try {
        const response = await fetch(endpoint, {
          method: 'POST'
        });
        const data = await response.json();

        if (data.ok) {
          // Show success modal with countdown
          this.fotaModalTitle = successTitle;
          this.fotaModalMessage = successMessage;
          this.showFotaModal = true;
          this.fotaCountdown = 5;
          this.fotaAction = ''; // Clear action

          // Start countdown
          const countdownInterval = setInterval(() => {
            this.fotaCountdown--;
            if (this.fotaCountdown <= 0) {
              clearInterval(countdownInterval);
              // Refresh page
              window.location.href = '/';
            }
          }, 1000);
        } else {
          this.statusMessage = (isApply ? 'Apply' : 'Rollback') + ' failed: ' + data.message;
          this.isLoading = false;
          this.showFotaModal = false;
        }
      } catch (error) {
        console.error('[FOTA] Operation failed:', error);
        this.statusMessage = (isApply ? 'Apply' : 'Rollback') + ' failed';
        this.isLoading = false;
        this.showFotaModal = false;
      }
    },

    closeFotaModal() {
      this.showFotaModal = false;
      this.fotaCountdown = 0;
      this.fotaAction = '';
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
