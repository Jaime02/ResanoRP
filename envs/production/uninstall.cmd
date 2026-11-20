@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1 || (echo Run this as administrator & goto :fail)
set "PATH=%~dp0bin\postgres\bin;%PATH%"

rem Only what install.cmd registered: the folder keeps its data, so a renamed copy of it is a complete backup
sc query ResanoRP >nul 2>&1 && (
  resanorp-service.exe stop >nul 2>&1
  resanorp-service.exe uninstall || goto :fail
)
sc query ResanoRP-db >nul 2>&1 && (
  net stop ResanoRP-db >nul 2>&1
  pg_ctl unregister -N ResanoRP-db || goto :fail
)
schtasks /delete /tn ResanoRP-backup /f >nul 2>&1
netsh advfirewall firewall delete rule name="ResanoRP" >nul 2>&1
netsh advfirewall firewall delete rule name="ResanoRP HTTP/3" >nul 2>&1

echo ResanoRP is uninstalled, %~dp0 was left as it was
pause
exit /b 0

:fail
echo Failed to uninstall ResanoRP
pause
exit /b 1
