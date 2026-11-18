# -*- coding: utf-8 -*-
"""
DataX-Web OpenAPI 客户端接入与调用示例 (Python 3)

功能说明:
1. 演示 HMAC-SHA256 签名算法 (HTTP Headers)
2. 调用 GET /api/open/v1/metadata/tables 检索已授权数仓库表元数据
3. 调用 POST /api/open/v1/sql/execute 提交安全只读 SQL 查询

@author ypc
@since 2026-10-30
"""

import hashlib
import hmac
import time
import uuid
import requests

# ==========================================
# 凭据与网关配置 (请替换为实际凭据)
# ==========================================
BASE_URL = "http://127.0.0.1:18080/api/open/v1"
ACCESS_KEY = "YOUR_ACCESS_KEY"
APP_SECRET = "YOUR_APP_SECRET"


def make_headers(method: str, path: str):
    """
    构造 OpenAPI 安全鉴权请求头 (HMAC-SHA256)
    
    待签字符串规则:
    stringToSign = HTTP_METHOD + "\n" + REQUEST_PATH + "\n" + accessKey + "\n" + timestamp + "\n" + nonce
    """
    timestamp = str(int(time.time() * 1000))
    nonce = uuid.uuid4().hex
    string_to_sign = f"{method}\n{path}\n{ACCESS_KEY}\n{timestamp}\n{nonce}"
    signature = hmac.new(
        APP_SECRET.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    return {
        "Content-Type": "application/json",
        "accessKey": ACCESS_KEY,
        "timestamp": timestamp,
        "nonce": nonce,
        "sign": signature
    }


def query_metadata(datasource_id=None):
    """
    1. 查询已授权库表结构元数据
    """
    path = "/api/open/v1/metadata/tables"
    headers = make_headers("GET", path)
    params = {}
    if datasource_id:
        params["datasourceId"] = datasource_id
    res = requests.get(f"{BASE_URL}/metadata/tables", headers=headers, params=params, timeout=10)
    print("=== 1. 授权库表元数据响应 ===")
    print("状态码:", res.status_code)
    print("响应内容:", res.json())
    return res.json()


def execute_sql(datasource_id: int, sql: str):
    """
    2. 安全执行只读 SQL 查询
    """
    path = "/api/open/v1/sql/execute"
    headers = make_headers("POST", path)
    payload = {
        "datasourceId": datasource_id,
        "sql": sql
    }
    res = requests.post(f"{BASE_URL}/sql/execute", headers=headers, json=payload, timeout=15)
    print("\n=== 2. 只读 SQL 执行响应 ===")
    print("状态码:", res.status_code)
    print("响应内容:", res.json())
    return res.json()


if __name__ == "__main__":
    print(f"正在连接 DataX OpenAPI 网关: {BASE_URL}")
    print(f"使用公钥 AK: {ACCESS_KEY}")
    # 示例调用
    # query_metadata()
    # execute_sql(8, "SELECT * FROM your_table LIMIT 10")
