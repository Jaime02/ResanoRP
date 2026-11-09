import { createIsomorphicFn, createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { AppContextStorage } from "@/contexts/app-context-storage";
import logger from "@/logging/logger";
import type { LoggerLevels } from "@/logging/types";
import { clientErrorSchema } from "@/schemas";

const logFromClientFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => clientErrorSchema.parse(data))
  .handler(({ data }) => {
    logger.log(data.level, data.message, {
      ...data.meta,
      appContextStorage: getCookie(AppContextStorage.COOKIE_NAME),
    });
  });

const log = createIsomorphicFn()
  .server(async (level: LoggerLevels, message: string, meta?: Record<string, unknown>) => {
    logger.log(level, message, meta);
  })
  .client(async (level, message, meta) => logFromClientFn({ data: { level, message, meta } }));

export default log;
