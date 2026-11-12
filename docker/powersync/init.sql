-- Runs on every start, so a database restored or recreated without these objects gets them back
SELECT 'CREATE DATABASE powersync_storage'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'powersync_storage')\gexec

-- For all tables, so dropping and recreating the schema (src/scripts/reset-env.ts) keeps every table published
SELECT 'CREATE PUBLICATION powersync FOR ALL TABLES'
WHERE NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'powersync')\gexec

-- Replication reads as its own role instead of the superuser. Streams decide what syncs, so it bypasses RLS
SELECT 'CREATE ROLE powersync_role WITH LOGIN REPLICATION BYPASSRLS'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'powersync_role')\gexec
-- The superuser's password, which the compose files also give PowerSync for this role
\getenv powersync_password PGPASSWORD
ALTER ROLE powersync_role WITH PASSWORD :'powersync_password';
GRANT USAGE ON SCHEMA public TO powersync_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
-- Not limited to the public schema: reset-env.ts drops and recreates it, which would drop those defaults with it
ALTER DEFAULT PRIVILEGES GRANT USAGE ON SCHEMAS TO powersync_role;
ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO powersync_role;
