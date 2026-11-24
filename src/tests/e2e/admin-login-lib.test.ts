import { expect, test } from "@playwright/test";

import {
  AdminLoginResult,
  createAdminLoginThrottle,
  FAILED_LOGINS_WINDOW_MS,
  MAX_FAILED_LOGINS,
} from "@/lib/admin-login";

const IP = "192.168.1.10";
const OTHER_IP = "192.168.1.11";

test("the admin login lock-out", async () => {
  const throttleAdminLogin = createAdminLoginThrottle();
  const failLogins = (ip: string, now: number, count: number) => {
    for (let index = 0; index < count; index++) {
      expect(throttleAdminLogin(ip, now, false)).toBe(AdminLoginResult.WrongPassword);
    }
  };

  await test.step("the wrong passwords are refused, and lock the address once they reach the limit", () => {
    failLogins(IP, 0, MAX_FAILED_LOGINS);
    expect(throttleAdminLogin(IP, 0, false)).toBe(AdminLoginResult.Locked);
  });

  await test.step("while locked, even the right password is refused", () => {
    expect(throttleAdminLogin(IP, FAILED_LOGINS_WINDOW_MS - 1, true)).toBe(AdminLoginResult.Locked);
  });

  await test.step("another address is not locked", () => {
    expect(throttleAdminLogin(OTHER_IP, 0, true)).toBe(AdminLoginResult.Ok);
  });

  await test.step("the lock ends with its window, and the attempts made while locked do not extend it", () => {
    expect(throttleAdminLogin(IP, FAILED_LOGINS_WINDOW_MS, true)).toBe(AdminLoginResult.Ok);
  });

  await test.step("the right password starts the count again", () => {
    failLogins(IP, FAILED_LOGINS_WINDOW_MS, MAX_FAILED_LOGINS - 1);
    expect(throttleAdminLogin(IP, FAILED_LOGINS_WINDOW_MS, true)).toBe(AdminLoginResult.Ok);
    failLogins(IP, FAILED_LOGINS_WINDOW_MS, MAX_FAILED_LOGINS);
    expect(throttleAdminLogin(IP, FAILED_LOGINS_WINDOW_MS, true)).toBe(AdminLoginResult.Locked);
  });

  await test.step("the failures of an earlier window are not counted", () => {
    const now = 10 * FAILED_LOGINS_WINDOW_MS;
    failLogins(OTHER_IP, now, MAX_FAILED_LOGINS - 1);
    failLogins(OTHER_IP, now + FAILED_LOGINS_WINDOW_MS, MAX_FAILED_LOGINS);
    expect(throttleAdminLogin(OTHER_IP, now + FAILED_LOGINS_WINDOW_MS, false)).toBe(AdminLoginResult.Locked);
  });
});
