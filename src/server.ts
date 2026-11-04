import { createServerEntry, createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const startHandler = createStartHandler(defaultStreamHandler);

export default createServerEntry({
  async fetch(request, opts) {
    try {
      return await startHandler(request, opts);
    } catch (error) {
      // Start rethrows the abort reason when the client goes away (navigation, Electric long-poll),
      // and handleStartError would log every one of them as an error
      if (request.signal.aborted) {
        return new Response(null, { status: 499, statusText: `Client Closed Request` });
      }
      throw error;
    }
  },
});
