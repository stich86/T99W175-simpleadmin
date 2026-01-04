/**
 * Login Configuration Manager
 *
 * Provides centralized loading and caching of login configuration from the server.
 * Uses promise caching to avoid redundant fetch requests within the same session.
 *
 * @module login-config
 */

const LoginConfig = (() => {
  let cachePromise = null;

  /**
   * Loads login configuration from the server.
   *
   * Caches the promise to prevent multiple simultaneous requests.
   * Returns a default enabled configuration if the endpoint fails or returns invalid data.
   *
   * @returns {Promise<{enabled: boolean}>} Configuration object with:
   *   - enabled: Whether login functionality is enabled
   *
   * On error, returns { enabled: true } (default to enabled for security)
   */
  async function loadConfig() {
    // Return cached promise if available
    if (cachePromise) {
      return cachePromise;
    }

    // Fetch configuration from server
    cachePromise = fetch("/cgi-bin/login_config", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        // Handle HTTP errors
        if (!response.ok) {
          console.debug("[Login] Login configuration not available (response not OK)");
          return { enabled: true }; // Default to enabled for security
        }
        const payload = await response.json();

        // Validate response structure
        if (!payload || payload.success !== true) {
          console.debug("[Login] Login configuration response not valid", payload);
          return { enabled: true }; // Default to enabled for security
        }
        return payload.data || { enabled: true };
      })
      .catch((error) => {
        console.debug("[Login] Error during login configuration retrieve", error);
        return { enabled: true }; // Default to enabled for security
      });

    return cachePromise;
  }

  return {
    loadConfig,
  };
})();
