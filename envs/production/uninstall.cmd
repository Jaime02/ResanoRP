@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1 || (echo Run this as administrator & goto :fail)
set "PATH=%~dp0bin\postgres\bin;%PATH%"

rem Only what install.cmd registered: the folder keeps its data, so a renamed copy of it is a complete backup.
rem ResanoRP first, because ResanoRP-db does not stop while a service that depends on it runs. A service deleted while
rem it runs keeps running and holds the folder's files
call :stop-service ResanoRP || goto :fail
sc query ResanoRP >nul 2>&1 && (resanorp-service.exe uninstall || goto :fail)
call :stop-service ResanoRP-db || goto :fail
sc query ResanoRP-db >nul 2>&1 && (pg_ctl unregister -N ResanoRP-db || goto :fail)
schtasks /delete /tn ResanoRP-backup /f >nul 2>&1
netsh advfirewall firewall delete rule name="ResanoRP" >nul 2>&1
netsh advfirewall firewall delete rule name="ResanoRP HTTP/3" >nul 2>&1

echo ResanoRP is uninstalled, %~dp0 was left as it was
pause
exit /b 0

:stop-service
sc query %1 >nul 2>&1 || exit /b 0
sc query %1 | find "STOPPED" >nul && exit /b 0
net stop %1 || (echo %1 could not be stopped & exit /b 1)
exit /b 0

:fail
echo Failed to uninstall ResanoRP
pause
exit /b 1
