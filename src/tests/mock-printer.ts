// A network printer for the e2e tests, run by the mock-printer service of docker/docker-compose.test.yml. It answers
// IPP like the shop's printers under every host alias of the container, and saves each accepted job as JSON in
// PRINTER_JOBS_PATH, where the tests read it. It also takes raw jobs, like the TSC label printer
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import {
  IPP_END_OF_ATTRIBUTES_TAG,
  IPP_GET_PRINTER_ATTRIBUTES,
  IPP_PATH,
  IPP_PORT,
  IPP_PRINT_JOB,
  IPP_VERSION_1_1,
  RAW_PRINT_PORT,
} from "@/files/printer";
import {
  getPrintJobsPath,
  MOCK_REJECTING_PRINTER_HOST,
  parsePwgRaster,
  RAW_JOB_EXTENSION,
} from "@/tests/utils/mock-printer";
import type { TPrintJob } from "@/tests/utils/mock-printer";

const IPP_STATUS_OK = 0x0000;
const IPP_STATUS_BAD_REQUEST = 0x0400;
const IPP_STATUS_DOCUMENT_FORMAT_NOT_SUPPORTED = 0x040a;
const IPP_STATUS_OPERATION_NOT_SUPPORTED = 0x0501;
// Tags below this one delimit the groups of attributes, the rest are the types of their values
const IPP_FIRST_VALUE_TAG = 0x10;

const toOperationCode = ([high, low]: Array<number>) => (high << 8) | low;

function parseIppRequest(body: Buffer) {
  const operation = body.readUInt16BE(2);
  const requestId = body.readUInt32BE(4);
  const attributes: Record<string, string> = {};
  let offset = 8;
  while (offset < body.length) {
    const tag = body[offset++];
    if (tag === IPP_END_OF_ATTRIBUTES_TAG) break;
    if (tag < IPP_FIRST_VALUE_TAG) continue;
    const nameLength = body.readUInt16BE(offset);
    const name = body.toString("utf8", offset + 2, offset + 2 + nameLength);
    offset += 2 + nameLength;
    const valueLength = body.readUInt16BE(offset);
    attributes[name] = body.toString("utf8", offset + 2, offset + 2 + valueLength);
    offset += 2 + valueLength;
  }
  return { attributes, document: body.subarray(offset), operation, requestId };
}

function ippResponse(status: number, requestId: number) {
  const statusAndRequestId = Buffer.alloc(6);
  statusAndRequestId.writeUInt16BE(status, 0);
  statusAndRequestId.writeUInt32BE(requestId, 2);
  return Buffer.concat([Buffer.from(IPP_VERSION_1_1), statusAndRequestId, Buffer.from([IPP_END_OF_ATTRIBUTES_TAG])]);
}

let savedJobs = 0;

function saveJobFile(extension: string, content: string | Buffer) {
  const jobsPath = getPrintJobsPath();
  fs.mkdirSync(jobsPath, { recursive: true });
  savedJobs += 1;
  const fileName = `${String(Date.now()).padStart(15, "0")}-${String(savedJobs).padStart(6, "0")}${extension}`;
  fs.writeFileSync(path.join(jobsPath, fileName), content);
}

function saveJob(job: TPrintJob) {
  saveJobFile(".json", JSON.stringify(job));
}

function answer(host: string, body: Buffer) {
  const { attributes, document, operation, requestId } = parseIppRequest(body);
  if (operation === toOperationCode(IPP_GET_PRINTER_ATTRIBUTES)) return ippResponse(IPP_STATUS_OK, requestId);
  if (operation !== toOperationCode(IPP_PRINT_JOB)) return ippResponse(IPP_STATUS_OPERATION_NOT_SUPPORTED, requestId);
  // A printer that is on, but refuses the jobs it gets
  if (host === MOCK_REJECTING_PRINTER_HOST) return ippResponse(IPP_STATUS_DOCUMENT_FORMAT_NOT_SUPPORTED, requestId);
  try {
    saveJob({ attributes, host, pages: parsePwgRaster(document) });
    return ippResponse(IPP_STATUS_OK, requestId);
  } catch (error) {
    console.error(`Rejected a job for ${host}:`, error);
    return ippResponse(IPP_STATUS_BAD_REQUEST, requestId);
  }
}

http
  .createServer((request, response) => {
    if (request.method !== "POST" || request.url !== IPP_PATH) {
      response.writeHead(404).end();
      return;
    }
    const chunks: Array<Buffer> = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const host = (request.headers.host ?? "").replace(/:\d+$/, "");
      response.writeHead(200, { "Content-Type": "application/ipp" }).end(answer(host, Buffer.concat(chunks)));
    });
  })
  .listen(IPP_PORT, () => {
    console.log(`Mock printer listening on port ${IPP_PORT}`);
  });

// A raw port has no way to answer, so every connection that sends something is a job, saved as it came for the tests
net
  .createServer((socket) => {
    const chunks: Array<Buffer> = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => {
      if (chunks.length > 0) saveJobFile(RAW_JOB_EXTENSION, Buffer.concat(chunks));
      socket.end();
    });
  })
  .listen(RAW_PRINT_PORT, () => {
    console.log(`Mock printer listening on port ${RAW_PRINT_PORT}`);
  });
