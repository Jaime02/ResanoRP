import { createTRPCProxyClient, httpBatchLink, httpLink, splitLink, isNonJsonSerializable } from "@trpc/client";

import type { AppRouter } from "@/routes/api/trpc/$";

const TRPC_URL = "/api/trpc";

async function cookieHeader() {
  return {
    cookie: typeof document !== `undefined` ? document.cookie : ``,
  };
}

export default createTRPCProxyClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => isNonJsonSerializable(op.input),
      true: httpLink({
        url: TRPC_URL,
        headers: cookieHeader,
      }),
      false: httpBatchLink({
        url: TRPC_URL,
        headers: cookieHeader,
      }),
    }),
  ],
});
