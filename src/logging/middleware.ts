import { createMiddleware } from "@tanstack/react-start";

import logger from "@/logging/logger";
import { LogMessages, UNLOGGED_HTTP_STATUS_CODE } from "@/logging/types";

const loggingMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  const result = await next();
  if (result.response.status >= 400 && result.response.status !== UNLOGGED_HTTP_STATUS_CODE) {
    logger.error(LogMessages.httpRequestFailed, {
      method: request.method,
      statusCode: result.response.status,
      url: request.url,
    });
  }
  return result;
});

export default loggingMiddleware;
