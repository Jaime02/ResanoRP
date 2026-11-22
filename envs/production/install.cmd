@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1 || (echo Run this as administrator & goto :fail)

for %%f in (bin\postgres\bin\postgres.exe bin\bun.exe bin\node.exe bin\caddy.exe resanorp-service.exe .output\server\index.mjs powersync-service\node_modules browsers) do (
  if not exist "%%f" (echo %%f is missing, copy the whole production folder again & goto :fail)
)

rem The service runs as SYSTEM, which only sees the system PATH, not the one of the user running this
powershell -NoProfile -Command "$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine'); if (-not (Get-Command gswin64c -ErrorAction SilentlyContinue)) { exit 1 }" || (
  echo Ghostscript ^(gswin64c^) is not in the system PATH, add its bin folder to it and restart the machine
  goto :fail
)

for /f "usebackq tokens=1,* delims== " %%a in (`findstr /b /c:POSTGRES_ /c:VITE_CADDY_ .env`) do set "%%a=%%~b"
set "PATH=%~dp0bin\postgres\bin;%PATH%"

if not exist pgdata (
  echo Creating the database
  (echo %POSTGRES_PASSWORD%)>pgpass.tmp
  initdb -D pgdata -U %POSTGRES_USER% --pwfile=pgpass.tmp -E UTF8 --locale=en-US --auth=scram-sha-256 >nul || (del pgpass.tmp & goto :fail)
  del pgpass.tmp
  (
    echo port = %POSTGRES_PORT%
    echo listen_addresses = 'localhost'
    echo wal_level = logical
    echo max_slot_wal_keep_size = 10GB
  ) >> pgdata\postgresql.conf
)

sc query ResanoRP-db >nul 2>&1 || (
  icacls pgdata /grant "NT AUTHORITY\NetworkService:(OI)(CI)F" /t /q >nul || goto :fail
  pg_ctl register -N ResanoRP-db -D "%~dp0pgdata" -S auto -U "NT AUTHORITY\NetworkService" || goto :fail
)

sc query ResanoRP >nul 2>&1 || (
  resanorp-service.exe install || goto :fail
)

netsh advfirewall firewall delete rule name="ResanoRP" >nul 2>&1
netsh advfirewall firewall delete rule name="ResanoRP HTTP/3" >nul 2>&1
netsh advfirewall firewall add rule name="ResanoRP" dir=in action=allow protocol=TCP localport=%VITE_CADDY_HTTPS_PORT% >nul || goto :fail
netsh advfirewall firewall add rule name="ResanoRP HTTP/3" dir=in action=allow protocol=UDP localport=%VITE_CADDY_HTTPS_PORT% >nul || goto :fail

schtasks /create /tn ResanoRP-backup /sc daily /st 02:00 /ru SYSTEM /rl HIGHEST /f /tr "\"%~dp0backup.cmd\"" >nul || echo The daily backup could not be scheduled

call "%~dp0start.cmd"
exit /b %errorlevel%

:fail
echo Failed to install ResanoRP
pause
exit /b 1
