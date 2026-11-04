const host = process.env.VITE_HOST;
const port = process.env.VITE_CADDY_HTTPS_PORT;

if (host === undefined) {
  throw new Error("VITE_HOST environment variable is not set");
}

if (port === undefined) {
  throw new Error("VITE_CADDY_HTTPS_PORT environment variable is not set");
}

const url = `https://${host}:${port}`;
const timeoutMs = 4 * 60 * 1000; // 4 minutes
const intervalMs = 1000;
const deadline = Date.now() + timeoutMs;

// Caddy serves a self-signed cert in test, so allow untrusted TLS.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { redirect: "manual" });
    // Caddy answers 502 while the app is still resetting the database, so only a non-5xx response means the app is up.
    if (response.status < 500) {
      process.exit(0);
    }
  } catch {
    // Not up yet; keep polling.
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.error(`Timed out after ${timeoutMs}ms waiting for ${url}`);
process.exit(1);

export {};
