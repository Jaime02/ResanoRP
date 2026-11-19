@echo off
setlocal
cd /d "%~dp0"

for /f "usebackq tokens=1,* delims== " %%a in (`findstr /b BACKUP_ .env`) do set "%%a=%%~b"

rem A full backup folder, a date in BACKUP_LOCAL_PATH or, without either, its latest backup
set "SOURCE=%~1"
if not defined SOURCE for /f %%d in ('dir /b /ad /o-n "%BACKUP_LOCAL_PATH%"') do if not defined SOURCE set "SOURCE=%BACKUP_LOCAL_PATH%\%%d"
if not exist "%SOURCE%\production.dump" set "SOURCE=%BACKUP_LOCAL_PATH%\%~1"
if not exist "%SOURCE%\production.dump" (echo No backup found at %SOURCE% & goto :fail)
if exist import (echo An import is already staged, remove the import folder first & goto :fail)

for %%p in ("%SOURCE%\..") do set "ROOT=%%~fp"
for %%p in ("%SOURCE%") do set "DAY=%%~nxp"
rem Only the Sunday night backups hold the blueprints
for /f %%d in ('dir /b /ad /o-n "%ROOT%"') do if not defined BLUEPRINTS if %%d leq %DAY% if exist "%ROOT%\%%d\BLUEPRINTS" set "BLUEPRINTS=%ROOT%\%%d\BLUEPRINTS"

echo Database and files: %SOURCE%
echo Blueprints: %BLUEPRINTS%
choice /c YN /m "Replace the production data with this backup? The current data is saved in backups"
if errorlevel 2 exit /b 1

robocopy "%SOURCE%" import /E /XD caddy BLUEPRINTS /NP /NFL /NDL /NJH /NJS >nul
if errorlevel 8 goto :fail
ren import\production.dump prisma.dump || goto :fail
if defined BLUEPRINTS (
  robocopy "%BLUEPRINTS%" import\BLUEPRINTS /E /NP /NFL /NDL /NJH /NJS >nul
  if errorlevel 8 goto :fail
)
rem Only on a new machine: replacing the CA of a running one would break the certificate every client trusts
if not exist caddy if exist "%SOURCE%\caddy" (
  robocopy "%SOURCE%\caddy" caddy /E /NP /NFL /NDL /NJH /NJS >nul
  if errorlevel 8 goto :fail
)

call "%~dp0start.cmd"
exit /b %errorlevel%

:fail
echo Failed to restore the backup
pause
exit /b 1
