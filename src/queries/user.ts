import { eq, ilike, useLiveQuery } from "@tanstack/react-db";

import userCollection from "@/collections/user";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TUserFilters } from "@/schemas/user";
import { getFilterValue } from "@/schemas/utils";

export function useQueryUsers(filters?: TUserFilters) {
  return useLiveQuery({
    queryKey: ["users", filters],
    query: (q) => {
      let query = q.from({ user: userCollection });
      const ip = getFilterValue(filters, "ip");
      if (ip != null) {
        query = query.where(({ user }) => ilike(user.ip, `%${ip}%`));
      }
      const name = getFilterValue(filters, "name");
      if (name != null) {
        query = query.fn.where(({ user }) => includesIgnoringAccents(user.name, name));
      }
      return query.orderBy(({ user }) => user.name, "asc");
    },
  });
}

export function useQueryUserById(id?: number) {
  return useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ user: userCollection })
      .where(({ user }) => eq(user.id, id))
      .findOne();
  });
}

export function useQueryUserByIp(ip: string | undefined) {
  return useLiveQuery((q) => {
    if (ip === undefined) {
      return undefined;
    }
    return q
      .from({ user: userCollection })
      .where(({ user }) => eq(user.ip, ip))
      .findOne();
  });
}
