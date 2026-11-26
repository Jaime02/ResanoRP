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
const POINTS_PER_INCH = 72;
const POINTS_PER_MM = POINTS_PER_INCH / 25.4;
const BITS_PER_BYTE = 8;
export const INTERMEC_IMAGE_NAME = "RESANORP.1";

// The TSC label printer reads TSPL on the raw port of its network card
export const RAW_PRINT_PORT = 9100;
export const TSPL_BITMAP_OVERWRITE = 0;
const PBM_HEADER_MAX_BYTES = 256;

// The laser printer speaks the language of the open source brlaser driver (Owl-Maintain/brlaser 6.2.7: job.cc, line.cc
// and block.h), written here because brlaser is a CUPS filter and the Windows server has no CUPS
const BROTHER_DPI = 600;
// The HL-L2310D starts each line about 5 mm in from the paper edge, which brlaser leaves to the application: a page with
// 1 cm margins printed with 16 mm on the left and 6 mm on the right. Cut in whole bytes of 8 dots
const BROTHER_LEFT_OFFSET_MM = 5;
const BROTHER_LEFT_OFFSET_BYTES = Math.round(
  (BROTHER_LEFT_OFFSET_MM * POINTS_PER_MM * BROTHER_DPI) / POINTS_PER_INCH / BITS_PER_BYTE,
);
const BROTHER_JOB_START_PADDING_BYTES = 128;
const PJL_UNIVERSAL_EXIT = "\x1b%-12345X";
const BROTHER_JOB_SETTINGS = [
  ["RAS1200MODE", "FALSE"],
  ["RESOLUTION", String(BROTHER_DPI)],
  ["ECONOMODE", "OFF"],
  ["SOURCETRAY", "AUTO"],
  ["MEDIATYPE", ""],
  ["PAPER", "A4"],
  ["PAGEPROTECT", "AUTO"],
  ["ORIENTATION", "PORTRAIT"],
];
const BROTHER_LINES_PER_BAND = 64;
const BROTHER_MAX_BLOCK_BYTES = 16_350;
const BROTHER_MAX_LINE_EDITS = 254;
const BROTHER_BLANK_LINE = 0xff;
const BROTHER_OVERFLOW_BYTE = 255;
const BROTHER_EDIT_FIELD_BITS = 7;
const BROTHER_SUBSTITUTE = { countBits: 3, flag: 0 };
const BROTHER_REPEAT = { countBits: 5, flag: 0x80 };
const BROTHER_MIN_REPEAT_BYTES = 2;

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

async function pdfToPageImages(pdf: Buffer, deviceArguments: Array<string>) {
  return withTemporaryDirectory(async (directory) => {
    await runProcess(
      GHOSTSCRIPT_COMMAND,
      [...GHOSTSCRIPT_ARGUMENTS, ...deviceArguments, `-sOutputFile=${path.join(directory, "page-%04d")}`, "-"],
      { input: pdf },
    );
    const pageFileNames = (await fs.readdir(directory)).sort();
    return Promise.all(pageFileNames.map(async (fileName) => fs.readFile(path.join(directory, fileName))));
  });
}

// Each page becomes the 1-bit image of one label, scaled to the labels the printer has loaded. The printer prints
// across their width, so Ghostscript turns a page that is wider than tall to fit them
async function pdfToLabelImages(printer: TPrinterConnection, pdf: Buffer, device: string) {
  const { labelWidthMm, labelLengthMm } = getLabelSize(printer);
  return pdfToPageImages(pdf, [
    `-sDEVICE=${device}`,
    `-r${LABEL_DPI}`,
    `-dDEVICEWIDTHPOINTS=${labelWidthMm * POINTS_PER_MM}`,
    `-dDEVICEHEIGHTPOINTS=${labelLengthMm * POINTS_PER_MM}`,
    "-dFIXEDMEDIA",
    "-dPDFFitPage",
  ]);
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

// A number too big for its field goes on in the bytes after the edit, as 255s and the remainder
function brotherOverflow(value: number) {
  if (value < 0) return [];
  return [
    ...Array.from({ length: Math.floor(value / BROTHER_OVERFLOW_BYTE) }, () => BROTHER_OVERFLOW_BYTE),
    value % BROTHER_OVERFLOW_BYTE,
  ];
}

// An edit starts with a byte holding its kind, then how many bytes it skips and how many it writes
function brotherEditHeader({ countBits, flag }: typeof BROTHER_SUBSTITUTE, offset: number, count: number) {
  const maxCount = (1 << countBits) - 1;
  const maxOffset = (1 << (BROTHER_EDIT_FIELD_BITS - countBits)) - 1;
  return [
    flag | (Math.min(offset, maxOffset) << countBits) | Math.min(count, maxCount),
    ...brotherOverflow(offset - maxOffset),
    ...brotherOverflow(count - maxCount),
  ];
}

function brotherSubstitute(offset: number, bytes: Buffer) {
  return [...brotherEditHeader(BROTHER_SUBSTITUTE, offset, bytes.length - 1), ...bytes];
}

// How many bytes are better written as they are than as a repeat, or left as they were on the line above
function getBrotherSubstituteLength(line: Buffer, reference: Buffer, start: number, end: number) {
  let previous = start;
  for (let index = start; index + 1 < end; index++) {
    if (line[index] === reference[index] && line[index + 1] === reference[index + 1]) return index - start;
    if (line[index] === line[index + 1] && line[index] === line[previous]) return previous - start;
    previous = index;
  }
  return end - start;
}

// A line is the edits that turn the line above it into it, or the whole line when there is no line above
function encodeBrotherLine(line: Buffer, reference?: Buffer) {
  if (line.every((byte) => byte === 0)) return [BROTHER_BLANK_LINE];
  if (reference === undefined) return [1, ...brotherSubstitute(0, line)];

  let end = line.length;
  while (end > 0 && line[end - 1] === reference[end - 1]) end--;
  const output = [0];
  let editCount = 0;
  let position = 0;
  while (position < end) {
    const start = position;
    while (line[position] === reference[position]) position++;
    const offset = position - start;
    editCount++;
    if (editCount === BROTHER_MAX_LINE_EDITS) {
      output.push(...brotherSubstitute(offset, line.subarray(position, end)));
      break;
    }
    const substituteLength = getBrotherSubstituteLength(line, reference, position, end);
    if (substituteLength > 0) {
      output.push(...brotherSubstitute(offset, line.subarray(position, position + substituteLength)));
      position += substituteLength;
      continue;
    }
    let repeatEnd = position + BROTHER_MIN_REPEAT_BYTES;
    while (repeatEnd < end && line[repeatEnd] === line[position]) repeatEnd++;
    output.push(
      ...brotherEditHeader(BROTHER_REPEAT, offset, repeatEnd - position - BROTHER_MIN_REPEAT_BYTES),
      line[position],
    );
    position = repeatEnd;
  }
  output[0] = editCount;
  return output;
}

// The lines go in blocks, and every band of lines starts again from a whole line
function brotherPage(pbm: Buffer, leftOffsetBytes: number) {
  const { bits, bytesPerRow, height } = parsePbm(pbm);
  const chunks = [Buffer.from("\x1b*b1030m")];
  let block: Array<Array<number>> = [];
  let blockBytes = 0;
  const flush = () => {
    if (blockBytes === 0) return;
    chunks.push(
      Buffer.from(`${blockBytes + 2}w`),
      Buffer.from([0, block.length]),
      ...block.map((line) => Buffer.from(line)),
    );
    block = [];
    blockBytes = 0;
  };

  const getLine = (row: number) => bits.subarray(row * bytesPerRow + leftOffsetBytes, (row + 1) * bytesPerRow);
  for (let row = 0; row < height; row++) {
    let encoded = row % BROTHER_LINES_PER_BAND === 0 ? undefined : encodeBrotherLine(getLine(row), getLine(row - 1));
    if (encoded === undefined || blockBytes + encoded.length >= BROTHER_MAX_BLOCK_BYTES) {
      flush();
      encoded = encodeBrotherLine(getLine(row));
    }
    block.push(encoded);
    blockBytes += encoded.length;
  }
  flush();
  chunks.push(Buffer.from("1030M\f"));
  return Buffer.concat(chunks);
}

// The left offset is cut from every line, so the tests compare a job with none to the one brlaser writes
export function pbmPagesToBrotherLaser(pbmPages: Array<Buffer>, leftOffsetBytes = 0) {
  const settings = BROTHER_JOB_SETTINGS.map(([name, value]) => `@PJL SET ${name} = ${value}\n`).join("");
  return Buffer.concat([
    Buffer.alloc(BROTHER_JOB_START_PADDING_BYTES),
    Buffer.from(`${PJL_UNIVERSAL_EXIT}@PJL\n@PJL JOB NAME="${IPP_USER_NAME}"\n`),
    Buffer.from(`${PJL_UNIVERSAL_EXIT}@PJL\n${settings}@PJL ENTER LANGUAGE = PCL\n\x1bE\x1b&l1X\x1b&l0S`),
    ...pbmPages.map((pbm) => brotherPage(pbm, leftOffsetBytes)),
    Buffer.from(`${PJL_UNIVERSAL_EXIT}@PJL\n@PJL EOJ NAME="${IPP_USER_NAME}"\n${PJL_UNIVERSAL_EXIT}\n`),
  ]);
}

async function pdfToBrotherLaser(pdf: Buffer) {
  return pbmPagesToBrotherLaser(
    await pdfToPageImages(pdf, ["-sDEVICE=pbmraw", `-r${BROTHER_DPI}`]),
    BROTHER_LEFT_OFFSET_BYTES,
  );
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

// The password goes in the arguments because net use with * reads it from the console, never from a piped input
async function runNetUse(printer: TPrinterConnection, sharePath: string) {
  return runProcess(
    "net",
    [
      "use",
      sharePath,
      ...(printer.password === null ? [] : [printer.password]),
      ...(printer.username === null ? [] : [`/user:${printer.username}`]),
    ],
    { timeoutMs: PING_TIMEOUT_MS },
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
