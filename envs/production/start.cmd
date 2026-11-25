@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1 || (echo Run this as administrator & goto :fail)
sc query ResanoRP-db >nul 2>&1 || (echo ResanoRP is not installed, run install.cmd first & goto :fail)

for /f "usebackq tokens=1,* delims== " %%a in (`findstr /b /c:POSTGRES_ /c:VITE_HOST .env`) do set "%%a=%%~b"
set "PGPASSWORD=%POSTGRES_PASSWORD%"
set "PATH=%~dp0bin\postgres\bin;%PATH%"
set "PSQL=psql -h localhost -p %POSTGRES_PORT% -U %POSTGRES_USER% -v ON_ERROR_STOP=1 -q"

call :start-service ResanoRP-db || goto :fail
call :wait-for-database || goto :fail

if exist import (
  call :import
  if errorlevel 1 goto :fail
)

call :start-service ResanoRP || goto :fail
call :wait-for-app || goto :fail

echo Compacting PowerSync's storage
bin\bun.exe run supervisor.ts compact || echo PowerSync's compaction failed

powershell -NoProfile -ExecutionPolicy Bypass -File trust-cert.ps1 -CertPath caddy\caddy\pki\authorities\local\root.crt -RemoveOtherCaddyRoots
if exist caddy\caddy\pki\authorities\local\root.crt copy /y caddy\caddy\pki\authorities\local\root.crt client\root.crt >nul
echo ResanoRP is running
exit /b 0

:start-service
sc query %1 | find "RUNNING" >nul && exit /b 0
net start %1 >nul || (echo %1 could not be started & exit /b 1)
exit /b 0

:stop-service
sc query %1 | find "STOPPED" >nul && exit /b 0
net stop %1 >nul || (echo %1 could not be stopped & exit /b 1)
exit /b 0

:wait-for-database
for /l %%i in (1,1,60) do (
  pg_isready -h localhost -p %POSTGRES_PORT% >nul 2>&1 && exit /b 0
  timeout /t 1 /nobreak >nul
)
echo The database did not accept connections
exit /b 1

:wait-for-app
for /l %%i in (1,1,120) do (
  curl -s -o nul -m 3 http://127.0.0.1:5173 && exit /b 0
  timeout /t 1 /nobreak >nul
)
echo The app did not answer
exit /b 1

:import
rem A half-copied import would otherwise leave production dropped and empty. Reading it whole also catches a truncated dump
pg_restore -f NUL import\prisma.dump || (echo import\prisma.dump is missing or damaged, production was left as it was & exit /b 1)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "BACKUP_PATH=backups\%%i"
mkdir "%BACKUP_PATH%" || exit /b 1

call :stop-service ResanoRP || exit /b 1

echo Backing up production to %BACKUP_PATH%
pg_dump -h localhost -p %POSTGRES_PORT% -U %POSTGRES_USER% -d %POSTGRES_DB% -Fc -f "%BACKUP_PATH%\production.dump" || exit /b 1

rem Recreating the databases also drops PowerSync's replication slot and storage database, which still hold the replaced rows
%PSQL% -d postgres -c "DROP DATABASE IF EXISTS %POSTGRES_DB% WITH (FORCE)" -c "DROP DATABASE IF EXISTS powersync_storage WITH (FORCE)" -c "CREATE DATABASE %POSTGRES_DB%" || exit /b 1

echo Restoring the prisma database
rem The restore leaves out PowerSync's publication and grants, which init.sql creates first
%PSQL% -d %POSTGRES_DB% -f powersync\init.sql || exit /b 1
pg_restore -h localhost -p %POSTGRES_PORT% -U %POSTGRES_USER% -d %POSTGRES_DB% --no-owner --no-publications --no-privileges import\prisma.dump || exit /b 1

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
