@echo off
setlocal enabledelayedexpansion

echo ========================================
echo 🚀 DESPLIEGUE EN 1-CLIC - META ADS AGENT
echo ========================================
echo.

:: Verificar si hay cambios
git status --short | findstr /R "^" > nul
if %errorlevel% neq 0 (
    echo [!] No hay cambios detectados para subir.
    pause
    exit /b
)

:: Preguntar por mensaje de commit (opcional)
set /p msg="Mensaje del cambio (Enter para autogenerado): "
if "!msg!"=="" set msg="Update: %date% %time%"

echo.
echo [+] Guardando cambios...
git add .

echo [+] Creando commit...
git commit -m "!msg!"

echo [+] Subiendo a GitHub y Vercel...
git push origin main

echo.
echo ========================================
echo ✅ ¡LISTO! El despliegue ha comenzado.
echo Puedes verlo en: https://vercel.com/Stomp1/agente-meta-ads2
echo ========================================
echo.
pause
