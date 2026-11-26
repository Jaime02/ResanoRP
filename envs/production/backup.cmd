@echo off
setlocal
cd /d "%~dp0"

for /f "usebackq tokens=1,* delims== " %%a in (`findstr /b /c:POSTGRES_ /c:BACKUP_ .env`) do set "%%a=%%~b"
if not defined BACKUP_LOCAL_PATH (echo BACKUP_LOCAL_PATH is missing in .env & exit /b 1)
set "PGPASSWORD=%POSTGRES_PASSWORD%"
set "PATH=%~dp0bin\postgres\bin;%PATH%"

if not exist "%BACKUP_LOCAL_PATH%" mkdir "%BACKUP_LOCAL_PATH%" || exit /b 1
set "LOG=%BACKUP_LOCAL_PATH%\backup.log"
rem Over 1 MB the log starts again, keeping the previous one as backup.old.log
if exist "%LOG%" for %%l in ("%LOG%") do if %%~zl gtr 1048576 move /y "%LOG%" "%BACKUP_LOCAL_PATH%\backup.old.log" >nul
call :backup >> "%LOG%" 2>&1
exit /b %errorlevel%

:backup
for /f "tokens=1,2 delims=-" %%a in ('powershell -NoProfile -Command "Get-Date -UFormat %%Y%%m%%d-%%u"') do (
  set "DAY=%%a"
  set "WEEKDAY=%%b"
)
set "BACKUP_PATH=%BACKUP_LOCAL_PATH%\%DAY%"
rem Written apart and swapped in once complete, so a failed run, like a second one the same day, leaves the backup
rem already there as it was. A half-written folder would look complete to the cleanup and to restore.cmd
set "PARTIAL_PATH=%BACKUP_PATH%.partial"
set "REPLACED_PATH=%BACKUP_PATH%.replaced"
echo %DATE% %TIME% Backing up to %BACKUP_PATH%
rem A run stopped between its two renames left the day's backup as .replaced
if exist "%REPLACED_PATH%" if not exist "%BACKUP_PATH%" ren "%REPLACED_PATH%" "%DAY%" || exit /b 1
for %%p in ("%PARTIAL_PATH%" "%REPLACED_PATH%") do if exist "%%~p" rmdir /s /q "%%~p"
mkdir "%PARTIAL_PATH%" || exit /b 1

call :copy || (
  rmdir /s /q "%PARTIAL_PATH%"
  echo %DATE% %TIME% Failed, %BACKUP_PATH% left as it was
  exit /b 1
)
if exist "%BACKUP_PATH%" ren "%BACKUP_PATH%" "%DAY%.replaced" || exit /b 1
ren "%PARTIAL_PATH%" "%DAY%" || exit /b 1
if exist "%REPLACED_PATH%" rmdir /s /q "%REPLACED_PATH%"

rem After the backup, which does not hold PowerSync's storage, so a failed compaction leaves the backup as it is
echo %DATE% %TIME% Compacting PowerSync's storage
bin\bun.exe run supervisor.ts compact || echo %DATE% %TIME% PowerSync's compaction failed

rem TODO: copy BACKUP_LOCAL_PATH to another machine (robocopy to a share), a backup on this server alone is lost with its disk
powershell -NoProfile -ExecutionPolicy Bypass -File cleanup-backups.ps1 -Path "%BACKUP_LOCAL_PATH%" || exit /b 1

echo %DATE% %TIME% Done
exit /b 0

:copy
pg_dump -h localhost -p %POSTGRES_PORT% -U %POSTGRES_USER% -d %POSTGRES_DB% -Fc -f "%PARTIAL_PATH%\production.dump" || exit /b 1

set "FOLDERS=SELL_ORDERS TAGS DELIVERY_NOTES INVOICES MATERIAL_CERTIFICATES caddy"
rem The task runs at 02:00, so Sunday night is Monday
if "%WEEKDAY%"=="1" set "FOLDERS=%FOLDERS% BLUEPRINTS"
for %%f in (%FOLDERS%) do (
  if exist "%%f" (
    robocopy "%%f" "%PARTIAL_PATH%\%%f" /E /R:2 /W:5 /NP /NFL /NDL /NJH /NJS
    if errorlevel 8 exit /b 1
  )
)
exit /b 0
