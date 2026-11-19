// How fast the PowerSync service alone answers a set of subscriptions, without a browser. Each argument is a
// stream name or stream:parameter=value, and every run is repeated five times:
// bun --env-file=<stack .env> benchmark/tools/probe-subscriptions.ts <baseURL> sell_order sell_order_line_by_sell_order:sellOrderId=13439
import { createPowerSyncToken } from "@/lib/powersync-token";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const [origin, ...specs] = process.argv.slice(2);
const subscriptions = specs.map((spec) => {
  const [stream, parameter] = spec.split(":");
  const [name, value] = parameter?.split("=") ?? [];
  return { override_priority: null, parameters: name === undefined ? {} : { [name]: Number(value) }, stream };
});
const times: Array<number> = [];
let ops = 0;
let bytes = 0;
for (let run = 0; run < 5; run++) {
  const start = performance.now();
  const response = await fetch(`${origin}/powersync/sync/stream`, {
    body: JSON.stringify({
      buckets: [],
      client_id: `benchmark-probe-${run}`,
      include_checksum: true,
      parameters: {},
      raw_data: true,
      streams: { include_defaults: false, subscriptions },
    }),
    headers: {
      Accept: "application/x-ndjson",
      Authorization: `Token ${createPowerSyncToken()}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  ops = 0;
  bytes = 0;
  read: for (;;) {
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
        times.push(Math.round(performance.now() - start));
        await reader.cancel();
        break read;
      }
    }
  }
}
console.log(`${specs.join(" ")}: ${ops} ops, ${(bytes / 1024).toFixed(0)} KB decoded, ms ${times.join(" ")}`);
process.exit(0);
