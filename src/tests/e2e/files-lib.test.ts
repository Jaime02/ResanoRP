import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { removeOnRollback } from "@/files/functions";
import { pdfFileResponse } from "@/lib/responses";
import { fileNameSchema } from "@/schemas";

test("the files library", async () => {
  await test.step("a failed mutation removes the files it wrote, and a successful one keeps them", async () => {
    const rootFolder = fs.mkdtempSync(path.join(os.tmpdir(), "remove-on-rollback-"));
    const existingFile = path.join(rootFolder, "existing.pdf");
    fs.writeFileSync(existingFile, "");
    const writeFolderWithFile = (createdPaths: Array<string>, folderName: string) => {
      const folder = path.join(rootFolder, folderName);
      fs.mkdirSync(folder);
      createdPaths.push(folder);
      const file = path.join(folder, "blueprint.pdf");
      createdPaths.push(file);
      fs.writeFileSync(file, "");
      return folder;
    };

    let failedFolder: string | undefined;
    await expect(
      removeOnRollback(async (createdPaths) => {
        failedFolder = writeFolderWithFile(createdPaths, "failed");
        throw new Error("Rolled back");
      }),
    ).rejects.toThrow("Rolled back");
    expect(fs.existsSync(failedFolder!)).toBe(false);
    expect(fs.existsSync(existingFile)).toBe(true);

    const savedFolder = await removeOnRollback(async (createdPaths) => writeFolderWithFile(createdPaths, "saved"));
    expect(fs.existsSync(path.join(savedFolder, "blueprint.pdf"))).toBe(true);

    fs.rmSync(rootFolder, { force: true, recursive: true });
  });

  await test.step("a file name is saved without its .pdf extension, which the file gets anyway", () => {
    expect(fileNameSchema.parse("Blueprint.pdf")).toBe("Blueprint");
    expect(fileNameSchema.parse("Blueprint.PDF.pdf ")).toBe("Blueprint");
    expect(fileNameSchema.parse("Ø64,5x38.pdf")).toBe("Ø64,5x38");
    expect(fileNameSchema.safeParse(".pdf").success).toBe(false);
  });

  await test.step("a file name fits in the 255 bytes of a file system name together with its extension", () => {
    expect(fileNameSchema.safeParse("a".repeat(251)).success).toBe(true);
    expect(fileNameSchema.safeParse("a".repeat(252)).success).toBe(false);
    // Ø takes 2 bytes
    expect(fileNameSchema.safeParse("Ø".repeat(125)).success).toBe(true);
    expect(fileNameSchema.safeParse("Ø".repeat(126)).success).toBe(false);
  });

  await test.step("a PDF is served with a version tag, answers 304 while the file is the same and is served again once it changes", async () => {
    const rootFolder = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-file-response-"));
    const pdfPath = path.join(rootFolder, "file.pdf");
    const contentDisposition = 'inline; filename="file.pdf"';
    const getPdf = async (ifNoneMatch?: string) =>
      pdfFileResponse(
        new Request(
          "http://localhost/file",
          ifNoneMatch === undefined ? {} : { headers: { "If-None-Match": ifNoneMatch } },
        ),
        pdfPath,
        contentDisposition,
      );

    fs.writeFileSync(pdfPath, "first");
    const first = await getPdf();
    const firstEtag = first.headers.get("ETag")!;
    expect(first.status).toBe(200);
    expect(firstEtag).toBeTruthy();
    expect(first.headers.get("Content-Type")).toBe("application/pdf");
    expect(first.headers.get("Content-Disposition")).toBe(contentDisposition);
    expect(first.headers.get("Accept-Ranges")).toBeNull();
    expect(await first.text()).toBe("first");

    const notModified = await getPdf(firstEtag);
    expect(notModified.status).toBe(304);
    expect(notModified.headers.get("ETag")).toBe(firstEtag);
    expect(await notModified.text()).toBe("");
    expect((await getPdf(`"other", ${firstEtag}`)).status).toBe(304);
    expect((await getPdf('"other"')).status).toBe(200);

    fs.writeFileSync(pdfPath, "second, longer");
    const changed = await getPdf(firstEtag);
    expect(changed.status).toBe(200);
    expect(changed.headers.get("ETag")).not.toBe(firstEtag);
    expect(await changed.text()).toBe("second, longer");

    const changedEtag = changed.headers.get("ETag")!;
    const now = Date.now() / 1000;
    fs.utimesSync(pdfPath, now + 60, now + 60);
    expect((await getPdf(changedEtag)).status).toBe(200);

    fs.rmSync(pdfPath);
    await expect(getPdf()).rejects.toThrow();
    fs.rmSync(rootFolder, { force: true, recursive: true });
  });
});
