import { createMiddleware } from "@tanstack/react-start";

import logger from "@/logging/logger";

const loggingMiddleware = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  const result = await next();
  if (result.response.status >= 400 && result.response.status != 409) {
    // TODO avoid ignoring 409s, see https://github.com/electric-sql/electric/issues/3150
    logger.error("HTTP request failed", {
      method: request.method,
      statusCode: result.response.status,
      url: request.url,
    });
  }
  return result;
});

export default loggingMiddleware;
