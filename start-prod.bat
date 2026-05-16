@echo off
echo ===================================================
echo Construyendo y Iniciando Agente Meta Ads 2 (Producción)
echo ===================================================
echo.
echo Paso 1: Construyendo la aplicacion (npm run build)...
call npm run build
if %errorlevel% neq 0 (
    echo Error durante el build. Cancelando inicio.
    pause
    exit /b %errorlevel%
)
echo.
echo Paso 2: Iniciando el servidor (npm run start)...
echo Presiona Ctrl+C para detener el servidor.
echo.
npm run start
pause
