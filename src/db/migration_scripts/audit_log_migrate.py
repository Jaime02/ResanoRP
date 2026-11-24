from .connections import get_postgres_cursor

# APP_TIME_ZONE of src/lib/dates.ts, as the month column is the one of the timestamp in it
APP_TIME_ZONE = "Europe/Madrid"

# Prisma and RAIO keep no log, so each migrated document is a create at its own date. The source takes the place of the
# IP, which tells these rows apart from the ones of the app
LEGACY_AUDIT_LOG_ENTRIES = {
    "Prisma": [
        ("sellOrder.create", "sell_order", "receptionDate"),
        ("deliveryNote.create", "delivery_note", "createdAt"),
        ("invoice.create", "invoice", "createdAt"),
    ],
    "RAIO": [("productionOrder.create", "production_order", "createdAt")],
}


def migrate_audit_log():
    with get_postgres_cursor() as cursor:
        # A refresh keeps the audit log, so the rows of the previous migration would be there twice
        cursor.execute("DELETE FROM audit_log WHERE ip = ANY(%s)", (list(LEGACY_AUDIT_LOG_ENTRIES),))
        for source, entries in LEGACY_AUDIT_LOG_ENTRIES.items():
            for path, table, column in entries:
                cursor.execute(
                    f'INSERT INTO audit_log ("path", "ok", "ip", "resultId", "timestamp", "month") '
                    f'SELECT %s, true, %s, id::text, "{column}", '
                    f"to_char(\"{column}\" AT TIME ZONE %s, 'YYYYMM')::integer FROM {table}",
                    (path, source, APP_TIME_ZONE),
                )
