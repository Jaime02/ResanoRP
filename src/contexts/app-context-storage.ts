import { z } from "zod";

import log from "@/logging/log";
import { LogMessages, LoggerLevels } from "@/logging/types";

// Kept apart from the app context: log reads its cookie name, and the context pulls in
// every PowerSync collection, so leaving the class there made anything that logs - server side code
// included - open the whole client data layer.
export enum UserMode {
  Machine = "Máquina",
  User = "Usuario",
  Admin = "Administrador",
}

const cookieSchema = z.object({
  // A cookie from an older version can hold a user mode that no longer exists
  userMode: z.enum(UserMode).optional().catch(undefined),
  userModeMachineId: z.int().optional().catch(undefined),
});

// Stored in a cookie rather than localStorage so the server renders the page for the right user mode
export class AppContextStorage {
  public static COOKIE_NAME = "ResanoRP";
  // Browsers cap a cookie's lifetime at 400 days
  public static COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
  private static readonly listeners = new Set<() => void>();
  // Cookies raise no event when another tab changes them
  private static channel?: BroadcastChannel;
  private static cachedSnapshot: AppContextStorage | null = null;
  private static cachedRaw: string | undefined;

  constructor(
    public userMode?: UserMode,
    public userModeMachineId?: number,
  ) {}

  static readCookie(): string | undefined {
    const prefix = `${this.COOKIE_NAME}=`;
    const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(prefix));
    return cookie === undefined ? undefined : decodeURIComponent(cookie.slice(prefix.length));
  }

  static parse(raw: string | undefined): AppContextStorage {
    // The snapshot must be referentially stable for the same raw content, otherwise its consumers
    // re-render forever.
    if (this.cachedSnapshot !== null && raw === this.cachedRaw) {
      return this.cachedSnapshot;
    }
    this.cachedRaw = raw;

    let parsed: z.infer<typeof cookieSchema> | undefined;
    let parseError: unknown;
    try {
      parsed = cookieSchema.parse(raw !== undefined ? JSON.parse(raw) : {});
    } catch (error) {
      parseError = error;
    }

    this.cachedSnapshot = new AppContextStorage(parsed?.userMode, parsed?.userModeMachineId);

    if (parsed === undefined) {
      void log(LoggerLevels.error, LogMessages.appContextStorageParseFailed, {
        cookieContent: raw,
        error: parseError,
      });
    }

    return this.cachedSnapshot;
  }

  static load(): AppContextStorage {
    return this.parse(typeof document === "undefined" ? undefined : this.readCookie());
  }

  static subscribe(listener: () => void) {
    this.channel ??= new BroadcastChannel(this.COOKIE_NAME);
    const channel = this.channel;
    this.listeners.add(listener);
    channel.addEventListener("message", listener);
    return () => {
      this.listeners.delete(listener);
      channel.removeEventListener("message", listener);
    };
  }

  static notify() {
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  save() {
    document.cookie = `${AppContextStorage.COOKIE_NAME}=${encodeURIComponent(this.toJSON())}; path=/; max-age=${AppContextStorage.COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    AppContextStorage.notify();
    AppContextStorage.channel?.postMessage(null);
  }

  static testCookie(url: string, mode: UserMode, machineId?: number) {
    return {
      name: this.COOKIE_NAME,
      value: encodeURIComponent(new AppContextStorage(mode, machineId).toJSON()),
      url,
    };
  }

  toObject() {
    return {
      userMode: this.userMode,
      userModeMachineId: this.userModeMachineId,
    };
  }

  toJSON(): string {
    return JSON.stringify(this.toObject());
  }
}
