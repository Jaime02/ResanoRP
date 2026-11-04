import * as fs from "node:fs";
import promises from "node:fs/promises";
import path from "node:path";

import type { TDatabase } from "@/db";
import db from "@/db";
import { getClientById } from "@/db/functions/client";
import { findFolderById } from "@/files/functions";
import logger from "@/logging/logger";
import { sanitizePath } from "@/schemas/utils";

export function getSellOrderRootPath() {
  if (process.env.SELL_ORDER_ROOT_PATH === undefined) {
    throw new Error("Environment variable SELL_ORDER_ROOT_PATH is not set");
  }
  const sellOrderDir = path.resolve(process.env.SELL_ORDER_ROOT_PATH);
  if (!fs.existsSync(sellOrderDir)) {
    fs.mkdirSync(sellOrderDir, { recursive: true });
  }
  return sellOrderDir;
}

export function createClientFolder(client: { id: number; name: string }) {
  const sanitizedName = sanitizePath(client.name);
  const clientFolder = path.join(
    getSellOrderRootPath(),
    sanitizedName !== null ? `${client.id} - ${sanitizedName}` : `${client.id}`,
  );
  fs.mkdirSync(clientFolder, { recursive: true });
  return clientFolder;
}

export async function getSellOrderPath(
  {
    clientId,
    sellOrderId,
    checkIfFileExists = false,
    createFoldersIfNotExist = false,
    logErrors = true,
  }: {
    clientId?: number;
    sellOrderId: number;
    checkIfFileExists?: boolean;
    createFoldersIfNotExist?: boolean;
    logErrors?: boolean;
  },
  dbConnection: TDatabase = db,
): Promise<string | null> {
  const sellOrderDir = getSellOrderRootPath();

  clientId ??= (
    await dbConnection.query.dbTableSellOrder.findFirst({
      columns: { clientId: true },
      where: { id: sellOrderId },
    })
  )?.clientId;

  if (clientId === undefined) {
    if (logErrors) {
      logger.error("Failed to retrieve clientId for sell order", { sellOrderId });
    }
    return null;
  }

  let clientFolder = await findFolderById(sellOrderDir, clientId);
  if (clientFolder === null && createFoldersIfNotExist) {
    // Clients inserted outside the app, as the migrated ones, never got their folder from client.create
    const client = await getClientById(clientId, dbConnection);
    if (client !== undefined) {
      clientFolder = createClientFolder(client);
    }
  }
  if (clientFolder === null) {
    if (logErrors) {
      logger.error("Client folder does not exist", { clientId, sellOrderId });
    }
    return null;
  }

  const sellOrderPath = path.join(clientFolder, `${sellOrderId}.pdf`);

  if (checkIfFileExists) {
    try {
      await promises.access(sellOrderPath);
    } catch {
      if (logErrors) {
        logger.error("Sell order file does not exist", { clientId, sellOrderId, sellOrderPath });
      }
      return null;
    }
  }

  return sellOrderPath;
}
