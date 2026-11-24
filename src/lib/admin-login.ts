export const MAX_FAILED_LOGINS = 5;
export const FAILED_LOGINS_WINDOW_MS = 60_000;

export enum AdminLoginResult {
  Ok = "ok",
  WrongPassword = "wrong-password",
  Locked = "locked",
}

// After MAX_FAILED_LOGINS wrong passwords from one address, every login from it is refused, even with the right
// password, until its window ends
// shortcut: counted in the memory of this process, so a restart clears it; move to the database if the server is ever replicated
export function createAdminLoginThrottle() {
  const failedLogins = new Map<string, { count: number; windowEndsAt: number }>();

  return (ip: string, now: number, isPasswordRight: boolean) => {
    // Each address that failed stays only for its window, so the addresses never pile up
    for (const [address, failedLogin] of failedLogins) {
      if (failedLogin.windowEndsAt <= now) failedLogins.delete(address);
    }
    const failedLogin = failedLogins.get(ip) ?? { count: 0, windowEndsAt: now + FAILED_LOGINS_WINDOW_MS };
    if (failedLogin.count >= MAX_FAILED_LOGINS) return AdminLoginResult.Locked;
    if (!isPasswordRight) {
      failedLogins.set(ip, { ...failedLogin, count: failedLogin.count + 1 });
      return AdminLoginResult.WrongPassword;
    }
    failedLogins.delete(ip);
    return AdminLoginResult.Ok;
  };
}
