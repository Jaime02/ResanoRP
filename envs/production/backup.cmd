@echo off
setlocal
cd /d "%~dp0"

for /f "usebackq tokens=1,* delims== " %%a in (`findstr /b /c:POSTGRES_ /c:BACKUP_ .env`) do set "%%a=%%~b"
if not defined BACKUP_LOCAL_PATH (echo BACKUP_LOCAL_PATH is missing in .env & exit /b 1)
set "PGPASSWORD=%POSTGRES_PASSWORD%"
set "PATH=%~dp0bin\postgres\bin;%PATH%"

if not exist "%BACKUP_LOCAL_PATH%" mkdir "%BACKUP_LOCAL_PATH%" || exit /b 1
call :backup >> "%BACKUP_LOCAL_PATH%\backup.log" 2>&1
exit /b %errorlevel%

:backup
for /f "tokens=1,2 delims=-" %%a in ('powershell -NoProfile -Command "Get-Date -UFormat %%Y%%m%%d-%%u"') do (
  set "DAY=%%a"
  set "WEEKDAY=%%b"
)
set "BACKUP_PATH=%BACKUP_LOCAL_PATH%\%DAY%"
echo %DATE% %TIME% Backing up to %BACKUP_PATH%
if not exist "%BACKUP_PATH%" mkdir "%BACKUP_PATH%" || exit /b 1

pg_dump -h localhost -p %POSTGRES_PORT% -U %POSTGRES_USER% -d %POSTGRES_DB% -Fc -f "%BACKUP_PATH%\production.dump" || exit /b 1

set "FOLDERS=SELL_ORDERS TAGS DELIVERY_NOTES INVOICES caddy"
rem The task runs at 02:00, so Sunday night is Monday
if "%WEEKDAY%"=="1" set "FOLDERS=%FOLDERS% BLUEPRINTS"
for %%f in (%FOLDERS%) do (
  if exist "%%f" (
    robocopy "%%f" "%BACKUP_PATH%\%%f" /E /R:2 /W:5 /NP /NFL /NDL /NJH /NJS
    if errorlevel 8 exit /b 1
  )
)

rem TODO: copy BACKUP_LOCAL_PATH to another machine (robocopy to a share), a backup on this server alone is lost with its disk
powershell -NoProfile -ExecutionPolicy Bypass -File cleanup-backups.ps1 -Path "%BACKUP_LOCAL_PATH%" || exit /b 1

echo %DATE% %TIME% Done
exit /b 0
