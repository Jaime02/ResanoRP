// Shared by the mock printer container (src/tests/mock-printer.ts) and the tests, so it only imports Node modules and
// app code that does not need node_modules: the container only mounts src/
import fs from "node:fs";
import path from "node:path";

// Network aliases of the mock printer container in docker/docker-compose.test.yml
export const MOCK_PRINTER_HOST = "mock-printer";
export const MOCK_REJECTING_PRINTER_HOST = "mock-printer-rejecting";
// The .invalid top level domain never resolves (RFC 2606), so it stands in for a printer that is switched off
export const MOCK_OFFLINE_PRINTER_HOST = "mock-printer-offline.invalid";

export interface TPwgRasterPage {
  width: number;
  height: number;
  bitsPerColor: number;
  colorSpace: number;
  resolution: [number, number];
  // In points, 1/72 of an inch
  pageSize: [number, number];
}

export interface TPrintJob {
  host: string;
  attributes: Record<string, string>;
  pages: Array<TPwgRasterPage>;
}

export function getPrintJobsPath() {
  if (process.env.PRINTER_JOBS_PATH === undefined) {
    throw new Error("Environment variable PRINTER_JOBS_PATH is not set");
  }
  return process.env.PRINTER_JOBS_PATH;
}

// File names start with the time they were received, so sorting them keeps the order of the jobs
function readJobFileNames(extension: string) {
  const jobsPath = getPrintJobsPath();
  if (!fs.existsSync(jobsPath)) return [];
  return fs
    .readdirSync(jobsPath)
    .filter((fileName) => fileName.endsWith(extension))
    .sort()
    .map((fileName) => ({ fileName, filePath: path.join(jobsPath, fileName) }));
}

export function readPrintJobs(): Array<TPrintJob> {
  return readJobFileNames(".json").map(({ filePath }) => JSON.parse(fs.readFileSync(filePath, "utf8")) as TPrintJob);
}

// Saved by the raw port of the mock printer as <time>-<count>.raw, byte for byte
export const RAW_JOB_EXTENSION = ".raw";

export function readRawJobs(): Array<Buffer> {
  return readJobFileNames(RAW_JOB_EXTENSION).map(({ filePath }) => fs.readFileSync(filePath));
}

export interface TTsplLabel {
  size: string;
  bytesPerRow: number;
  height: number;
}

// The 1-bit bitmap of each label of a TSPL job, whose data must be exactly as long as its header says
export function parseTsplJob(data: Buffer): Array<TTsplLabel> {
  const text = data.toString("latin1");
  const size = /^SIZE ([^\r\n]+)\r\n/.exec(text);
  if (size === null) throw new Error("The job does not start with the size of its labels");
  const labels: Array<TTsplLabel> = [];
  const bitmapPattern = /CLS\r\nBITMAP 0,0,(\d+),(\d+),0,/y;
  let offset = size[0].length;
  while (offset < text.length) {
    bitmapPattern.lastIndex = offset;
    const bitmap = bitmapPattern.exec(text);
    if (bitmap === null) throw new Error(`The job has no label at byte ${offset}`);
    const [header, bytesPerRow, height] = bitmap;
    offset += header.length + Number(bytesPerRow) * Number(height);
    const footer = "\r\nPRINT 1,1\r\n";
    if (text.slice(offset, offset + footer.length) !== footer) throw new Error(`The label at ${offset} is not printed`);
    offset += footer.length;
    labels.push({ bytesPerRow: Number(bytesPerRow), height: Number(height), size: size[1] });
  }
  return labels;
}

// Only the files are removed: the folder is mounted in the mock printer containers, which would lose it
export function clearPrintJobs() {
  for (const { filePath } of [
    ...readJobFileNames(".json"),
    ...readJobFileNames(".prn"),
    ...readJobFileNames(RAW_JOB_EXTENSION),
  ]) {
    fs.rmSync(filePath, { force: true });
  }
}

// The mock Windows printer share, see src/tests/mock-printer-share/
export const MOCK_PRINTER_SHARE_HOST = "mock-printer-share";
export const MOCK_LABELS_SHARE_NAME = "labels";
export const MOCK_LASER_SHARE_NAME = "laser";

export function getMockPrinterShareCredentials() {
  const { MOCK_PRINTER_SHARE_USERNAME: username, MOCK_PRINTER_SHARE_PASSWORD: password } = process.env;
  if (username === undefined || password === undefined) {
    throw new Error("Environment variables MOCK_PRINTER_SHARE_USERNAME and MOCK_PRINTER_SHARE_PASSWORD are not set");
  }
  return { password, username };
}

export interface TShareJob {
  shareName: string;
  data: Buffer;
}

// Saved by the share as <time>-<share>.prn
export function readShareJobs(): Array<TShareJob> {
  return readJobFileNames(".prn").map(({ fileName, filePath }) => ({
    data: fs.readFileSync(filePath),
    shareName: fileName.slice(fileName.indexOf("-") + 1, -".prn".length),
  }));
}

export interface TIntermecLabel {
  imageName: string;
  width: number;
  height: number;
  dpi: number;
}

// The 1-bit .PCX image of each label of a Direct Protocol job, which must keep the exact framing the printer accepts
export function parseIntermecDirectProtocolJob(data: Buffer): Array<TIntermecLabel> {
  const text = data.toString("latin1");
  const labels: Array<TIntermecLabel> = [];
  const imageLoadPattern = /CLL\r\nIMAGE LOAD "([^"]+)",(\d+),""\r/y;
  let offset = 0;
  while (offset < text.length) {
    imageLoadPattern.lastIndex = offset;
    const imageLoad = imageLoadPattern.exec(text);
    if (imageLoad === null) throw new Error(`The job has no label at byte ${offset}`);
    const [header, imageName, imageSize] = imageLoad;
    const pcx = data.subarray(offset + header.length, offset + header.length + Number(imageSize));
    const PCX_MANUFACTURER = 10;
    if (pcx[0] !== PCX_MANUFACTURER || pcx[3] !== 1) throw new Error(`The image of ${imageName} is not a 1-bit PCX`);
    labels.push({
      dpi: pcx.readUInt16LE(12),
      height: pcx.readUInt16LE(10) - pcx.readUInt16LE(6) + 1,
      imageName,
      width: pcx.readUInt16LE(8) - pcx.readUInt16LE(4) + 1,
    });
    const footer = `\r\nPP 0,0\r\nPM "${imageName}"\r\nPF\r\nREMOVE IMAGE "${imageName}"\r\nCLL\r\n`;
    offset += header.length + pcx.length;
    if (text.slice(offset, offset + footer.length) !== footer) throw new Error(`${imageName} is not printed after it`);
    offset += footer.length;
  }
  return labels;
}

// The settings of the PJL header brlaser writes before the pages, like PAPER or RESOLUTION
export function parseBrotherJobSettings(data: Buffer): Record<string, string> {
  return Object.fromEntries(
    [...data.toString("latin1").matchAll(/@PJL SET (\w+) = ([^\r\n]*)/g)].map(([, name, value]) => [name, value]),
  );
}

const PWG_SYNC_WORD = "RaS2";
const PWG_PAGE_HEADER_BYTES = 1796;
// A count byte of 128 leaves the rest of the line blank, as the CUPS raster reader does
const PWG_BLANK_REST_OF_LINE = 128;

// Offsets of the fields of a PWG raster page header (PWG 5102.4), all big endian 32-bit integers
const PWG_HEADER_OFFSETS = {
  bitsPerColor: 384,
  bitsPerPixel: 388,
  bytesPerLine: 392,
  colorSpace: 400,
  height: 376,
  pageSizeHeight: 356,
  pageSizeWidth: 352,
  resolutionX: 276,
  resolutionY: 280,
  width: 372,
};

function readByte(raster: Buffer, offset: number) {
  if (offset >= raster.length) throw new Error(`The PWG raster ends in the middle of a page, at byte ${offset}`);
  return raster[offset];
}

// Decodes the compressed lines only to find where each page ends, so the pages can be counted and checked
export function parsePwgRaster(raster: Buffer): Array<TPwgRasterPage> {
  if (raster.toString("ascii", 0, PWG_SYNC_WORD.length) !== PWG_SYNC_WORD) {
    throw new Error("The document is not a PWG raster");
  }
  const pages: Array<TPwgRasterPage> = [];
  let offset = PWG_SYNC_WORD.length;
  while (offset < raster.length) {
    const header = raster.subarray(offset, offset + PWG_PAGE_HEADER_BYTES);
    if (header.length < PWG_PAGE_HEADER_BYTES) throw new Error("The PWG raster ends in the middle of a page header");
    offset += PWG_PAGE_HEADER_BYTES;
    const read = (field: keyof typeof PWG_HEADER_OFFSETS) => header.readUInt32BE(PWG_HEADER_OFFSETS[field]);
    const bytesPerPixel = Math.ceil(read("bitsPerPixel") / 8);
    const bytesPerLine = read("bytesPerLine");

    for (let line = 0; line < read("height");) {
      line += readByte(raster, offset++) + 1;
      for (let lineBytes = 0; lineBytes < bytesPerLine;) {
        const count = readByte(raster, offset++);
        if (count === PWG_BLANK_REST_OF_LINE) {
          lineBytes = bytesPerLine;
        } else if (count < PWG_BLANK_REST_OF_LINE) {
          offset += bytesPerPixel;
          lineBytes += (count + 1) * bytesPerPixel;
        } else {
          const literalBytes = (257 - count) * bytesPerPixel;
          offset += literalBytes;
          lineBytes += literalBytes;
        }
      }
    }

    pages.push({
      bitsPerColor: read("bitsPerColor"),
      colorSpace: read("colorSpace"),
      height: read("height"),
      pageSize: [read("pageSizeWidth"), read("pageSizeHeight")],
      resolution: [read("resolutionX"), read("resolutionY")],
      width: read("width"),
    });
  }
  if (offset !== raster.length) throw new Error("The PWG raster has bytes past its last page");
  return pages;
}
