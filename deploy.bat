@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Deploy a produccion

echo.
echo ==========================================
echo   DEPLOY A PRODUCCION - META ADS AGENT
echo ==========================================
echo.

git add .

git diff --cached --quiet
if %errorlevel%==0 (
  echo Sin cambios nuevos, desplegando version actual...
  goto :deploy
)

set "msg=Deploy %date% %time:~0,8%"
echo Mensaje del commit (Enter para usar autogenerado):
echo   ^> %msg%
set /p custom="  > "
if not "!custom!"=="" set "msg=!custom!"

git commit -m "!msg!"

:deploy
echo.
echo [1/2] Subiendo a GitHub...
git push origin main
if errorlevel 1 (
  echo ERROR al subir a GitHub. Revisa tu conexion.
  pause
  exit /b 1
)

echo.
echo [2/2] Desplegando en Vercel...
vercel --prod
if errorlevel 1 (
  echo ERROR en el despliegue de Vercel.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo   LISTO - LIVE EN:
echo   https://agente-meta-ads2-umber.vercel.app
echo ==========================================
echo.
pause
