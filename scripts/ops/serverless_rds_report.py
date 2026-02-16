#!/usr/bin/env python3
"""
Serverless (Lambda + RDS/Aurora) current-state report.
Outputs a Markdown report to stdout.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple


def _run_aws(args: List[str]) -> str:
    p = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"aws command failed: {' '.join(args)}\n{p.stderr.strip()}")
    return p.stdout


def aws_json(args: List[str]) -> Any:
    out = _run_aws(args)
    try:
        return json.loads(out)
    except Exception as e:
        raise RuntimeError(f"failed to parse json for aws command: {' '.join(args)}\n{out[:2000]}") from e


def iso_utc(ts: dt.datetime) -> str:
    return ts.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sum_datapoints(j: Dict[str, Any], key: str) -> float:
    dps = j.get("Datapoints") or []
    return float(sum(float(dp.get(key, 0.0) or 0.0) for dp in dps))


def max_datapoints(j: Dict[str, Any], key: str) -> Optional[float]:
    dps = j.get("Datapoints") or []
    vals = [float(dp.get(key)) for dp in dps if dp.get(key) is not None]
    return max(vals) if vals else None


def min_datapoints(j: Dict[str, Any], key: str) -> Optional[float]:
    dps = j.get("Datapoints") or []
    vals = [float(dp.get(key)) for dp in dps if dp.get(key) is not None]
    return min(vals) if vals else None


def avg_datapoints(j: Dict[str, Any], key: str) -> Optional[float]:
    dps = j.get("Datapoints") or []
    vals = [float(dp.get(key)) for dp in dps if dp.get(key) is not None]
    return (sum(vals) / len(vals)) if vals else None


def cw_get_metric_statistics(
    *,
    region: str,
    namespace: str,
    metric: str,
    dims: List[Tuple[str, str]],
    start: dt.datetime,
    end: dt.datetime,
    period: int,
    statistics: List[str],
) -> Dict[str, Any]:
    dim_args: List[str] = []
    for k, v in dims:
        dim_args.extend(["Name=" + k + ",Value=" + v])
    args = [
        "aws",
        "cloudwatch",
        "get-metric-statistics",
        "--region",
        region,
        "--namespace",
        namespace,
        "--metric-name",
        metric,
        "--dimensions",
        *dim_args,
        "--start-time",
        iso_utc(start),
        "--end-time",
        iso_utc(end),
        "--period",
        str(period),
        "--statistics",
        *statistics,
        "--output",
        "json",
    ]
    return aws_json(args)


@dataclass(frozen=True)
class LambdaMetrics:
    fn: str
    invocations: int
    errors: int
    error_rate_pct: float
    max_concurrent: Optional[float]
    max_duration_ms: Optional[float]
    avg_duration_ms: Optional[float]


def get_lambda_metrics(*, region: str, fn: str, start: dt.datetime, end: dt.datetime) -> LambdaMetrics:
    inv_j = cw_get_metric_statistics(
        region=region,
        namespace="AWS/Lambda",
        metric="Invocations",
        dims=[("FunctionName", fn)],
        start=start,
        end=end,
        period=3600,
        statistics=["Sum"],
    )
    err_j = cw_get_metric_statistics(
        region=region,
        namespace="AWS/Lambda",
        metric="Errors",
        dims=[("FunctionName", fn)],
        start=start,
        end=end,
        period=3600,
        statistics=["Sum"],
    )
    inv = int(round(sum_datapoints(inv_j, "Sum")))
    err = int(round(sum_datapoints(err_j, "Sum")))
    rate = (err / inv * 100.0) if inv else 0.0

    conc_j = cw_get_metric_statistics(
        region=region,
        namespace="AWS/Lambda",
        metric="ConcurrentExecutions",
        dims=[("FunctionName", fn)],
        start=start,
        end=end,
        period=600,
        statistics=["Maximum"],
    )
    max_conc = max_datapoints(conc_j, "Maximum")

    dur_j = cw_get_metric_statistics(
        region=region,
        namespace="AWS/Lambda",
        metric="Duration",
        dims=[("FunctionName", fn)],
        start=start,
        end=end,
        period=600,
        statistics=["Average", "Maximum"],
    )
    max_dur = max_datapoints(dur_j, "Maximum")
    avg_dur = avg_datapoints(dur_j, "Average")

    return LambdaMetrics(
        fn=fn,
        invocations=inv,
        errors=err,
        error_rate_pct=rate,
        max_concurrent=max_conc,
        max_duration_ms=max_dur,
        avg_duration_ms=avg_dur,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default=os.environ.get("AWS_REGION") or "ap-northeast-1")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--lambda-prefix", default="ats-api-prod-")
    ap.add_argument("--api-id", default="st70aifr22")
    ap.add_argument("--rds-instance-id", default="ats-lite-db")
    ap.add_argument("--rds-proxy-name", default="prod-db-proxy")
    ap.add_argument("--aurora-cluster-id", default="prod-agentkey-cluster")
    args = ap.parse_args()

    region = args.region
    end = dt.datetime.now(dt.timezone.utc)
    start = end - dt.timedelta(days=max(args.days, 1))

    # --- API Gateway (v2) ---
    api = None
    try:
        apis = aws_json(["aws", "apigatewayv2", "get-apis", "--region", region, "--output", "json"]).get("Items") or []
        api = next((a for a in apis if a.get("ApiId") == args.api_id), None)
    except Exception:
        api = None

    stages = []
    routes = []
    integrations = []
    if api:
        try:
            stages = aws_json(["aws", "apigatewayv2", "get-stages", "--region", region, "--api-id", api["ApiId"], "--output", "json"]).get("Items") or []
            routes = aws_json(["aws", "apigatewayv2", "get-routes", "--region", region, "--api-id", api["ApiId"], "--output", "json"]).get("Items") or []
            integrations = aws_json(["aws", "apigatewayv2", "get-integrations", "--region", region, "--api-id", api["ApiId"], "--output", "json"]).get("Items") or []
        except Exception:
            stages, routes, integrations = [], [], []

    integ_by_id = {i.get("IntegrationId"): i for i in integrations if i.get("IntegrationId")}

    # --- Lambda functions ---
    funcs_j = aws_json(["aws", "lambda", "list-functions", "--region", region, "--output", "json"])
    funcs = [f.get("FunctionName") for f in (funcs_j.get("Functions") or []) if (f.get("FunctionName") or "").startswith(args.lambda_prefix)]
    funcs = [f for f in funcs if f]
    funcs.sort()

    lambda_cfgs: Dict[str, Any] = {}
    for fn in funcs:
        cfg = aws_json(["aws", "lambda", "get-function-configuration", "--region", region, "--function-name", fn, "--output", "json"])
        lambda_cfgs[fn] = cfg

    # --- Log groups existence check ---
    lg_prefix = f"/aws/lambda/{args.lambda_prefix}"
    lgs_j = aws_json(["aws", "logs", "describe-log-groups", "--region", region, "--log-group-name-prefix", lg_prefix, "--output", "json"])
    existing_lgs = set(lg.get("logGroupName") for lg in (lgs_j.get("logGroups") or []) if lg.get("logGroupName"))
    expected_lgs = {f"/aws/lambda/{fn}" for fn in funcs}
    missing_lgs = sorted(expected_lgs - existing_lgs)

    # --- RDS instances / clusters / proxy ---
    dbi = aws_json(["aws", "rds", "describe-db-instances", "--region", region, "--output", "json"]).get("DBInstances") or []
    target_dbi = next((i for i in dbi if i.get("DBInstanceIdentifier") == args.rds_instance_id), None)

    clusters = aws_json(["aws", "rds", "describe-db-clusters", "--region", region, "--output", "json"]).get("DBClusters") or []
    target_cluster = next((c for c in clusters if c.get("DBClusterIdentifier") == args.aurora_cluster_id), None)

    proxies = aws_json(["aws", "rds", "describe-db-proxies", "--region", region, "--output", "json"]).get("DBProxies") or []
    proxy = next((p for p in proxies if p.get("DBProxyName") == args.rds_proxy_name), None)
    proxy_targets = None
    proxy_tgs = None
    if proxy:
        proxy_targets = aws_json(["aws", "rds", "describe-db-proxy-targets", "--region", region, "--db-proxy-name", proxy["DBProxyName"], "--output", "json"]).get("Targets") or []
        proxy_tgs = aws_json(["aws", "rds", "describe-db-proxy-target-groups", "--region", region, "--db-proxy-name", proxy["DBProxyName"], "--output", "json"]).get("TargetGroups") or []

    # --- CloudWatch: DB metrics ---
    db_conn = None
    db_cpu = None
    db_mem = None
    if target_dbi:
        dims = [("DBInstanceIdentifier", target_dbi["DBInstanceIdentifier"])]
        db_conn = cw_get_metric_statistics(
            region=region,
            namespace="AWS/RDS",
            metric="DatabaseConnections",
            dims=dims,
            start=start,
            end=end,
            period=600,
            statistics=["Average", "Maximum"],
        )
        db_cpu = cw_get_metric_statistics(
            region=region,
            namespace="AWS/RDS",
            metric="CPUUtilization",
            dims=dims,
            start=start,
            end=end,
            period=600,
            statistics=["Average", "Maximum"],
        )
        db_mem = cw_get_metric_statistics(
            region=region,
            namespace="AWS/RDS",
            metric="FreeableMemory",
            dims=dims,
            start=start,
            end=end,
            period=600,
            statistics=["Average", "Minimum"],
        )

    # --- Lambda metrics (top error rate) ---
    lm: List[LambdaMetrics] = []
    for fn in funcs:
        try:
            lm.append(get_lambda_metrics(region=region, fn=fn, start=start, end=end))
        except Exception:
            # Keep report resilient; we can still print config/infra.
            lm.append(LambdaMetrics(fn=fn, invocations=0, errors=0, error_rate_pct=0.0, max_concurrent=None, max_duration_ms=None, avg_duration_ms=None))

    lm_sorted = sorted(lm, key=lambda x: (x.error_rate_pct, x.errors), reverse=True)

    # --- DB host usage ---
    db_hosts: Dict[str, int] = {}
    for fn, cfg in lambda_cfgs.items():
        host = ((cfg.get("Environment") or {}).get("Variables") or {}).get("DB_HOST") or ""
        db_hosts[host] = db_hosts.get(host, 0) + 1

    # --- Output Markdown ---
    print(f"# Serverless + DB current-state report")
    print()
    print(f"- Region: `{region}`")
    print(f"- Window: `{iso_utc(start)}` .. `{iso_utc(end)}` ({args.days} days)")
    print()

    print("## API Gateway")
    if api:
        print(f"- API: `{api.get('Name')}` (`{api.get('ApiId')}`)")
        print(f"- Endpoint: `{api.get('ApiEndpoint')}`")
        print(f"- Stages: {', '.join(sorted(s.get('StageName','?') for s in stages)) or '-'}")
        print(f"- Routes: `{len(routes)}`")
        # Show /candidates integration
        cand_route = next((r for r in routes if r.get("RouteKey") == "GET /candidates"), None)
        if cand_route:
            target = cand_route.get("Target") or ""
            integ_id = target.split("/")[-1] if "/" in target else ""
            integ = integ_by_id.get(integ_id) or {}
            uri = integ.get("IntegrationUri") or ""
            print(f"- `GET /candidates` -> `{uri}`")
    else:
        print("- (not found / not accessible)")
    print()

    print("## RDS / Aurora")
    if target_dbi:
        ep = (target_dbi.get("Endpoint") or {}).get("Address") or ""
        print(f"- RDS instance: `{target_dbi.get('DBInstanceIdentifier')}` ({target_dbi.get('DBInstanceClass')}, {target_dbi.get('Engine')} {target_dbi.get('EngineVersion')})")
        print(f"- Endpoint: `{ep}:{(target_dbi.get('Endpoint') or {}).get('Port')}`")
        print(f"- PubliclyAccessible: `{target_dbi.get('PubliclyAccessible')}`")
        print(f"- PerformanceInsightsEnabled: `{target_dbi.get('PerformanceInsightsEnabled')}`")
    else:
        print(f"- RDS instance `{args.rds_instance_id}` not found")
    if target_cluster:
        print(f"- Aurora cluster: `{target_cluster.get('DBClusterIdentifier')}` ({target_cluster.get('Engine')} {target_cluster.get('EngineVersion')})")
        print(f"- Cluster endpoint: `{target_cluster.get('Endpoint')}`")
        print(f"- Reader endpoint: `{target_cluster.get('ReaderEndpoint')}`")
    else:
        print(f"- Aurora cluster `{args.aurora_cluster_id}` not found (or not used)")
    print()

    print("## RDS Proxy")
    if proxy:
        print(f"- Proxy: `{proxy.get('DBProxyName')}` status `{proxy.get('Status')}`")
        print(f"- Endpoint: `{proxy.get('Endpoint')}`")
        if proxy_targets is not None:
            bad = [t for t in proxy_targets if (t.get('TargetHealth') or {}).get('State') not in (None, 'AVAILABLE')]
            print(f"- Targets: `{len(proxy_targets)}` (unhealthy: `{len(bad)}`)")
            for t in bad[:5]:
                th = t.get("TargetHealth") or {}
                rid = t.get("RdsResourceId") or t.get("Endpoint") or "?"
                print(f"  - `{rid}` state `{th.get('State')}`: {th.get('Description')}")
        if proxy_tgs:
            cfg = (proxy_tgs[0].get("ConnectionPoolConfig") or {}) if proxy_tgs else {}
            print(f"- Pool config: MaxConnectionsPercent `{cfg.get('MaxConnectionsPercent')}`, MaxIdleConnectionsPercent `{cfg.get('MaxIdleConnectionsPercent')}`, BorrowTimeout `{cfg.get('ConnectionBorrowTimeout')}`")
    else:
        print(f"- Proxy `{args.rds_proxy_name}` not found")
    print()

    print("## DB Connections (CloudWatch)")
    if db_conn:
        max_conn = max_datapoints(db_conn, "Maximum")
        avg_conn = avg_datapoints(db_conn, "Average")
        max_cpu = max_datapoints(db_cpu or {}, "Maximum") if db_cpu else None
        avg_cpu = avg_datapoints(db_cpu or {}, "Average") if db_cpu else None
        min_mem = min_datapoints(db_mem or {}, "Minimum") if db_mem else None
        avg_mem = avg_datapoints(db_mem or {}, "Average") if db_mem else None
        print(f"- DatabaseConnections max: `{max_conn}` / avg: `{avg_conn:.2f}`" if avg_conn is not None else f"- DatabaseConnections max: `{max_conn}`")
        if max_cpu is not None and avg_cpu is not None:
            print(f"- CPUUtilization max: `{max_cpu:.2f}%` / avg: `{avg_cpu:.2f}%`")
        if min_mem is not None and avg_mem is not None:
            print(f"- FreeableMemory min: `{int(min_mem)}` bytes / avg: `{int(avg_mem)}` bytes")
    else:
        print("- (no data)")
    print()

    print("## Lambda DB Host Usage")
    for host, cnt in sorted(db_hosts.items(), key=lambda kv: kv[1], reverse=True):
        key = host if host else "(empty)"
        print(f"- `{key}`: `{cnt}` functions")
    print()

    print("## Lambda Error Rate (top 12)")
    print("| function | invocations | errors | error_rate | max_conc | max_duration_ms | avg_duration_ms | timeout_s | mem_mb |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for m in lm_sorted[:12]:
        cfg = lambda_cfgs.get(m.fn) or {}
        timeout = cfg.get("Timeout")
        mem = cfg.get("MemorySize")
        print(
            f"| `{m.fn}` | {m.invocations} | {m.errors} | {m.error_rate_pct:.2f}% | "
            f"{'' if m.max_concurrent is None else f'{m.max_concurrent:.0f}'} | "
            f"{'' if m.max_duration_ms is None else f'{m.max_duration_ms:.0f}'} | "
            f"{'' if m.avg_duration_ms is None else f'{m.avg_duration_ms:.0f}'} | "
            f"{timeout} | {mem} |"
        )
    print()

    print("## CloudWatch Log Groups")
    print(f"- Existing prod log groups (prefix `{lg_prefix}`): `{len(existing_lgs)}`")
    print(f"- Expected prod lambda log groups: `{len(expected_lgs)}`")
    print(f"- Missing log groups: `{len(missing_lgs)}`")
    if missing_lgs:
        print()
        print("Missing (first 30):")
        for lg in missing_lgs[:30]:
            print(f"- `{lg}`")
    print()

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
