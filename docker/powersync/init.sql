-- Runs on every start, so a database restored or recreated without these objects gets them back
SELECT 'CREATE DATABASE powersync_storage'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'powersync_storage')\gexec

-- For all tables, so dropping and recreating the schema (src/scripts/reset-env.ts) keeps every table published
SELECT 'CREATE PUBLICATION powersync FOR ALL TABLES'
WHERE NOT EXISTS (SELECT FROM pg_publication WHERE pubname = 'powersync')\gexec
