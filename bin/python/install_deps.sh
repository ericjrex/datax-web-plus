#!/usr/bin/env bash
# ==============================================================================
# DataX-Web Python 统计任务依赖自动化安装脚本 (支持在线与离线模式)
# author: ypc
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIREMENTS_FILE="${SCRIPT_DIR}/requirements.txt"
PACKAGES_DIR="${SCRIPT_DIR}/packages"

echo "=========================================================="
echo ">>> 开始检查与安装 DataX-Web Python 统计引擎运行依赖..."
echo "=========================================================="

# 1. 探测 Python 与 Pip 解释器
PYTHON_BIN="python3"
if ! command -v python3 &> /dev/null; then
    if command -v python &> /dev/null; then
        PYTHON_BIN="python"
    else
        echo "❌ 错误: 未检测到系统 Python 环境，请先安装 Python 3.8+ 并配置环境变量！"
        exit 1
    fi
fi

echo ">>> 使用 Python 解释器: $($PYTHON_BIN --version 2>&1) ($(which $PYTHON_BIN))"

# 2. 判断安装模式 (优先检查是否存在离线 packages 目录)
if [ -d "$PACKAGES_DIR" ] && [ "$(ls -A "$PACKAGES_DIR" 2>/dev/null)" ]; then
    echo ">>> 检测到离线依赖包目录 [${PACKAGES_DIR}]，执行【离线断网安装模式】..."
    $PYTHON_BIN -m pip install --no-index --find-links="$PACKAGES_DIR" -r "$REQUIREMENTS_FILE"
else
    echo ">>> 未发现本地离线包，执行【在线镜像源安装模式】(清华大学镜像源)..."
    $PYTHON_BIN -m pip install -r "$REQUIREMENTS_FILE" \
        -i https://pypi.tuna.tsinghua.edu.cn/simple \
        --trusted-host pypi.tuna.tsinghua.edu.cn
fi

# 3. 安装结果校验
echo ">>> 正在进行依赖可用性自检..."
$PYTHON_BIN -c "import pymysql, requests, dbutils; print('✅ 依赖自检全部通过 (pymysql, requests, dbutils)')"

echo "=========================================================="
echo ">>> Python 统计引擎依赖环境部署完成！"
echo "=========================================================="
