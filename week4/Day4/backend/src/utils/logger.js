function formatLog(level, message, meta = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  });
}

function logInfo(message, meta) {
  console.log(formatLog("INFO", message, meta));
}

function logWarn(message, meta) {
  console.warn(formatLog("WARN", message, meta));
}

function logError(message, meta) {
  console.error(formatLog("ERROR", message, meta));
}

module.exports = { logInfo, logWarn, logError };
