@echo off
setlocal
cd /d "%~dp0"

docker info >nul 2>&1 || (echo Docker Desktop is not running, start it and try again & goto :fail)

if exist images.tar (
  echo Loading images
  docker load -i images.tar || goto :fail
)

docker image inspect resanorp-app:production >nul 2>&1 || (echo The app image is missing: run "bun run prepare-production" on the development machine and copy this folder again & goto :fail)

if exist import (
  call :import
  if errorlevel 1 goto :fail
)

docker compose up -V -d --wait || goto :fail
powershell -NoProfile -ExecutionPolicy Bypass -File trust-cert.ps1 -CertPath caddy\caddy\pki\authorities\local\root.crt -RemoveOtherCaddyRoots
if exist caddy\caddy\pki\authorities\local\root.crt copy /y caddy\caddy\pki\authorities\local\root.crt client\root.crt >nul
echo ResanoRP is running
exit /b 0

:import
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "BACKUP_PATH=backups\%%i"
mkdir "%BACKUP_PATH%" || exit /b 1

echo Backing up production to %BACKUP_PATH%
docker compose up -d --wait db || exit /b 1
docker compose exec -T db sh -c "pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -Fc -f /tmp/backup.dump" || exit /b 1
docker compose cp db:/tmp/backup.dump "%BACKUP_PATH%\production.dump" || exit /b 1

rem Recreating the volume also drops PowerSync's replication slot and storage database, which still hold the replaced rows
docker compose down -v || exit /b 1

echo Restoring the prisma database
docker compose up -d --wait db || exit /b 1
docker compose cp import\prisma.dump db:/tmp/prisma.dump || exit /b 1
docker compose exec -T db sh -c "pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --no-owner /tmp/prisma.dump" || exit /b 1

for %%f in (BLUEPRINTS SELL_ORDERS TAGS DELIVERY_NOTES INVOICES) do (
  if exist "import\%%f" (
    if exist "%%f" move "%%f" "%BACKUP_PATH%\%%f" >nul || exit /b 1
    move "import\%%f" "%%f" >nul || exit /b 1
  )
)

rmdir /s /q import
exit /b 0

:fail
echo Failed to start ResanoRP
pause
exit /b 1
