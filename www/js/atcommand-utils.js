(function (global) {
  const DEFAULT_TIMEOUT = 10000;
  const DEFAULT_RETRIES = 2;
  const BUSY_PATTERNS = [/busy/i, /in use/i, /locked/i, /not available/i];

  function sanitize(atcmd) {
    if (typeof atcmd !== "string") {
      return "";
    }
    return atcmd.trim();
  }

  function splitLines(text) {
    if (typeof text !== "string") {
      return [];
    }
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  function isBusyResponse(text) {
    if (!text) {
      return false;
    }
    return BUSY_PATTERNS.some((pattern) => pattern.test(text));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function createResult(ok, data, error, meta = {}) {
    return {
      ok,
      data,
      error: error || null,
      ...meta,
    };
  }

  async function execute(atcmd, options = {}) {
    const sanitized = sanitize(atcmd);

    if (!sanitized) {
      return createResult(false, "", new Error("Empty or invalid AT command."), {
        busy: false,
        attempts: 0,
      });
    }

    const retries = Number.isInteger(options.retries) && options.retries >= 0
      ? options.retries
      : DEFAULT_RETRIES;
    const timeout = typeof options.timeout === "number" && options.timeout > 0
      ? options.timeout
      : DEFAULT_TIMEOUT;
    const endpoint = typeof options.endpoint === "string" && options.endpoint.trim() !== ""
      ? options.endpoint.trim()
      : "/cgi-bin/get_atcommand";

    let clientAttempt = 0;
    let lastError = null;
    let lastData = "";
    let busy = false;

    while (clientAttempt <= retries) {
      clientAttempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(
          `${endpoint}?${new URLSearchParams({ atcmd: sanitized })}`,
          { signal: controller.signal }
        );

        clearTimeout(timer);

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        const json = await response.json();
        
        // The server already handles retries (5 attempts), so we use server's attempt count
        const serverAttempts = json.attempts || 1;
        
        if (json.success) {
          lastData = json.output || "";
          
          // Check if output contains ERROR token (modem-level error)
          const hasErrorToken = json.has_error || false;
          
          return createResult(
            !hasErrorToken, 
            lastData, 
            hasErrorToken ? new Error("The modem returned ERROR.") : null, 
            {
              busy: false,
              attempts: serverAttempts,
              command: json.command,
            }
          );
        } else {
          // Server reported failure
          lastData = json.output || "";
          busy = json.busy || false;
          
          if (busy) {
            lastError = new Error(json.message || "The modem is busy. Try again later.");
          } else {
            lastError = new Error(json.message || "Command execution failed.");
          }
          
          // If server already retried and failed, respect that
          if (serverAttempts >= 5 || !busy) {
            return createResult(false, lastData, lastError, {
              busy,
              attempts: serverAttempts,
              command: json.command,
            });
          }
        }

      } catch (error) {
        clearTimeout(timer);
        
        if (error.name === "AbortError") {
          lastError = new Error("AT request timed out.");
        } else {
          lastError = error;
        }
      }

      // Client-side retry with backoff
      if (clientAttempt <= retries) {
        await delay(Math.min(2000, 500 * clientAttempt));
      }
    }

    return createResult(false, lastData, lastError, {
      busy,
      attempts: clientAttempt,
    });
  }

  global.ATCommandService = {
    execute,
    splitLines,
    delay,
    sanitize,
    isBusyResponse,
  };
})(window);