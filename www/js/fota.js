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
    
    open(title, message, action) {
      this.title = title;
      this.message = message;
      this.action = action;
      this.countdown = 0; // Start at 0 for confirmation
      this.show = true;
    },
    
    close() {
      this.show = false;
      this.action = null;
    },
    
    confirm() {
      if (this.action) {
        this.action();
      }
      this.close();
    },
    
    showSuccess(title, message, countdownSeconds = 5) {
      this.title = title;
      this.message = message;
      this.countdown = countdownSeconds;
      this.show = true;
      this.action = null;
      
      // Start countdown
      const countdownInterval = setInterval(() => {
        this.countdown--;
        if (this.countdown <= 0) {
          clearInterval(countdownInterval);
          // Refresh page
          window.location.href = '/';
        }
      }, 1000);
    }
  });
});

// Make it globally available for Alpine.js
window.fotaManager = function() {
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
        `This will update to version ${this.latestVersion}. The interface will refresh automatically.`,
        () => this.performApplyUpdate()
      );
    },

    async performApplyUpdate() {
      this.isLoading = true;
      this.statusMessage = 'Applying update...';

      try {
        const response = await fetch('/cgi-bin/fota/apply_update', {
          method: 'POST'
        });
        const data = await response.json();

        if (data.ok) {
          // Show success modal with countdown
          Alpine.store('fotaModal').showSuccess(
            'Update Complete!',
            `Updated to version ${this.latestVersion}. Refreshing in ${Alpine.store('fotaModal').countdown} seconds...`,
            5
          );
        } else {
          this.statusMessage = 'Apply failed: ' + data.message;
          this.isLoading = false;
        }
      } catch (error) {
        console.error('[FOTA] Apply failed:', error);
        this.statusMessage = 'Apply failed';
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
            `Rolled back to version ${this.currentVersion}. Refreshing in ${Alpine.store('fotaModal').countdown} seconds...`,
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