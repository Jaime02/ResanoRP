import fs from "node:fs/promises";
import path from "node:path";

import logger from "@/logging/logger";

export async function renameFile({ filePath, newFileName }: { filePath: string; newFileName: string }) {
  await fs.rename(filePath, path.join(path.dirname(filePath), newFileName));
}

// A rolled back transaction leaves behind the files written during it, so run removes the paths it pushes on failure
export async function removeOnRollback<T>(run: (createdPaths: Array<string>) => Promise<T>): Promise<T> {
  const createdPaths: Array<string> = [];
  try {
    return await run(createdPaths);
  } catch (error) {
    for (const createdPath of [...createdPaths].reverse()) {
      await fs
        .rm(createdPath, { force: true, recursive: true })
        .catch((rmError: unknown) => logger.error("Error al eliminar el archivo", { createdPath, rmError }));
    }
    throw error;
  }
}

export async function saveUpload({ fileUpload, location }: { fileUpload: File; location: string }) {
  try {
    const arrayBuffer = await fileUpload.arrayBuffer();
    await fs.writeFile(location, Buffer.from(arrayBuffer));

    logger.info(`Archivo guardado en ${location}`);
  } catch (error) {
    logger.error("Error al guardar el archivo", error);
    throw error;
  }
}

export async function findFolderById(baseDir: string, id: number): Promise<string | null> {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const match = /^(\d+)\b/.exec(entry.name);
    if (match && Number(match[1]) === id) {
      return path.join(baseDir, entry.name);
    }
  }
  return null;
}
