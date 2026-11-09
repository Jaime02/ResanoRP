import fs from "node:fs";
import promises from "node:fs/promises";
import path from "node:path";

import { findFolderById, renameFile } from "@/files/functions";
import logger from "@/logging/logger";
import { LogMessages } from "@/logging/types";
import { dateToFileName } from "@/schemas/utils";
import type { BaseBlueprint } from "@/types/blueprint";

function getBlueprintRootPath() {
  if (process.env.BLUEPRINT_ROOT_PATH === undefined) {
    throw new Error("Environment variable BLUEPRINT_ROOT_PATH is not set");
  }
  const blueprintRootPath = path.resolve(process.env.BLUEPRINT_ROOT_PATH);
  if (!fs.existsSync(blueprintRootPath)) {
    fs.mkdirSync(blueprintRootPath, { recursive: true });
  }
  return blueprintRootPath;
}

export async function getBlueprintPath({
  partId,
  fileName,
  checkIfFileExists = false,
  createFoldersIfNotExist = false,
  logErrors = true,
}: {
  partId: number;
  fileName: string;
  checkIfFileExists?: boolean;
  createFoldersIfNotExist?: boolean;
  logErrors?: boolean;
}): Promise<string | null> {
  const blueprintDir = getBlueprintRootPath();

  let partFolder = await findFolderById(blueprintDir, partId);
  if (partFolder == null && !createFoldersIfNotExist) {
    if (logErrors) {
      logger.error(LogMessages.partFolderNotFound, { fileName, partId });
    }
    return null;
  } else if (partFolder == null) {
    partFolder = path.join(blueprintDir, String(partId));
    await promises.mkdir(partFolder, { recursive: true });
  }

  const blueprintPath = path.join(partFolder, `${fileName}.pdf`);

  if (checkIfFileExists) {
    try {
      await promises.access(blueprintPath);
    } catch {
      if (logErrors) {
        logger.error(LogMessages.blueprintFileNotFound, { blueprintPath, fileName, partId });
      }
      return null;
    }
  }

  return blueprintPath;
}

// Every file is found before any is renamed, so a missing one leaves the others untouched. The missing Plano is
// returned so the caller can report it.
export async function archiveBlueprintFiles(blueprints: Array<BaseBlueprint>): Promise<BaseBlueprint | undefined> {
  const filePaths = await Promise.all(
    blueprints.map(async (blueprint) => getBlueprintPath({ ...blueprint, checkIfFileExists: true })),
  );
  const missingFileIndex = filePaths.indexOf(null);
  if (missingFileIndex !== -1) {
    return blueprints[missingFileIndex];
  }

  const deletedAt = dateToFileName(new Date());
  await Promise.all(
    blueprints.map(async (blueprint, i) =>
      renameFile({ filePath: filePaths[i]!, newFileName: `DELETED_${deletedAt}_${blueprint.fileName}.pdf` }),
    ),
  );
  return undefined;
}
