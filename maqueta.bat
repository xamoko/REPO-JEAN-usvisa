@echo off
setlocal

REM Establecer las variables de entorno
set USERNAME=holaemal
set PASSWORD=holapass
set SCHEDULE_ID=9999999
set FACILITY_ID=9999
set MAX_RETRIES=3
set RETRIES=0

REM Configurar las variables de entorno para la API de Telegram
set TELEGRAM_API_KEY=9999999
set TELEGRAM_CHAT_ID=123456

:loop
rem ejecutar script index.js con fecha actual
echo ejecutando script
node index.js 2024-07-10 %*

goto loop
