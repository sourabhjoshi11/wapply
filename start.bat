@echo off
cd /d "%~dp0"

echo ============================================
echo   Wapply - Start All Services
echo ============================================
echo.

:: ── Kill anything on port 8000 and 3000 ──
echo [1/4] Checking ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000"') do (
    if not "%%a"=="" (
        echo       Port 8000 in use by PID %%a — stopping...
        taskkill /f /pid %%a >nul 2>&1
    )
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do (
    if not "%%a"=="" (
        echo       Port 3000 in use by PID %%a — stopping...
        taskkill /f /pid %%a >nul 2>&1
    )
)
timeout /t 2 /nobreak >nul

:: ── Start backend (API server) ──
echo [2/4] Starting backend server...
echo       URL: http://localhost:8000
echo.
start "Wapply Backend" cmd /c ".venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

:: ── Start frontend (Next.js dev server) ──
echo [3/4] Starting frontend dev server...
echo       URL: http://localhost:3000
echo.
start "Wapply Frontend" cmd /c "cd /d frontend && npm run dev"

:: ── Wait, then open frontend in browser ──
echo [4/4] Opening frontend...
timeout /t 8 /nobreak >nul
start http://localhost:3000

echo.
echo ============================================
echo   All services started!
echo   - Landing Page:  http://localhost:3000
echo   - Onboarding:    http://localhost:3000/onboarding
echo   - Dashboard:     http://localhost:3000/dashboard
echo   - API:           http://localhost:8000
echo   - API Health:    http://localhost:8000/api/health
echo ============================================
echo.
echo Close the backend or frontend window to stop.
echo.
