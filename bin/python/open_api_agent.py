#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DataX-Web 外部数仓开放接口智能联调测试 Agent.

用于三方平台、外部 AI 智能体与 DataX-Web 开放 API 进行对接联调、
元数据自动感知、只读 SQL 安全执行及多道安全防线（防篡改、防重放、只读强校验、越权拦截）测试验证。

@author: ypc
@since: 2026-10-29
"""

import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

# 优先导入 requests，若环境无第三方库则优雅降级为 urllib
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    import urllib.error
    import urllib.parse
    import urllib.request
    HAS_REQUESTS = False


class AccountConfigLoader:
    """数仓开放 API 凭据安全加载器.

    负责从受保护的外部独立配置文件或环境变量中安全解析账号凭据，
    确保 AK/SK 物理外置，0 字节流入 LLM 上下文与 Prompt。
    """

    DEFAULT_CONFIG_LOCATIONS = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "config", "dw_openapi_account.json"),
        os.path.join(os.getcwd(), "bin", "config", "dw_openapi_account.json"),
        os.path.expanduser("~/.datax/dw_openapi_account.json")
    ]

    @classmethod
    def load_credentials(
        cls,
        config_path: Optional[str] = None,
        cli_url: Optional[str] = None,
        cli_ak: Optional[str] = None,
        cli_sk: Optional[str] = None
    ) -> Dict[str, Any]:
        """按优先级安全加载认证凭据.

        加载优先级：
        1. 显式命令行参数 (--url, --ak, --sk)
        2. 指定或自动发现的独立账号配置文件 (--config 或 DEFAULT_CONFIG_LOCATIONS)
        3. 环境变量 (DATAX_OPENAPI_BASE_URL, DATAX_OPEN_AK, DATAX_OPEN_SK)

        Args:
            config_path: 外部指定的配置文件绝对/相对路径
            cli_url: 命令行传递的网关基地址
            cli_ak: 命令行传递的 AK
            cli_sk: 命令行传递的 SK

        Returns:
            Dict[str, Any]: 包含 baseUrl, accessKey, secretKey, businessDomain, timeout 等键值
        """
        config_data = {
            "baseUrl": "http://localhost:18080",
            "accessKey": "",
            "secretKey": "",
            "businessDomain": "",
            "timeout": 15,
            "source": "未加载凭据"
        }

        # 1. 尝试从独立账号配置文件读取
        target_file = None
        if config_path and os.path.exists(config_path):
            target_file = config_path
        elif os.getenv("DATAX_OPENAPI_CONFIG") and os.path.exists(os.getenv("DATAX_OPENAPI_CONFIG", "")):
            target_file = os.getenv("DATAX_OPENAPI_CONFIG")
        else:
            for loc in cls.DEFAULT_CONFIG_LOCATIONS:
                normalized = os.path.abspath(loc)
                if os.path.exists(normalized):
                    target_file = normalized
                    break

        if target_file:
            try:
                with open(target_file, "r", encoding="utf-8") as f:
                    file_json = json.load(f)
                    config_data["baseUrl"] = file_json.get("baseUrl", config_data["baseUrl"])
                    config_data["accessKey"] = file_json.get("accessKey", "")
                    config_data["secretKey"] = file_json.get("secretKey", "")
                    config_data["businessDomain"] = file_json.get("businessDomain", "")
                    config_data["timeout"] = int(file_json.get("timeout", 15))
                    config_data["source"] = f"文件: {target_file}"
            except Exception as e:
                print(f"[!] 读取账号配置文件 [{target_file}] 失败: {str(e)}")

        # 2. 环境变量兜底覆盖
        env_url = os.getenv("DATAX_OPENAPI_BASE_URL", os.getenv("DATAX_OPEN_URL"))
        if env_url:
            config_data["baseUrl"] = env_url
        env_ak = os.getenv("DATAX_OPEN_AK")
        if env_ak:
            config_data["accessKey"] = env_ak
            config_data["source"] = "环境变量: DATAX_OPEN_AK"
        env_sk = os.getenv("DATAX_OPEN_SK")
        if env_sk:
            config_data["secretKey"] = env_sk

        # 3. 显式 CLI 参数最高优先级
        if cli_url:
            config_data["baseUrl"] = cli_url
        if cli_ak:
            config_data["accessKey"] = cli_ak
            config_data["source"] = "命令行参数 --ak"
        if cli_sk:
            config_data["secretKey"] = cli_sk

        return config_data


class OpenApiSigner:
    """开放 API 签名与请求凭证生成器.

    负责计算 HMAC-SHA256 签名，生成精确秒级时间戳及高唯一性防重放随机数 nonce。
    """

    @staticmethod
    def generate_nonce() -> str:
        """生成 32 位唯一随机数防重放."""
        return uuid.uuid4().hex

    @staticmethod
    def current_timestamp() -> int:
        """获取当前系统秒级时间戳."""
        return int(time.time())

    @staticmethod
    def calculate_signature(
        method: str,
        path: str,
        access_key: str,
        timestamp: int,
        nonce: str,
        secret_key: str
    ) -> str:
        """计算标准 HMAC-SHA256 签名.

        拼接规则严格对齐后端 OpenApiSignUtil:
        UPPER(method)&url&accessKey&timestamp&nonce (其中 url 不含 query string)

        Args:
            method: HTTP 方法 (GET, POST 等)
            path: 请求路径 (如 /api/open/v1/metadata/tables)
            access_key: 账号身份公钥 AK
            timestamp: 秒级时间戳
            nonce: 防重放随机数
            secret_key: 账号私钥 SK

        Returns:
            Base64 编码的签名串
        """
        clean_path = path.split("?")[0].strip()
        raw_sign_string = f"{method.upper().strip()}&{clean_path}&{access_key.strip()}&{timestamp}&{nonce.strip()}"
        mac = hmac.new(
            secret_key.strip().encode("utf-8"),
            raw_sign_string.encode("utf-8"),
            hashlib.sha256
        )
        return base64.b64encode(mac.digest()).decode("utf-8")


class DataWarehouseClient:
    """数仓开放接口底层通信客户端.

    封装 HTTP 请求发包、鉴权头组装、网络超时及业务状态码解析。
    """

    def __init__(self, base_url: str, access_key: str, secret_key: str, timeout: int = 15):
        """初始化通信客户端.

        Args:
            base_url: 服务基础地址 (如 http://127.0.0.1:18080)
            access_key: 账号 AK
            secret_key: 账号 SK
            timeout: 超时时间 (默认15秒，配合服务端10秒强杀)
        """
        self.base_url = base_url.rstrip("/")
        self.access_key = access_key
        self.secret_key = secret_key
        self.timeout = timeout

    def _build_auth_headers(
        self,
        method: str,
        path: str,
        custom_ts: Optional[int] = None,
        custom_nonce: Optional[str] = None,
        custom_sk: Optional[str] = None
    ) -> Dict[str, str]:
        """构建标准安全鉴权请求头."""
        ts = custom_ts if custom_ts is not None else OpenApiSigner.current_timestamp()
        nonce = custom_nonce if custom_nonce is not None else OpenApiSigner.generate_nonce()
        sk = custom_sk if custom_sk is not None else self.secret_key

        sign = OpenApiSigner.calculate_signature(
            method=method,
            path=path,
            access_key=self.access_key,
            timestamp=ts,
            nonce=nonce,
            secret_key=sk
        )

        return {
            "accessKey": self.access_key,
            "timestamp": str(ts),
            "nonce": nonce,
            "sign": sign,
            "User-Agent": "DataWarehouse-OpenApiAgent/1.0",
        }

    def request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        custom_headers: Optional[Dict[str, str]] = None,
        custom_ts: Optional[int] = None,
        custom_nonce: Optional[str] = None,
        custom_sk: Optional[str] = None
    ) -> Tuple[int, Dict[str, Any]]:
        """执行安全 HTTP 请求.

        Returns:
            Tuple[http_status_code, response_json_dict]
        """
        headers = self._build_auth_headers(
            method=method,
            path=path,
            custom_ts=custom_ts,
            custom_nonce=custom_nonce,
            custom_sk=custom_sk
        )
        if custom_headers:
            headers.update(custom_headers)

        full_url = f"{self.base_url}{path}"

        if HAS_REQUESTS:
            try:
                response = requests.request(
                    method=method,
                    url=full_url,
                    params=params,
                    json=json_data,
                    headers=headers,
                    timeout=self.timeout
                )
                try:
                    data = response.json()
                except Exception:
                    data = {"code": -1, "msg": response.text}
                return response.status_code, data
            except requests.RequestException as e:
                return -1, {"code": -1, "msg": f"网络通信异常: {str(e)}"}
        else:
            # 使用 Python 原生 urllib 降级实现
            query_str = f"?{urllib.parse.urlencode(params)}" if params else ""
            req_url = f"{full_url}{query_str}"
            req_body = json.dumps(json_data).encode("utf-8") if json_data else None

            req = urllib.request.Request(req_url, data=req_body, method=method)
            for k, v in headers.items():
                req.add_header(k, v)
            if json_data:
                req.add_header("Content-Type", "application/json")

            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    resp_code = resp.getcode()
                    content = resp.read().decode("utf-8")
                    try:
                        data = json.loads(content)
                    except Exception:
                        data = {"code": -1, "msg": content}
                    return resp_code, data
            except urllib.error.HTTPError as e:
                err_content = e.read().decode("utf-8")
                try:
                    data = json.loads(err_content)
                except Exception:
                    data = {"code": -1, "msg": err_content}
                return e.code, data
            except Exception as e:
                return -1, {"code": -1, "msg": f"原生请求失败: {str(e)}"}


class SchemaPerceiver:
    """数仓元数据感知与 Schema 语义建模模块.

    自动探查当前授权数据源、可用数据表与字段注释，组织为 LLM 上下文。
    """

    def __init__(self, client: DataWarehouseClient):
        self.client = client
        self.metadata_cache: Optional[Dict[str, Any]] = None

    def fetch_metadata(self, datasource_id: Optional[int] = None) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """获取当前账号已授权的所有库表与字段元数据."""
        params = {}
        if datasource_id:
            params["datasourceId"] = datasource_id

        path = "/api/open/v1/metadata/tables"
        status, res = self.client.request("GET", path, params=params)

        if status == 200 and res.get("code") == 0:
            self.metadata_cache = res.get("data", {})
            return True, "元数据拉取成功", self.metadata_cache
        else:
            err_msg = res.get("msg") or f"HTTP {status}"
            return False, f"元数据拉取失败: {err_msg}", None

    def build_prompt_schema(self) -> str:
        """构建用于 Text-to-SQL 的精炼表结构上下文."""
        if not self.metadata_cache:
            success, msg, _ = self.fetch_metadata()
            if not success:
                return f"[元数据不可用: {msg}]"

        tables = self.metadata_cache.get("tables", [])
        if not tables:
            return "当前账号未被授权任何有效数据表。"

        lines = ["【已授权数仓库表元数据】"]
        for t in tables:
            ds_name = t.get("datasourceName", "默认数据源")
            tbl_name = t.get("tableName", "")
            tbl_comment = t.get("tableComment", "无描述")
            lines.append(f"\n* 数据源: {ds_name} (ID: {t.get('datasourceId')}) | 表名: {tbl_name} ({tbl_comment})")
            lines.append("  字段清单:")
            for col in t.get("columns", []):
                col_name = col.get("columnName")
                col_type = col.get("dataType")
                col_comm = col.get("columnComment") or "无注释"
                lines.append(f"    - {col_name} ({col_type}): {col_comm}")
        return "\n".join(lines)


class WarehouseAgent:
    """数仓智能联调与自动化交互 Agent.

    提供元数据感知、只读 SQL 执行、自然语言意图理解及全套安全审计测试。
    """

    def __init__(self, base_url: str, access_key: str, secret_key: str):
        self.client = DataWarehouseClient(base_url, access_key, secret_key)
        self.perceiver = SchemaPerceiver(self.client)

    def print_schema_summary(self) -> None:
        """打印库表结构摘要."""
        success, msg, data = self.perceiver.fetch_metadata()
        if not success:
            print(f"[!] {msg}")
            return

        print("\n" + "=" * 65)
        print(f" 账号主体: {data.get('accountName')} | 授权数据源数: {data.get('databaseCount')} | 可用表数: {data.get('tableCount')}")
        print("=" * 65)
        for tbl in data.get("tables", []):
            print(f"数据源 [{tbl.get('datasourceId')}:{tbl.get('datasourceName')}] -> 表: {tbl.get('tableName')}")
            print(f"表注释: {tbl.get('tableComment')}")
            print("字段列表:")
            cols = tbl.get("columns", [])
            for c in cols:
                print(f"  {c.get('columnName'):<24} {c.get('dataType'):<12} {c.get('columnComment')}")
            print("-" * 65)

    def execute_sql(self, sql: str, datasource_id: Optional[int] = None) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """提交只读 SQL 查询."""
        payload: Dict[str, Any] = {"sql": sql}
        if datasource_id:
            payload["datasourceId"] = datasource_id

        path = "/api/open/v1/sql/execute"
        status, res = self.client.request("POST", path, json_data=payload)

        if status == 200 and res.get("code") == 0:
            data = res.get("data", {})
            return True, "执行成功", data
        else:
            msg = res.get("msg") or f"HTTP {status}"
            return False, msg, None

    @staticmethod
    def render_table(columns: List[str], rows: Any, max_rows: int = 15) -> str:
        """格式化渲染 ASCII 字符表格."""
        if not columns:
            return "（无返回字段列）"
        if not rows:
            return "（查询结果为空，0 条记录）"

        # 限制渲染行数防止刷屏
        display_rows = rows[:max_rows]
        str_rows = []
        for r in display_rows:
            if isinstance(r, dict):
                row_cells = [str(r.get(col, "")) if r.get(col) is not None else "NULL" for col in columns]
            elif isinstance(r, (list, tuple)):
                row_cells = [str(cell) if cell is not None else "NULL" for cell in r]
            else:
                row_cells = [str(r)]
            str_rows.append(row_cells)

        col_widths = [len(c) for c in columns]
        for row in str_rows:
            for i, val in enumerate(row):
                if i < len(col_widths):
                    col_widths[i] = max(col_widths[i], len(val))

        # 限制每列最大宽度
        col_widths = [min(w, 40) for w in col_widths]

        sep_line = "+" + "+".join(["-" * (w + 2) for w in col_widths]) + "+"
        header_line = "|" + "|".join([f" {columns[i]:<{col_widths[i]}} " for i in range(len(columns))]) + "|"

        lines = [sep_line, header_line, sep_line]
        for row in str_rows:
            row_line = "|" + "|".join([f" {row[i][:col_widths[i]]:<{col_widths[i]}} " for i in range(len(columns))]) + "|"
            lines.append(row_line)
        lines.append(sep_line)

        if len(rows) > max_rows:
            lines.append(f"（已展示前 {max_rows} 条，共 {len(rows)} 条）")
        return "\n".join(lines)

    def build_ai_prompt(self, user_question: str) -> str:
        """根据当前授权库表元数据与用户业务问题，动态组装标准 AI 提数 Prompt.

        Args:
            user_question: 用户的业务提问

        Returns:
            可直接提交给 LLM (如 DeepSeek, GPT-4, Claude) 的完整 Prompt 文本
        """
        schema_text = self.perceiver.build_prompt_schema()
        prompt_template = f"""你是一位精通大数据与数据仓库分析的资深数据分析与 Text-to-SQL 提数专家。
你的核心职责是：根据用户提出的业务统计或报表提数需求，结合下方给定的【已授权数仓库表元数据】，严谨地生成符合安全规范的标准只读 MySQL SQL 查询语句，并提供指标推导逻辑分析。

==================================================
【核心安全硬性红线 (一票否决)】
==================================================
1. 绝对只读：只能生成 SELECT 查询语句！严禁出现任何写或破坏性指令（包括但不限于 INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, REPLACE, GRANT 等）。
2. 表名白名单限制：SQL 中引用的所有物理表必须 100% 存在于下方【已授权数仓库表元数据】列表中，严禁臆造表名，严禁访问系统表（如 information_schema.*, sys.*, mysql.*, job_* 等）。
3. 禁用高危与探测函数：严禁调用 SLEEP(), BENCHMARK(), LOAD_FILE(), INTO OUTFILE, DUMPFILE 等可能造成慢查耗尽连接或文件读取的函数。
4. 强制结果集限制 (LIMIT)：所有的明细查询或无聚合的全表扫描，必须在 SQL 末尾显式声明 LIMIT 子句（默认 LIMIT 100，最大不得超过 1000）。
5. 敏感字段保护：严禁使用 SELECT * 探测全表，应按需投影业务指标字段；密码、Token、私密凭证等敏感列禁止输出。
6. 方言兼容：目标数据库为 MySQL 8.0 兼容语法，时间格式统一遵循 'YYYY-MM-DD HH:mm:ss'，日期比较使用物理日期字段。

==================================================
【纯净输出铁律：严禁返回对用户无用的技术噪音】
==================================================
面向业务用户时，你的职责是提供【业务数据与统计结论】，不是进行技术答辩。以下内容属于对用户无用的垃圾信息，一律严禁输出：
1. ❌ 严禁输出任何架构图与链路图：绝对不要绘制“SQL 执行安全架构链路图”、“系统流转拓扑图”或 Mermaid 流程图！
2. ❌ 严禁输出任何安全性审计报告：绝对不要提及“语法树只读断言”、“Druid SQL AST 解析”、“只读事务隔离 connection.setReadOnly”、“10秒熔断机制”、“白名单约束校验”等底层网关实现！
3. ❌ 严禁输出任何底层调试碎碎念与客套话：不要讲“很高兴为您服务”等废话，禁止展示冗长的内部思考草稿。

==================================================
【已授权数仓库表元数据 (动态注入)】
==================================================
{schema_text}

==================================================
【输出格式规范 (必须且仅输出标准 JSON)】
==================================================
为了确保下游程序自动化执行，你必须直接返回以下 JSON 格式对象，不要添加任何额外的开场白、客套话或非 JSON 文本：

```json
{{
  "analysis": "简述业务统计口径与时间范围（禁止写技术实现或安全审计）",
  "datasourceId": 目标数据源ID(整数),
  "tables": ["涉及的数据表名列表"],
  "sql": "生成的标准可执行只读 SELECT SQL 语句",
  "expectedMetrics": ["指标1", "指标2"]
}}
```

==================================================
【少样本参考范例 (Few-Shot Examples)】
==================================================
【示例 1 - 统计聚合】
用户提问: "统计 2026年10月 各租车公司的司机当班总人次和总营运里程"
你的输出:
```json
{{
  "analysis": "按租车公司 tenant_name 分组聚合，统计当班人次 count(1) 以及营运里程求和 sum(operating_mileage)，过滤统计日期在 2026-10-01 至 2026-10-31 之间",
  "datasourceId": 8,
  "tables": ["dwd_taxi_driver_shift_di"],
  "sql": "SELECT tenant_name, count(1) AS shift_count, sum(operating_mileage) AS total_mileage FROM dwd_taxi_driver_shift_di WHERE stat_date >= '2026-10-01' AND stat_date <= '2026-10-31' GROUP BY tenant_name ORDER BY total_mileage DESC LIMIT 100",
  "expectedMetrics": ["租车公司名称", "当班总次数", "总营运里程(公里)"]
}}
```

==================================================
【待执行用户提问】
==================================================
{user_question}

请严格按上述 JSON 规范返回结果。严禁包含任何架构图或安全审计等技术冗余文本。"""
        return prompt_template

    def ask(self, question: str) -> None:
        """根据自然语言提问，基于当前元数据组织 SQL 并执行查询."""
        print(f"\n[Agent 提问分析] 用户问题: '{question}'")
        success, msg, data = self.perceiver.fetch_metadata()
        if not success or not data or not data.get("tables"):
            print(f"[!] 无法获取元数据: {msg}")
            return

        tables = data.get("tables", [])
        target_tbl = tables[0]
        tbl_name = target_tbl.get("tableName")
        ds_id = target_tbl.get("datasourceId")

        print(f"[Agent 语义匹配] 匹配到最佳数据表: {tbl_name} (数据源 ID: {ds_id})")

        # 针对常见问题模式进行规则与 SQL 翻译推导
        q_lower = question.lower()
        if "考勤" in question or "当班" in question or "司机" in question or "车" in question or "count" in q_lower:
            sql = f"SELECT stat_date, tenant_name, count(1) AS shift_count, sum(operating_mileage) AS total_mileage FROM {tbl_name} GROUP BY stat_date, tenant_name ORDER BY stat_date DESC LIMIT 10"
        elif "字段" in question or "结构" in question:
            self.print_schema_summary()
            return
        else:
            sql = f"SELECT * FROM {tbl_name} LIMIT 5"

        print(f"[Agent 生成 SQL] {sql}")
        ok, exec_msg, result = self.execute_sql(sql, datasource_id=ds_id)
        if ok and result:
            print(f"[Agent 执行反馈] 耗时: {result.get('costMs')} ms | 返回: {result.get('totalRows')} 条")
            print(self.render_table(result.get("columns", []), result.get("rows", [])))
        else:
            print(f"[Agent 执行被拒] {exec_msg}")

    def run_full_diagnostics(self) -> None:
        """运行全套开放 API 自动化联调与安全拦截测试."""
        print("\n" + "=" * 70)
        print("          DataX-Web 外部数仓开放接口 (OpenAPI) 智能联调测试套件")
        print("=" * 70)
        sk_mask = self.client.secret_key[:4] + "****" + self.client.secret_key[-4:]
        print(f"网关基地址: {self.client.base_url}")
        print(f"认证身份 AK: {self.client.access_key} | SK: {sk_mask}\n")

        test_results: List[Tuple[str, str, bool, str]] = []

        def log_case(case_name: str, passed: bool, detail: str):
            status_text = "[ PASS ]" if passed else "[ FAIL ]"
            color_mark = "\033[92m" if passed else "\033[91m"
            reset_mark = "\033[0m"
            print(f"{color_mark}{status_text}{reset_mark} {case_name:<36} -> {detail}")
            test_results.append((case_name, status_text, passed, detail))

        # -------------------------------------------------------------
        # 测试用例 1: 正常元数据获取
        # -------------------------------------------------------------
        ok, msg, meta = self.perceiver.fetch_metadata()
        if ok and meta:
            t_count = meta.get("tableCount", 0)
            log_case("1. 基础鉴权与元数据探查", True, f"成功获取 {t_count} 张白名单表 (账号: {meta.get('accountName')})")
        else:
            log_case("1. 基础鉴权与元数据探查", False, msg)
            print("\n[!] 元数据拉取失败，请检查 AK/SK、服务端口及账号启用状态！")
            return

        tables = meta.get("tables", [])
        if not tables:
            print("[!] 当前账号无可用表白名单，跳过后续执行测试。")
            return

        target_ds_id = tables[0].get("datasourceId")
        target_tbl_name = tables[0].get("tableName")

        # -------------------------------------------------------------
        # 测试用例 2: 授权数据表正常只读查询
        # -------------------------------------------------------------
        valid_sql = f"SELECT * FROM {target_tbl_name} LIMIT 5"
        ok, msg, res = self.execute_sql(valid_sql, datasource_id=target_ds_id)
        if ok and res is not None:
            log_case("2. 授权表只读 SQL 正常执行", True, f"查询成功，耗时 {res.get('costMs')}ms，涉及表: {res.get('tables')}")
        else:
            log_case("2. 授权表只读 SQL 正常执行", False, f"执行失败: {msg}")

        # -------------------------------------------------------------
        # 测试用例 3: 签名防伪造与错误 SK 拦截
        # -------------------------------------------------------------
        fake_sk = "WrongSecretKey1234567890abcdef"
        status, bad_res = self.client.request("GET", "/api/open/v1/metadata/tables", custom_sk=fake_sk)
        if status == 401:
            log_case("3. 伪造签名拦截 (HMAC-SHA256)", True, f"成功拦截非法请求，返回: {bad_res.get('msg')}")
        else:
            log_case("3. 伪造签名拦截 (HMAC-SHA256)", False, f"未拦截！状态码: {status}, 返回: {bad_res}")

        # -------------------------------------------------------------
        # 测试用例 4: 请求时间戳防重放与防过期拦截
        # -------------------------------------------------------------
        expired_ts = OpenApiSigner.current_timestamp() - 600  # 10 分钟前
        status, exp_res = self.client.request("GET", "/api/open/v1/metadata/tables", custom_ts=expired_ts)
        if status == 401 and "过期" in str(exp_res.get("msg")):
            log_case("4. 时间戳防重放拦截 (>300s)", True, f"成功拦截超时请求: {exp_res.get('msg')}")
        else:
            log_case("4. 时间戳防重放拦截 (>300s)", False, f"未按预期拦截: 状态码 {status}, 返回: {exp_res}")

        # -------------------------------------------------------------
        # 测试用例 5: Nonce 重放攻击拦截
        # -------------------------------------------------------------
        fixed_nonce = "replay_attack_nonce_" + uuid.uuid4().hex[:8]
        # 第一次请求
        s1, r1 = self.client.request("GET", "/api/open/v1/metadata/tables", custom_nonce=fixed_nonce)
        # 第二次重复提交完全相同的 nonce
        s2, r2 = self.client.request("GET", "/api/open/v1/metadata/tables", custom_nonce=fixed_nonce)
        if s1 == 200 and s2 == 401 and "重放" in str(r2.get("msg")):
            log_case("5. Nonce 唯一性防重放拦截", True, f"二次请求成功拦截: {r2.get('msg')}")
        else:
            log_case("5. Nonce 唯一性防重放拦截", False, f"第1次: {s1}, 第2次: {s2}, msg: {r2.get('msg')}")

        # -------------------------------------------------------------
        # 测试用例 6: 高危写指令注入与 AST 拦截
        # -------------------------------------------------------------
        drop_sql = f"DROP TABLE {target_tbl_name}"
        ok, msg, _ = self.execute_sql(drop_sql, datasource_id=target_ds_id)
        if not ok and ("仅支持执行只读" in msg or "禁止" in msg):
            log_case("6. 高危写指令拦截 (DROP TABLE)", True, f"成功拦截破坏性操作: {msg}")
        else:
            log_case("6. 高危写指令拦截 (DROP TABLE)", False, f"未成功拦截！返回: {msg}")

        # -------------------------------------------------------------
        # 测试用例 7: 越权跨表访问与白名单外表拦截
        # -------------------------------------------------------------
        unauth_sql = "SELECT * FROM job_user"
        ok, msg, _ = self.execute_sql(unauth_sql, datasource_id=target_ds_id)
        if not ok and ("未获得" in msg or "安全拦截" in msg):
            log_case("7. 越权非白名单表拦截 (job_user)", True, f"成功拦截越权查询: {msg}")
        else:
            log_case("7. 越权非白名单表拦截 (job_user)", False, f"未成功拦截！返回: {msg}")

        # -------------------------------------------------------------
        # 测试用例 8: 慢查探测函数拦截 (SLEEP)
        # -------------------------------------------------------------
        sleep_sql = f"SELECT id FROM {target_tbl_name} WHERE SLEEP(5) = 0"
        ok, msg, _ = self.execute_sql(sleep_sql, datasource_id=target_ds_id)
        if not ok and ("高危函数" in msg or "禁止" in msg or "安全拦截" in msg):
            log_case("8. 高危探测函数拦截 (SLEEP)", True, f"成功拦截探测函数: {msg}")
        else:
            log_case("8. 高危探测函数拦截 (SLEEP)", False, f"未成功拦截！返回: {msg}")

        # 汇总报告
        print("\n" + "=" * 70)
        passed_count = sum(1 for _, _, p, _ in test_results if p)
        total_count = len(test_results)
        print(f"联调测试诊断汇总: 共执行 {total_count} 项安全与联调检测，通过 {passed_count}/{total_count} 项。")
        if passed_count == total_count:
            print("结论: 全部安全门禁与开放接口功能验证通过，数仓接口安全合规！")
        else:
            print("结论: 部分门禁存在异常，请检查拦截规则配置。")
        print("=" * 70 + "\n")


def main() -> None:
    """命令行统一入口."""
    parser = argparse.ArgumentParser(
        description="DataX-Web 外部数仓开放接口 (OpenAPI) 智能联调测试 Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--config", type=str, help="指定独立账号凭据文件路径 (默认自动查找 bin/config/dw_openapi_account.json)")
    parser.add_argument("--url", help="网关基地址 (覆盖配置文件中的 baseUrl)")
    parser.add_argument("--ak", help="身份 AK (覆盖配置文件中的 accessKey)")
    parser.add_argument("--sk", help="密钥 SK (覆盖配置文件中的 secretKey)")
    parser.add_argument("--test", action="store_true", help="执行全套自动化联调与安全拦截门禁诊断")
    parser.add_argument("--meta", action="store_true", help="查询并展示当前授权库表结构元数据")
    parser.add_argument("--sql", type=str, help="直接执行只读 SQL 查询")
    parser.add_argument("--ds", type=int, help="指定数据源 ID (多数据源账号必传)")
    parser.add_argument("--ask", type=str, help="自然语言意图提数查询")
    parser.add_argument("--prompt", type=str, help="根据业务问题动态生成可直接传给 AI 的完整 Prompt")
    parser.add_argument("--save-prompt", type=str, help="配合 --prompt 将生成的 Prompt 存入指定文件路径")

    args = parser.parse_args()

    # 安全加载账号配置凭据 (杜绝明文硬编码私钥)
    creds = AccountConfigLoader.load_credentials(
        config_path=args.config,
        cli_url=args.url,
        cli_ak=args.ak,
        cli_sk=args.sk
    )

    if not creds.get("accessKey") or not creds.get("secretKey"):
        print("\n" + "=" * 70)
        print("[!] 错误: 未检测到有效的 OpenAPI 认证凭据 (AK / SK)！")
        print("=" * 70)
        print("为了保障接口通信安全与私钥防泄露，请按以下方式之一配置凭据 (切勿将密钥写入 Prompt):")
        print(" 1. 独立配置文件: 复制 bin/config/dw_openapi_account.json.example 为")
        print("                  bin/config/dw_openapi_account.json 并填写 AK 与 SK;")
        print(" 2. 指定文件路径: 执行命令时追加 --config <凭据文件路径>;")
        print(" 3. 环境变量注入: 配置 DATAX_OPEN_AK 与 DATAX_OPEN_SK 环境变量。")
        print("=" * 70 + "\n")
        sys.exit(1)

    agent = WarehouseAgent(
        base_url=creds["baseUrl"],
        access_key=creds["accessKey"],
        secret_key=creds["secretKey"]
    )

    if args.prompt:
        generated_prompt = agent.build_ai_prompt(args.prompt)
        if args.save_prompt:
            with open(args.save_prompt, "w", encoding="utf-8") as f:
                f.write(generated_prompt)
            print(f"[*] Prompt 已成功保存至文件: {args.save_prompt}")
        else:
            print("\n" + "=" * 70)
            print("                 已生成的 AI 提数 Prompt (可直接发给大模型)")
            print("=" * 70)
            print(generated_prompt)
            print("=" * 70)
    elif args.test:
        agent.run_full_diagnostics()
    elif args.meta:
        agent.print_schema_summary()
    elif args.sql:
        print(f"\n[执行 SQL] {args.sql}")
        ok, msg, res = agent.execute_sql(args.sql, datasource_id=args.ds)
        if ok and res:
            print(f"执行成功 (耗时: {res.get('costMs')} ms, 共 {res.get('totalRows')} 行):")
            print(WarehouseAgent.render_table(res.get("columns", []), res.get("rows", [])))
        else:
            print(f"[!] 执行失败: {msg}")
    elif args.ask:
        agent.ask(args.ask)
    else:
        # 无参数时默认运行全自动化测试并输出提示
        agent.run_full_diagnostics()
        print("提示: 可使用 --meta 查看表结构，--sql '...' 查数据，或 --ask '...' 自然语言提数。")


if __name__ == "__main__":
    main()
