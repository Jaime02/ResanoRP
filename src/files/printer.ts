// Runs in the mock printer container of the e2e tests too, which only mounts src/, so it must not import anything that
// needs node_modules
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { PRINTER_HOST_PATTERN, PRINTER_SHARE_NAME_PATTERN, PrinterKind } from "@/types/printer";

const PRINT_TIMEOUT_MS = 60_000;
const PING_TIMEOUT_MS = 10_000;
const MS_PER_SECOND = 1000;

export interface TPrinterConnection {
  kind: PrinterKind;
  address: string;
  shareName: string | null;
  username: string | null;
  password: string | null;
  labelWidthMm: number | null;
  labelLengthMm: number | null;
}

const IS_WINDOWS = process.platform === "win32";
const GHOSTSCRIPT_COMMAND = IS_WINDOWS ? "gswin64c" : "gs";
const GHOSTSCRIPT_ARGUMENTS = ["-q", "-dBATCH", "-dNOPAUSE", "-dSAFER"];

// The network printers only accept raster, and only 8-bit gray ("sgray_8" is CUPS_CSPACE_SW, 18) at 600 dpi
export const RASTER_DPI = 600;
export const CUPS_GRAY_COLOR_SPACE = 18;
export const RASTER_BITS_PER_COLOR = 8;

// The label printers have 203 dpi heads and take 1-bit images
export const LABEL_DPI = 203;
const POINTS_PER_MM = 72 / 25.4;
export const INTERMEC_IMAGE_NAME = "RESANORP.1";

// The TSC label printer reads TSPL on the raw port of its network card
export const RAW_PRINT_PORT = 9100;
export const TSPL_BITMAP_OVERWRITE = 0;
const PBM_HEADER_MAX_BYTES = 256;

// The laser printer gets the 1-bit black raster its open source driver (brlaser) turns into the printer's language
const BROTHER_DPI = 600;
const CUPS_BLACK_COLOR_SPACE = 3;
const BROTHER_BITS_PER_COLOR = 1;
const BRLASER_FILTER_PATH = "/usr/lib/cups/filter/rastertobrlaser";

export const IPP_PORT = 631;
export const IPP_PATH = "/ipp/print";
export const IPP_VERSION_1_1 = [0x01, 0x01];
export const IPP_PRINT_JOB = [0x00, 0x02];
export const IPP_GET_PRINTER_ATTRIBUTES = [0x00, 0x0b];
const IPP_REQUEST_ID = [0, 0, 0, 1];
const IPP_OPERATION_ATTRIBUTES_TAG = 0x01;
export const IPP_END_OF_ATTRIBUTES_TAG = 0x03;
const IPP_NAME_TAG = 0x42;
const IPP_CHARSET_TAG = 0x47;
const IPP_NATURAL_LANGUAGE_TAG = 0x48;
const IPP_URI_TAG = 0x45;
const IPP_MIME_MEDIA_TYPE_TAG = 0x49;
export const IPP_FIRST_ERROR_STATUS = 0x0100;
export const PWG_RASTER_MIME_TYPE = "image/pwg-raster";
export const IPP_USER_NAME = "ResanoRP";

export const SHARE_JOB_FILE_NAME = "resanorp.prn";

interface TRunProcessOptions {
  input?: Buffer;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

async function runProcess(
  command: string,
  args: Array<string>,
  { input, cwd, env, timeoutMs = PRINT_TIMEOUT_MS }: TRunProcessOptions = {},
) {
  return new Promise<Buffer<ArrayBuffer>>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const output: Array<Buffer> = [];
    let errorOutput = "";
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (errorOutput += chunk.toString()));
    child.on("error", reject);
    child.stdin.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(output));
        return;
      }
      // smbclient writes its errors, like a wrong password, to its output instead
      const message = errorOutput.trim() || Buffer.concat(output).toString().trim();
      reject(new Error(`${command} exited with code ${code}: ${message}`));
    });
    child.stdin.end(input);
  });
}

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "resanorp-print-"));
  try {
    return await run(directory);
  } finally {
    await fs.rm(directory, { force: true, recursive: true });
  }
}

async function pdfToPwgRaster(pdf: Buffer) {
  return runProcess(
    GHOSTSCRIPT_COMMAND,
    [
      ...GHOSTSCRIPT_ARGUMENTS,
      "-sDEVICE=pwgraster",
      `-r${RASTER_DPI}`,
      `-dcupsColorSpace=${CUPS_GRAY_COLOR_SPACE}`,
      `-dcupsBitsPerColor=${RASTER_BITS_PER_COLOR}`,
      "-sOutputFile=-",
      "-",
    ],
    { input: pdf },
  );
}

// Direct Protocol keeps the layout of a label for the next one, so each label starts and ends by clearing it. The
// bytes of the image follow the CR of the line that announces them: a LF after it would be read as their first byte
function intermecDirectProtocolLabel(pcx: Buffer) {
  return Buffer.concat([
    Buffer.from(`CLL\r\nIMAGE LOAD "${INTERMEC_IMAGE_NAME}",${pcx.length},""\r`),
    pcx,
    Buffer.from(`\r\nPP 0,0\r\nPM "${INTERMEC_IMAGE_NAME}"\r\nPF\r\nREMOVE IMAGE "${INTERMEC_IMAGE_NAME}"\r\nCLL\r\n`),
  ]);
}

function getLabelSize(printer: TPrinterConnection) {
  if (printer.labelWidthMm === null || printer.labelLengthMm === null) {
    throw new Error("The label printer has no label size");
  }
  return { labelLengthMm: printer.labelLengthMm, labelWidthMm: printer.labelWidthMm };
}

// Each page becomes the 1-bit image of one label, scaled to the labels the printer has loaded. The printer prints
// across their width, so Ghostscript turns a page that is wider than tall to fit them
async function pdfToLabelImages(printer: TPrinterConnection, pdf: Buffer, device: string) {
  const { labelWidthMm, labelLengthMm } = getLabelSize(printer);
  return withTemporaryDirectory(async (directory) => {
    await runProcess(
      GHOSTSCRIPT_COMMAND,
      [
        ...GHOSTSCRIPT_ARGUMENTS,
        `-sDEVICE=${device}`,
        `-r${LABEL_DPI}`,
        `-dDEVICEWIDTHPOINTS=${labelWidthMm * POINTS_PER_MM}`,
        `-dDEVICEHEIGHTPOINTS=${labelLengthMm * POINTS_PER_MM}`,
        "-dFIXEDMEDIA",
        "-dPDFFitPage",
        `-sOutputFile=${path.join(directory, "page-%04d")}`,
        "-",
      ],
      { input: pdf },
    );
    const pageFileNames = (await fs.readdir(directory)).sort();
    return Promise.all(pageFileNames.map(async (fileName) => fs.readFile(path.join(directory, fileName))));
  });
}

async function pdfToIntermecDirectProtocol(printer: TPrinterConnection, pdf: Buffer) {
  const pcxPages = await pdfToLabelImages(printer, pdf, "pcxmono");
  return Buffer.concat(pcxPages.map(intermecDirectProtocolLabel));
}

// A raw PBM (P4) is a text header with the size in dots, then the rows, each padded to whole bytes
function parsePbm(pbm: Buffer) {
  const header = /^P4\s+(?:#[^\n]*\n\s*)*(\d+)\s+(\d+)\s/.exec(pbm.toString("latin1", 0, PBM_HEADER_MAX_BYTES));
  if (header === null) throw new Error("Ghostscript did not write a raw PBM");
  const [{ length }, width, height] = header;
  return { bits: pbm.subarray(length), bytesPerRow: Math.ceil(Number(width) / 8), height: Number(height) };
}

// TSPL marks a dot to print with a 0 bit, the opposite of PBM. The gap between labels is not sent, so the printer keeps
// the one it was calibrated with
function labelImagesToTspl(printer: TPrinterConnection, pbmPages: Array<Buffer>) {
  const { labelWidthMm, labelLengthMm } = getLabelSize(printer);
  return Buffer.concat([
    Buffer.from(`SIZE ${labelWidthMm} mm,${labelLengthMm} mm\r\n`),
    ...pbmPages.flatMap((pbm) => {
      const { bits, bytesPerRow, height } = parsePbm(pbm);
      return [
        Buffer.from(`CLS\r\nBITMAP 0,0,${bytesPerRow},${height},${TSPL_BITMAP_OVERWRITE},`),
        bits.map((byte) => ~byte & 0xff),
        Buffer.from("\r\nPRINT 1,1\r\n"),
      ];
    }),
  ]);
}

// Resolves once the whole job is handed to the network, as a raw port answers nothing. A ping sends an empty job
async function sendToRawPort(address: string, job: Buffer, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: address, port: RAW_PRINT_PORT, timeout: timeoutMs });
    socket.on("timeout", () => socket.destroy(new Error("The printer did not answer in time")));
    socket.on("error", reject);
    socket.on("connect", () => socket.end(job, resolve));
  });
}

async function pdfToBrotherLaser(pdf: Buffer) {
  const raster = await runProcess(
    GHOSTSCRIPT_COMMAND,
    [
      ...GHOSTSCRIPT_ARGUMENTS,
      "-sDEVICE=cups",
      `-r${BROTHER_DPI}`,
      `-dcupsColorSpace=${CUPS_BLACK_COLOR_SPACE}`,
      `-dcupsBitsPerColor=${BROTHER_BITS_PER_COLOR}`,
      "-sOutputFile=-",
      "-",
    ],
    { input: pdf },
  );
  // A CUPS filter takes the job id, the user, the title, the copies and the options before its input
  return runProcess(BRLASER_FILTER_PATH, ["1", IPP_USER_NAME, IPP_USER_NAME, "1", ""], { input: raster });
}

// smbclient reads the password from PASSWD, so it never shows up in the arguments of the process. Without one, -N
// keeps it from waiting for it on its input
async function runSmbClient(printer: TPrinterConnection, command: string, timeoutMs: number, cwd?: string) {
  if (printer.shareName === null) throw new Error("The printer has no share name");
  return runProcess(
    "smbclient",
    [
      `//${printer.address}/${printer.shareName}`,
      "-m",
      "SMB3",
      "-t",
      String(Math.ceil(timeoutMs / MS_PER_SECOND)),
      ...(printer.username === null ? [] : ["-U", printer.username]),
      ...(printer.password === null ? ["-N"] : []),
      "-c",
      command,
    ],
    { cwd, env: printer.password === null ? {} : { PASSWD: printer.password }, timeoutMs },
  );
}

// Checked again here, as a printer saved before the patterns were tightened may hold an operator of cmd.exe
function getWindowsSharePath(printer: TPrinterConnection) {
  if (printer.shareName === null) throw new Error("The printer has no share name");
  if (!PRINTER_HOST_PATTERN.test(printer.address) || !PRINTER_SHARE_NAME_PATTERN.test(printer.shareName)) {
    throw new Error(`The share path of the printer is not valid: \\\\${printer.address}\\${printer.shareName}`);
  }
  return `\\\\${printer.address}\\${printer.shareName}`;
}

// Windows allows one user per server name in a logon session, and every job shares the session of the service, so
// the jobs of a server go one at a time and none drops the connection another one is printing through
const windowsServerQueues = new Map<string, Promise<unknown>>();

async function queueOnWindowsServer<T>(printer: TPrinterConnection, run: (sharePath: string) => Promise<T>) {
  const key = printer.address.toLowerCase();
  const job = (windowsServerQueues.get(key) ?? Promise.resolve()).then(async () => run(getWindowsSharePath(printer)));
  windowsServerQueues.set(
    key,
    job.catch(() => undefined),
  );
  return job;
}

// With *, net reads the password from its input, so it never shows up in the arguments of the process
async function runNetUse(printer: TPrinterConnection, sharePath: string) {
  return runProcess(
    "net",
    [
      "use",
      sharePath,
      ...(printer.password === null ? [] : ["*"]),
      ...(printer.username === null ? [] : [`/user:${printer.username}`]),
    ],
    {
      input: printer.password === null ? undefined : Buffer.from(`${printer.password}\r\n`),
      timeoutMs: PING_TIMEOUT_MS,
    },
  );
}

// Win32_NetworkConnection lists the connections without a drive letter too, and unlike Get-SmbConnection it needs no
// administrator. The output of net use is translated and cuts the share names with spaces
async function disconnectWindowsServer(address: string) {
  const output = await runProcess(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::OutputEncoding = [Text.Encoding]::UTF8; (Get-CimInstance Win32_NetworkConnection).RemoteName",
    ],
    { timeoutMs: PING_TIMEOUT_MS },
  );
  const serverPrefix = `\\\\${address}\\`.toLowerCase();
  const connections = output
    .toString()
    .split(/\r?\n/)
    .map((connection) => connection.trim())
    .filter((connection) => connection.toLowerCase().startsWith(serverPrefix));
  for (const connection of connections) {
    await runProcess("net", ["use", connection, "/delete", "/y"], { timeoutMs: PING_TIMEOUT_MS });
  }
  return connections.length;
}

// net use succeeds on a share already connected with the same user, and fails with error 1219 if the server has a
// connection with another one, like one left by an earlier run with the old credentials of the printer
async function connectToWindowsShare(printer: TPrinterConnection, sharePath: string) {
  try {
    await runNetUse(printer, sharePath);
  } catch (error) {
    if ((await disconnectWindowsServer(printer.address)) === 0) throw error;
    await runNetUse(printer, sharePath);
  }
}

async function printOnWindowsShare(printer: TPrinterConnection, job: Buffer) {
  await withTemporaryDirectory(async (directory) => {
    const jobPath = path.join(directory, SHARE_JOB_FILE_NAME);
    await fs.writeFile(jobPath, job);
    await queueOnWindowsServer(printer, async (sharePath) => {
      await connectToWindowsShare(printer, sharePath);
      await runProcess("cmd", ["/c", "copy", "/b", jobPath, sharePath]);
    });
  });
}

// brlaser is a CUPS filter and does not exist on Windows, so the page goes through the driver Windows has for the
// printer instead of being made into its language here
async function printOnWindowsDriver(printer: TPrinterConnection, pdf: Buffer) {
  await queueOnWindowsServer(printer, async (sharePath) => {
    await connectToWindowsShare(printer, sharePath);
    await runProcess(
      GHOSTSCRIPT_COMMAND,
      [...GHOSTSCRIPT_ARGUMENTS, "-sDEVICE=mswinpr2", "-dNoCancel", `-sOutputFile=%printer%${sharePath}`, "-"],
      { input: pdf },
    );
  });
}

async function printOnShare(printer: TPrinterConnection, job: Buffer) {
  if (IS_WINDOWS) {
    await printOnWindowsShare(printer, job);
    return;
  }
  await withTemporaryDirectory(async (directory) => {
    await fs.writeFile(path.join(directory, SHARE_JOB_FILE_NAME), job);
    await runSmbClient(printer, `print ${SHARE_JOB_FILE_NAME}`, PRINT_TIMEOUT_MS, directory);
  });
}

function ippLengthPrefixed(value: string) {
  const valueBuffer = Buffer.from(value);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(valueBuffer.length);
  return Buffer.concat([length, valueBuffer]);
}

function ippAttribute(tag: number, name: string, value: string) {
  return Buffer.concat([Buffer.from([tag]), ippLengthPrefixed(name), ippLengthPrefixed(value)]);
}

function buildIppRequest(
  operation: Array<number>,
  address: string,
  operationAttributes: Array<Buffer<ArrayBuffer>>,
  body: Buffer<ArrayBuffer> = Buffer.alloc(0),
) {
  return Buffer.concat([
    Buffer.from([...IPP_VERSION_1_1, ...operation, ...IPP_REQUEST_ID, IPP_OPERATION_ATTRIBUTES_TAG]),
    ippAttribute(IPP_CHARSET_TAG, "attributes-charset", "utf-8"),
    ippAttribute(IPP_NATURAL_LANGUAGE_TAG, "attributes-natural-language", "en"),
    ippAttribute(IPP_URI_TAG, "printer-uri", `ipp://${address}:${IPP_PORT}${IPP_PATH}`),
    ippAttribute(IPP_NAME_TAG, "requesting-user-name", IPP_USER_NAME),
    ...operationAttributes,
    Buffer.from([IPP_END_OF_ATTRIBUTES_TAG]),
    body,
  ]);
}

async function sendIppRequest(address: string, request: Buffer<ArrayBuffer>, timeoutMs: number) {
  const response = await fetch(`http://${address}:${IPP_PORT}${IPP_PATH}`, {
    body: new Uint8Array(request),
    headers: { "Content-Type": "application/ipp" },
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`The printer answered with HTTP ${response.status}`);
  }
  const ippStatus = Buffer.from(await response.arrayBuffer()).readUInt16BE(2);
  if (ippStatus >= IPP_FIRST_ERROR_STATUS) {
    throw new Error(`The printer answered with IPP status 0x${ippStatus.toString(16)}`);
  }
}

export async function printPdfOnPrinter(printer: TPrinterConnection, pdf: Buffer) {
  switch (printer.kind) {
    case PrinterKind.Ipp: {
      const request = buildIppRequest(
        IPP_PRINT_JOB,
        printer.address,
        [ippAttribute(IPP_MIME_MEDIA_TYPE_TAG, "document-format", PWG_RASTER_MIME_TYPE)],
        await pdfToPwgRaster(pdf),
      );
      await sendIppRequest(printer.address, request, PRINT_TIMEOUT_MS);
      return;
    }
    case PrinterKind.IntermecShare:
      await printOnShare(printer, await pdfToIntermecDirectProtocol(printer, pdf));
      return;
    case PrinterKind.BrotherShare:
      if (IS_WINDOWS) {
        await printOnWindowsDriver(printer, pdf);
        return;
      }
      await printOnShare(printer, await pdfToBrotherLaser(pdf));
      return;
    case PrinterKind.TscRaw:
      await sendToRawPort(
        printer.address,
        labelImagesToTspl(printer, await pdfToLabelImages(printer, pdf, "pbmraw")),
        PRINT_TIMEOUT_MS,
      );
      return;
    // The column is plain text, so a seeded typo must fail instead of reporting a job that was never sent
    default:
      throw new Error(`Unknown printer kind ${String(printer.kind)}`);
  }
}

// An IPP printer is asked for its state, a share for its queue, which also checks the user and the password, and a raw
// port only has to take a connection
export async function pingPrinter(printer: TPrinterConnection) {
  if (printer.kind === PrinterKind.Ipp) {
    await sendIppRequest(
      printer.address,
      buildIppRequest(IPP_GET_PRINTER_ATTRIBUTES, printer.address, []),
      PING_TIMEOUT_MS,
    );
    return;
  }
  if (printer.kind === PrinterKind.TscRaw) {
    await sendToRawPort(printer.address, Buffer.alloc(0), PING_TIMEOUT_MS);
    return;
  }
  if (IS_WINDOWS) {
    await queueOnWindowsServer(printer, async (sharePath) => connectToWindowsShare(printer, sharePath));
    return;
  }
  await runSmbClient(printer, "queue", PING_TIMEOUT_MS);
}
