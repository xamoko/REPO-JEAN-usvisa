modificamos const BASE_URI = 'https://ais.usvisa-info.com/en-ec/niv'
al pais de preferencia.

maqueta.bat modifican sus datos: 
@echo off
setlocal

REM Establecer las variables de entorno
set USERNAME=holaemal
set PASSWORD=holapass
set SCHEDULE_ID=9999999
set FACILITY_ID=9999

REM Configurar las variables de entorno para la API de Telegram
set TELEGRAM_API_KEY=9999999
set TELEGRAM_CHAT_ID=123456

:loop
rem ejecutar script index.js con fecha actual
echo ejecutando script
node index.js 2024-07-10 %*

goto loop


//////////////////////////////////////////////Ç

Esta version manejamos bot , pero tienes que crear tu bot para que obtengas tu api tokens y erl chat id. si quieres inf  throw a message
