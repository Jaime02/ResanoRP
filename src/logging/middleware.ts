import { createMiddleware } from "@tanstack/react-start";

import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";

const loggingMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  const result = await next();
  if (result.response.status >= 400) {
    logger.error(LogMessages.httpRequestFailed, {
      method: request.method,
      statusCode: result.response.status,
      url: request.url,
    });
  }
  return result;
});

export default loggingMiddleware;
