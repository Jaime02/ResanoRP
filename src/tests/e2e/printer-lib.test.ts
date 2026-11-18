import fs from "node:fs";

import { expect, test } from "@playwright/test";

import { IPP_PORT } from "@/files/printer";
import { formatPrinterAddress } from "@/lib/formatters";
import { BROWSER_PRINTER, getSelectedPrinter } from "@/lib/print";
import { createPrinterSchema, printFileSchema } from "@/schemas/printer";
import { PrinterKind } from "@/types/printer";

const EMPTY_PRINTER = {
  address: "192.168.1.150",
  forTags: false,
  kind: PrinterKind.Ipp,
  labelLengthMm: null,
  labelWidthMm: null,
  name: "Mesa",
  password: null,
  shareName: null,
  username: null,
};

const SHARED_PRINTER = {
  ...EMPTY_PRINTER,
  kind: PrinterKind.BrotherShare,
  password: " secret ",
  shareName: "Albaranes",
  username: "DESKTOP-JFGQ3QH\\impresoras",
};

const SYNC_CONFIG_PATH = "docker/powersync/sync-config.yaml";

test("the printer library", async () => {
  await test.step("an Impresora is reached by a bare IP or host name, trimmed", () => {
    for (const address of ["192.168.1.150", "BRN3C2AF4A121C2", "printer.local", "mesa-valentin"]) {
      expect(createPrinterSchema.parse({ ...EMPTY_PRINTER, address: ` ${address} `, name: " Mesa " })).toEqual({
        ...EMPTY_PRINTER,
        address,
      });
    }
    for (const address of [
      "",
      " ",
      "http://192.168.1.150",
      `192.168.1.150:${IPP_PORT}`,
      "192.168.1.150/ipp/print",
      "\\\\192.168.1.150",
      "mesa valentin",
      "[fe80::1]",
    ]) {
      expect(createPrinterSchema.safeParse({ ...EMPTY_PRINTER, address }).success, address).toBe(false);
    }
  });

  await test.step("a shared Impresora needs its share name, and a label printer its labels", () => {
    // The password keeps its spaces, and an empty one keeps the stored one
    expect(createPrinterSchema.parse(SHARED_PRINTER)).toEqual(SHARED_PRINTER);
    expect(createPrinterSchema.parse({ ...SHARED_PRINTER, password: "", username: " " })).toMatchObject({
      password: null,
      username: null,
    });
    for (const shareName of [null, "", " ", "\\\\192.168.1.128\\Albaranes", "Impresoras/Albaranes"]) {
      expect(createPrinterSchema.safeParse({ ...SHARED_PRINTER, shareName }).success, String(shareName)).toBe(false);
    }

    const labelPrinter = { ...SHARED_PRINTER, kind: PrinterKind.IntermecShare, labelLengthMm: 107, labelWidthMm: 52 };
    expect(createPrinterSchema.safeParse(labelPrinter).success).toBe(true);
    for (const labelSize of [
      { labelWidthMm: null },
      { labelLengthMm: null },
      { labelWidthMm: 0 },
      { labelWidthMm: 5.5 },
    ]) {
      expect(createPrinterSchema.safeParse({ ...labelPrinter, ...labelSize }).success, JSON.stringify(labelSize)).toBe(
        false,
      );
    }
    expect(formatPrinterAddress({ ...SHARED_PRINTER, address: "192.168.1.128" })).toBe("\\\\192.168.1.128\\Albaranes");

    // A label printer on the network has labels but no share
    const networkLabelPrinter = { ...EMPTY_PRINTER, kind: PrinterKind.TscRaw, labelLengthMm: 70, labelWidthMm: 100 };
    expect(createPrinterSchema.parse(networkLabelPrinter)).toEqual(networkLabelPrinter);
    expect(createPrinterSchema.safeParse({ ...networkLabelPrinter, labelLengthMm: null }).success).toBe(false);
    expect(formatPrinterAddress(networkLabelPrinter)).toBe(networkLabelPrinter.address);
    // A printer on the network has neither, so it ignores them
    expect(createPrinterSchema.safeParse({ ...EMPTY_PRINTER, labelWidthMm: null, shareName: null }).success).toBe(true);
  });

  await test.step("the password of an Impresora never syncs to the browsers", () => {
    const printerStream = /\n {2}printer:\n(?: {4}.*\n)+/.exec(fs.readFileSync(SYNC_CONFIG_PATH, "utf8"))?.[0];
    expect(printerStream).toBeDefined();
    expect(printerStream).not.toMatch(/password|\*/i);
  });

  await test.step("the server only prints the files the app serves", () => {
    expect(printFileSchema.safeParse({ filePath: "/api/files/any/1?a=b&c=d%20e", printerId: 1 }).success).toBe(true);
    for (const filePath of [
      "/api/files/../trpc/printer.print",
      "/api/files/delivery-note/..",
      "/api/files/%2e%2e/trpc/printer.print",
      "/api/files/%2E%2E/trpc/printer.print",
      "/api/trpc/printer.print",
      "https://example.com/api/files/delivery-note/1",
      "//example.com/api/files/delivery-note/1",
      "api/files/delivery-note/1",
      "/api/files/delivery-note/1#fragment",
      "/api/files/",
    ]) {
      expect(printFileSchema.safeParse({ filePath, printerId: 1 }).success, filePath).toBe(false);
    }
    expect(printFileSchema.safeParse({ filePath: "/api/files/any/1", printerId: 0 }).success).toBe(false);
  });

  await test.step("no Impresora is selected while they load, then the selected one, the first or the browser", () => {
    const mesa = { id: 1, labelLengthMm: null, labelWidthMm: null, name: "Mesa" };
    const etiquetas = { id: 2, labelLengthMm: 70, labelWidthMm: 100, name: "Etiquetas" };
    const printers = [mesa, etiquetas];

    expect(getSelectedPrinter(printers, true, etiquetas.id)).toBeNull();
    expect(getSelectedPrinter([], true, undefined)).toBeNull();
    expect(getSelectedPrinter([], false, undefined)).toBe(BROWSER_PRINTER);
    expect(getSelectedPrinter(printers, false, undefined)).toBe(mesa);
    expect(getSelectedPrinter(printers, false, etiquetas.id)).toBe(etiquetas);
    expect(getSelectedPrinter(printers, false, BROWSER_PRINTER.id)).toBe(BROWSER_PRINTER);
    // A selected Impresora deleted in another tab
    expect(getSelectedPrinter([etiquetas], false, mesa.id)).toBe(etiquetas);
  });
});
