import { AppContextStorage } from "@/contexts/app-context-storage";
import clientLoggerFn from "@/logging/clientLoggerFn";
import type { LoggerLevels } from "@/logging/types";

export default async function clientLog(
  level: LoggerLevels,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  return clientLoggerFn({
    data: { level, message, meta: { ...meta, appContextStorage: AppContextStorage.load().toJSON() } },
  });
}
