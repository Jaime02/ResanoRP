import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { removeOnRollback } from "@/files/functions";
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
});
