import { eq, ilike, materialize, useLiveQuery, isNull } from "@tanstack/react-db";

import clientCollection from "@/collections/client";
import clientInvoiceEmailCollection from "@/collections/client-invoice-email";
import { includesIgnoringAccents } from "@/lib/utils";
import type { TSort } from "@/schemas";
import type { TClientFilters } from "@/schemas/client";
import { getFilterValue } from "@/schemas/utils";
import type { TBaseQueryProps } from "@/types";

const DEFAULT_SORTING: Array<TSort> = [{ id: "id", desc: false }];

export function useQueryClients({ filters, sorts }: TBaseQueryProps<TClientFilters> = {}) {
  return useLiveQuery({
    queryKey: ["clients", filters, sorts],
    query: (q) => {
      let query = q.from({ client: clientCollection });
      const city = getFilterValue(filters, "city");
      if (city != null) {
        query = query.fn.where(({ client }) => includesIgnoringAccents(client.city, city));
      }
      if (getFilterValue(filters, "deletedAt") !== true) {
        query = query.where(({ client }) => isNull(client.deletedAt));
      }
      if (getFilterValue(filters, "invoiceEmail") != null) {
        query = query
          .innerJoin({ clientInvoiceEmail: clientInvoiceEmailCollection }, ({ clientInvoiceEmail, client }) =>
            eq(clientInvoiceEmail.clientId, client.id),
          )
          .where(({ clientInvoiceEmail }) =>
            ilike(clientInvoiceEmail.email, `%${getFilterValue(filters, "invoiceEmail")}%`),
          );
      }
      const name = getFilterValue(filters, "name");
      if (name != null) {
        query = query.fn.where(({ client }) => includesIgnoringAccents(client.name, name));
      }
      if (getFilterValue(filters, "phone") != null) {
        query = query.where(({ client }) => ilike(client.phone, `%${getFilterValue(filters, "phone")}%`));
      }
      if (getFilterValue(filters, "taxId") != null) {
        query = query.where(({ client }) => ilike(client.taxId, `%${getFilterValue(filters, "taxId")}%`));
      }

      for (const sort of sorts ?? DEFAULT_SORTING) {
        query = query.orderBy(({ client }) => client[sort.id as keyof typeof client], sort.desc ? "desc" : "asc");
      }

      return query
        .select(({ client }) => ({
          ...client,
          invoiceEmails: materialize(
            q
              .from({ invoiceEmail: clientInvoiceEmailCollection })
              .where(({ invoiceEmail }) => eq(invoiceEmail.clientId, client.id)),
          ),
        }))
        .distinct();
    },
  });
}

export function useQueryClientDefaultDeliveryMethod(id: number | null) {
  return useLiveQuery((q) => {
    if (id === null) {
      return undefined;
    }
    return q
      .from({ client: clientCollection })
      .where(({ client }) => eq(client.id, id))
      .select(({ client }) => ({
        id: client.defaultDeliveryMethodId,
      }))
      .findOne();
  });
}

export function useQueryClientDefaultPaymentMethod(id: number | null) {
  return useLiveQuery((q) => {
    if (id === null) {
      return undefined;
    }
    return q
      .from({ client: clientCollection })
      .where(({ client }) => eq(client.id, id))
      .select(({ client }) => ({
        id: client.defaultPaymentMethodId,
      }))
      .findOne();
  });
}

export function useQueryClientById(id?: number) {
  return useLiveQuery((q) => {
    if (id === undefined) {
      return undefined;
    }
    return q
      .from({ client: clientCollection })
      .where(({ client }) => eq(client.id, id))
      .select(({ client }) => ({
        ...client,
        invoiceEmails: materialize(
          q
            .from({ invoiceEmail: clientInvoiceEmailCollection })
            .where(({ invoiceEmail }) => eq(invoiceEmail.clientId, client.id)),
        ),
      }))
      .findOne();
  });
}
