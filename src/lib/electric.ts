import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";

type BunRuntimeRequest = Request & {
  runtime?: { bun?: { server?: { timeout: (request: Request, seconds: number) => void } } };
};

/**
 * Prepares the Electric SQL proxy URL from a request URL
 * Copies over Electric-specific query params
 * @param requestUrl - The incoming request URL
 * @returns The prepared Electric SQL origin URL
 */
export function prepareElectricUrl(requestUrl: string): URL {
  const url = new URL(requestUrl);

  if (process.env.ELECTRIC_URL === undefined) {
    throw new Error("Environment variable ELECTRIC_URL is not set");
  }

  const originUrl = new URL(`/v1/shape`, process.env.ELECTRIC_URL);

  // Copy Electric-specific query params
  url.searchParams.forEach((value, key) => {
    if (ELECTRIC_PROTOCOL_QUERY_PARAMS.includes(key)) {
      originUrl.searchParams.set(key, value);
    }
  });

  return originUrl;
}

/**
 * Proxies a request to Electric SQL and returns the response
 * @param originUrl - The prepared Electric SQL URL
 * @param request - The incoming request. A POST carries the subset of a snapshot in its body, and its abort signal
 *   makes a client disconnect also cancel the upstream `live=true` long-poll instead of leaving it dangling until
 *   Electric times out
 * @returns The proxied response
 */
export async function proxyElectricRequest(originUrl: URL, request: Request): Promise<Response> {
  // The production server (Bun, through srvx) closes a connection idle for 10 s, but Electric holds a live long-poll
  // for 20 s, so the proxy answered every long-poll that found no changes with a 502
  (request as BunRuntimeRequest).runtime?.bun?.server?.timeout(request, 0);

  const isPost = request.method === "POST";
  const response = await fetch(originUrl, {
    method: request.method,
    headers: isPost ? { "content-type": "application/json" } : undefined,
    body: isPost ? await request.text() : undefined,
    signal: request.signal,
  });

  const headers = new Headers(response.headers);
  headers.delete(`content-encoding`);
  headers.delete(`content-length`);
  // Electric lets a CDN cache the snapshot for a week and its up-to-date catch-up for a minute, but with no CDN only the
  // browser keeps them: a reload then replays rows that may have changed, and their up-to-date ends the loading
  headers.set(`cache-control`, `no-store`);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
