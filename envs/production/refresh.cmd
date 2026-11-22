@echo off
setlocal
cd /d "%~dp0"

net session >nul 2>&1 || (echo Run this as administrator & goto :fail)
rem psycopg loads libpq.dll from the PATH
set "PATH=%~dp0bin\postgres\bin;%PATH%"

if not exist venv\Scripts\python.exe (
  rem pyodbc and python-calamine ship prebuilt wheels only up to 3.14, newer versions need a C++ and Rust toolchain
  py -3.14 -m venv venv || (echo Install Python 3.14 from python.org & goto :fail)
)
venv\Scripts\python -m pip install -q -r src\db\requirements.txt || goto :fail
venv\Scripts\python src\db\refresh_production.py || goto :fail
pause
exit /b 0

:fail
echo Failed to refresh ResanoRP
pause
exit /b 1
