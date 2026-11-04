import fs from "node:fs";
import path from "node:path";

import winston from "winston";

import { LoggerLevels } from "@/logging/types";

if (process.env.LOGS_PATH === undefined) {
  throw new Error("Environment variable LOGS_PATH is not set");
}

const env = process.env.NODE_ENV;
if (env === undefined) {
  throw new Error("process.env.NODE_ENV is not defined");
}

const isProd = env === "production";
const isTest = env === "test";
export const errorsLogFilePath = path.join(process.env.LOGS_PATH, "errors.log");
const logFilePath = path.join(process.env.LOGS_PATH, "log.log");

if (!fs.existsSync(process.env.LOGS_PATH)) {
  fs.mkdirSync(process.env.LOGS_PATH, { recursive: true });
}

const fileFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint(),
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

const errorFileTransport = new winston.transports.File({
  filename: errorsLogFilePath,
  format: fileFormat,
  level: LoggerLevels.warning,
  maxsize: 1024 * 1024 * 1, // 1 MB
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
    maxsize: 1024 * 1024 * 5, // 5 MB
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
