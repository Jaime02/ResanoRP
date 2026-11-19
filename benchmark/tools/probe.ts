// How fast the PowerSync service alone streams every table, without a browser:
// bun --env-file=<stack .env> benchmark/tools/probe.ts <baseURL> [sync-config.yaml]
// The streams are read from the branch's sync config (default docker/powersync/sync-config.yaml)
import { readFileSync } from "node:fs";

import { createPowerSyncToken } from "@/lib/powersync-token";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const [origin, syncConfig = "docker/powersync/sync-config.yaml"] = process.argv.slice(2);
const streams = [...readFileSync(syncConfig, "utf8").matchAll(/^ {2}([a-z_]+):$/gm)].map(([, name]) => name);
const start = performance.now();
const response = await fetch(`${origin}/powersync/sync/stream`, {
  method: "POST",
  headers: {
    Authorization: `Token ${createPowerSyncToken()}`,
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
  },
  body: JSON.stringify({
    buckets: [],
    include_checksum: true,
    raw_data: true,
    client_id: "benchmark-probe",
    parameters: {},
    streams: {
      include_defaults: false,
      subscriptions: streams.map((stream) => ({ stream, parameters: {}, override_priority: null })),
    },
  }),
});
const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
let buffer = "";
let bytes = 0;
let ops = 0;
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  bytes += value.length;
  buffer += value;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (line.startsWith('{"data"')) ops += (JSON.parse(line).data.data as Array<unknown>).length;
    if (line.startsWith('{"checkpoint_complete"')) {
      const completeMs = Math.round(performance.now() - start);
      console.log({ streams: streams.length, ops, decodedMB: +(bytes / 1e6).toFixed(1), completeMs });
      await reader.cancel();
      process.exit(0);
    }
  }
}
