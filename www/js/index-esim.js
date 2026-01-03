/**
 * eSIM Navigation Item Visibility Controller
 *
 * Conditionally displays the eSIM navigation item based on configuration.
 * Reads the eSIM feature flag from the server config and shows/hides the nav item.
 *
 * @module index-esim
 * @requires EsimConfig
 */

document.addEventListener("DOMContentLoaded", () => {
  const esimCard = document.getElementById("esimNavItem");

  // Exit if required elements or modules are missing
  if (!esimCard || typeof EsimConfig === "undefined") {
    return;
  }

  // Load eSIM configuration and conditionally show nav item
  EsimConfig.loadConfig().then((config) => {
    const enabled =
      config && (config.enabled === 1 || config.enabled === "1" || config.enabled === true);
    if (enabled) {
      esimCard.style.display = 'block';
    }
  });
});