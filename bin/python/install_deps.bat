@echo off
rem ==============================================================================
rem DataX-Web Python 统计任务依赖自动化安装脚本 (Windows 环境)
rem author: ypc
rem ==============================================================================
chcp 65001 >nul
setlocal

echo ==========================================================
echo >>> 开始检查与安装 DataX-Web Python 依赖...
echo ==========================================================

set SCRIPT_DIR=%~dp0
set REQUIREMENTS_FILE=%SCRIPT_DIR%requirements.txt
set PACKAGES_DIR=%SCRIPT_DIR%packages

rem 1. 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未检测到系统 Python 环境，请确保 python 命令已加入 PATH 环境变量！
    pause
    exit /b 1
)

rem 2. 执行安装 (存在离线包则优先离线)
if exist "%PACKAGES_DIR%" (
    echo >>> 检测到离线依赖包目录，执行【离线断网安装】...
    python -m pip install --no-index --find-links="%PACKAGES_DIR%" -r "%REQUIREMENTS_FILE%"
) else (
    echo >>> 执行【在线镜像源安装】(清华大学镜像源)...
    python -m pip install -r "%REQUIREMENTS_FILE%" -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn
)

rem 3. 校验
echo >>> 正在校验依赖...
python -c "import pymysql, requests, dbutils; print('✅ 依赖校验成功 (pymysql, requests, dbutils)')"

echo ==========================================================
echo >>> 依赖环境配置完成！
echo ==========================================================
