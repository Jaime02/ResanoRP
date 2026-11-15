import fs from "node:fs";
import path from "node:path";

import winston from "winston";

import { LoggerLevels } from "@/logging/types";

if (process.env.LOGS_PATH === undefined) {
  throw new Error("Environment variable LOGS_PATH is not set");
}

// The production bundle inlines NODE_ENV as "production", so it cannot tell the test build apart
const env = process.env.VITE_ENV_NAME;
if (env === undefined) {
  throw new Error("process.env.VITE_ENV_NAME is not defined");
}

const isProd = env === "production";
const isTest = env === "test";
export const errorsLogFilePath = path.join(process.env.LOGS_PATH, "errors.log");
const logFilePath = path.join(process.env.LOGS_PATH, "log.log");

if (!fs.existsSync(process.env.LOGS_PATH)) {
  fs.mkdirSync(process.env.LOGS_PATH, { recursive: true });
}

// One JSON object per line, so the tests can parse every event. The fields of an Error are not enumerable, so
// JSON.stringify would write the errors nested in the metadata as {}
const fileFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json({
    replacer: (_key, value: unknown) =>
      value instanceof Error
        ? Object.assign({}, value, { cause: value.cause, message: value.message, name: value.name, stack: value.stack })
        : value,
  }),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: "HH:mm:ss",
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${String(timestamp)} [${String(level)}]: ${String(message)}${metaStr}`;
  }),
);

const ERRORS_LOG_MAX_BYTES = 1024 * 1024 * 1; // 1 MB
const LOG_MAX_BYTES = 1024 * 1024 * 5; // 5 MB
const LOG_SIZE_CHECK_INTERVAL_MS = 10_000;

// Any browser can write to the logs through logFromClientFn, so without a limit a stuck page fills the disk. Winston
// can only start a new file when one is full, and there must be a single file per log, so a file over its limit is
// emptied instead. Its stream appends, so it keeps writing to the same file
function limitLogFileSize(filePath: string, maxBytes: number) {
  setInterval(() => {
    try {
      if (fs.statSync(filePath).size > maxBytes) fs.truncateSync(filePath);
    } catch {
      // The file does not exist yet
    }
  }, LOG_SIZE_CHECK_INTERVAL_MS).unref();
}

limitLogFileSize(errorsLogFilePath, ERRORS_LOG_MAX_BYTES);
limitLogFileSize(logFilePath, LOG_MAX_BYTES);

const errorFileTransport = new winston.transports.File({
  filename: errorsLogFilePath,
  format: fileFormat,
  level: LoggerLevels.warning,
});

const transports: Array<winston.transport> = [
  errorFileTransport,
  new winston.transports.File({
    filename: logFilePath,
    format: winston.format.combine(
      winston.format((info) => {
        // Only pass through messages at 'info' or 'debug' level
        if (info.level === String(LoggerLevels.info) || info.level === String(LoggerLevels.debug)) {
          return info;
        }
        return false; // Blocks other levels
      })(),
      fileFormat,
    ),
  }),
  new winston.transports.Console({
    format: consoleFormat,
    level: isTest ? LoggerLevels.crit : isProd ? LoggerLevels.warning : LoggerLevels.debug,
    stderrLevels: [LoggerLevels.error, LoggerLevels.warning],
  }),
];

const logger = winston.createLogger({
  exceptionHandlers: [errorFileTransport],
  exitOnError: false,
  levels: winston.config.syslog.levels,
  rejectionHandlers: [errorFileTransport],
  transports,
});

export default logger;
