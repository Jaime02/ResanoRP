import { APP_TIME_ZONE } from "@/lib/dates";
import clientLog from "@/logging/clientLog";
import { LoggerLevels } from "@/logging/types";
import { INACTIVE_MATERIAL_DELETED_MESSAGE, INACTIVE_RAW_MATERIAL_DELETED_MESSAGE } from "@/messages/material";

const priceFormatters = new Map<number, Intl.NumberFormat>();

function getPriceFormatter(decimals: number): Intl.NumberFormat {
  let formatter = priceFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("es-ES", {
      currency: "EUR",
      maximumFractionDigits: decimals,
      minimumFractionDigits: Math.min(2, decimals),
      style: "currency",
    });
    priceFormatters.set(decimals, formatter);
  }
  return formatter;
}

export enum DateFormat {
  Date = "date",
  Datetime = "datetime",
}

export function formatPartDimension(part?: { width?: string | null; length?: string | null }): string {
  if (!part) {
    return "";
  }
  return `${part.width ?? ""}${part.length != null ? ` x ${part.length}` : ""}`;
}

export function formatPrice(
  price: number | string | null,
  { replaceNBSP = false, decimals = 3 }: { replaceNBSP?: boolean; decimals?: number } = {},
): string {
  if (price === null) {
    return "";
  }
  const formatted = getPriceFormatter(decimals).format(Number(price));
  return replaceNBSP ? formatted.replace(/\s/g, " ") : formatted;
}

export function maskBankAccount(bankAccount: string): string {
  const characters = bankAccount.replace(/\s/g, "");
  const maskedCharacters = "*".repeat(Math.max(characters.length - 4, 0)) + characters.slice(-4);
  return maskedCharacters.match(/.{1,4}/g)?.join(" ") ?? maskedCharacters;
}

export function formatPricePerKilo(price: number | string | null): string {
  if (price === null) {
    return "";
  }
  return `${formatPrice(price)} / kg`;
}

export function formatDate(dateInput: string | Date | null, format: DateFormat = DateFormat.Date): string | null {
  if (dateInput === null || dateInput === "") {
    return null;
  }

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    void clientLog(LoggerLevels.error, "Invalid date", { dateInput: dateInput.toString() });
    return null;
  }

  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    ...(format === DateFormat.Datetime && { hour: "2-digit", hour12: false, minute: "2-digit" }),
  });
}

export function formatPartUnits(quantity: number): string {
  return `${quantity} ${quantity === 1 ? "unidad" : "unidades"}`;
}

export function formatMaterial({ width, rawMaterialName }: { width: string; rawMaterialName?: string | null }): string {
  return rawMaterialName != null ? `${width} | ${rawMaterialName}` : width;
}

// An inactive Material is still shown where it is already used, but it can no longer be picked
export function formatInactiveMaterialMessage(material: {
  deletedAt: Date | null;
  rawMaterial?: { deletedAt: Date | null } | null;
}): string | null {
  if (material.deletedAt !== null) {
    return INACTIVE_MATERIAL_DELETED_MESSAGE;
  }
  if (material.rawMaterial?.deletedAt != null) {
    return INACTIVE_RAW_MATERIAL_DELETED_MESSAGE;
  }
  return null;
}

export function formatClientError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  if (typeof error === "object" && error !== null) {
    return error as Record<string, unknown>;
  }

  return { message: String(error) };
}
