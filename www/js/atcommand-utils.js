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
      return createResult(false, "", new Error("Comando AT vuoto o non valido."), {
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

    let attempt = 0;
    let lastError = null;
    let lastData = "";
    let busy = false;

    while (attempt <= retries) {
      attempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(
          `${endpoint}?${new URLSearchParams({ atcmd: sanitized })}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
        } else {
          const text = await response.text();
          lastData = text;

          if (!text.trim()) {
            lastError = new Error("Risposta vuota dal modem.");
          } else if (isBusyResponse(text)) {
            busy = true;
            lastError = new Error("Il modem è occupato, riprovare più tardi.");
          } else {
            const hasErrorToken = text.includes("ERROR");

            return createResult(!hasErrorToken, text, hasErrorToken ? new Error("Il modem ha restituito ERROR.") : null, {
              busy: false,
              attempts: attempt,
            });
          }
        }
      } catch (error) {
        if (error.name === "AbortError") {
          lastError = new Error("Timeout della richiesta AT.");
        } else {
          lastError = error;
        }
      } finally {
        clearTimeout(timer);
      }

      if (attempt <= retries) {
        await delay(Math.min(2000, 500 * attempt));
      }
    }

    return createResult(false, lastData, lastError, {
      busy,
      attempts: attempt,
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
