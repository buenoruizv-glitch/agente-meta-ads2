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
if !errorlevel! == 0 (
  echo Sin cambios nuevos, desplegando version actual...
  goto :deploy
)

set "msg=Deploy %date% %time:~0,8%"
echo Mensaje del commit ^(Enter para usar autogenerado^):
echo   Auto: !msg!
set /p "msg=  Tu mensaje: "

git commit -m "!msg!"
if !errorlevel! neq 0 (
  echo.
  echo ERROR: Fallo el commit. Revisa el mensaje de error arriba.
  goto :end
)

:deploy
echo.
echo [1/2] Subiendo a GitHub...
git push origin main
if !errorlevel! neq 0 (
  echo.
  echo ERROR: No se pudo subir a GitHub. Revisa tu conexion o credenciales.
  goto :end
)

echo.
echo [2/2] Desplegando en Vercel...
call vercel --prod
if !errorlevel! neq 0 (
  echo.
  echo ERROR: Fallo el despliegue en Vercel.
  goto :end
)

echo.
echo ==========================================
echo   LISTO - LIVE EN:
echo   https://agente-meta-ads2-umber.vercel.app
echo ==========================================

:end
echo.
pause
