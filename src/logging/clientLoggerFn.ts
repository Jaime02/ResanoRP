import { createServerFn } from "@tanstack/react-start";

import logger from "@/logging/logger";
import { clientErrorSchema } from "@/schemas";

const clientLoggerFn = createServerFn({
  method: "POST",
})
  .validator((data: unknown) => clientErrorSchema.parse(data))
  .handler(({ data }) => {
    logger.log(data.level, data.message, data.meta);
  });

export default clientLoggerFn;
