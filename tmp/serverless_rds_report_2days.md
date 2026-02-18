# Serverless + DB current-state report

- Region: `ap-northeast-1`
- Window: `2026-02-07T06:27:54Z` .. `2026-02-09T06:27:54Z` (2 days)

## API Gateway
- API: `ats-lite-api-prod` (`st70aifr22`)
- Endpoint: `https://st70aifr22.execute-api.ap-northeast-1.amazonaws.com`
- Stages: prod
- Routes: `75`
- `GET /candidates` -> `arn:aws:lambda:ap-northeast-1:195275648846:function:ats-api-prod-candidates-list`

## RDS / Aurora
- RDS instance: `ats-lite-db` (db.t4g.micro, postgres 17.6)
- Endpoint: `ats-lite-db.cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com:5432`
- PubliclyAccessible: `True`
- PerformanceInsightsEnabled: `True`
- Aurora cluster: `prod-agentkey-cluster` (aurora-postgresql 17.4)
- Cluster endpoint: `prod-agentkey-cluster.cluster-cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com`
- Reader endpoint: `prod-agentkey-cluster.cluster-ro-cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com`

## RDS Proxy
- Proxy: `prod-db-proxy` status `available`
- Endpoint: `prod-db-proxy.proxy-cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com`
- Targets: `3` (unhealthy: `2`)
  - `prod-agentkey-cluster-instance-1-ap-northeast-1d` state `UNAVAILABLE`: DBProxy Target unavailable due to an internal error
  - `prod-agentkey-cluster-instance-1` state `UNAVAILABLE`: DBProxy Target unavailable due to an internal error
- Pool config: MaxConnectionsPercent `90`, MaxIdleConnectionsPercent `45`, BorrowTimeout `120`

## DB Connections (CloudWatch)
- DatabaseConnections max: `70.0` / avg: `3.76`
- CPUUtilization max: `8.10%` / avg: `4.28%`
- FreeableMemory min: `62337024` bytes / avg: `174819020` bytes

## Lambda DB Host Usage
- `ats-lite-db.cdiqayuosm2o.ap-northeast-1.rds.amazonaws.com`: `23` functions

## Lambda Error Rate (top 12)
| function | invocations | errors | error_rate | max_conc | max_duration_ms | avg_duration_ms | timeout_s | mem_mb |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `ats-api-prod-kpi-clients` | 25 | 3 | 12.00% | 2 | 3000 | 932 | 3 | 128 |
| `ats-api-prod-kpi-targets` | 152 | 9 | 5.92% | 3 | 3000 | 329 | 3 | 128 |
| `ats-api-prod-mypage` | 20 | 1 | 5.00% | 2 | 3000 | 634 | 3 | 128 |
| `ats-api-prod-settings-screening-rules` | 85 | 4 | 4.71% | 2 | 3000 | 562 | 3 | 128 |
| `ats-api-prod-candidates-list` | 445 | 18 | 4.04% | 8 | 3000 | 559 | 3 | 128 |
| `ats-api-prod-kpi-yield` | 1942 | 77 | 3.96% | 28 | 3000 | 556 | 3 | 128 |
| `ats-api-prod-goal-settings` | 1191 | 36 | 3.02% | 5 | 3000 | 243 | 3 | 128 |
| `ats-api-prod-teleapo-logs` | 107 | 3 | 2.80% | 4 | 3000 | 460 | 3 | 128 |
| `ats-api-prod-ms-targets` | 1145 | 24 | 2.10% | 49 | 3000 | 450 | 3 | 128 |
| `ats-api-prod-members` | 407 | 1 | 0.25% | 5 | 5521 | 554 | 20 | 128 |
| `ats-api-prod-auth-login` | 24 | 0 | 0.00% | 2 | 803 | 389 | 3 | 128 |
| `ats-api-prod-auth-me` | 70 | 0 | 0.00% | 2 | 479 | 49 | 3 | 128 |

## CloudWatch Log Groups
- Existing prod log groups (prefix `/aws/lambda/ats-api-prod-`): `2`
- Expected prod lambda log groups: `23`
- Missing log groups: `21`

Missing (first 30):
- `/aws/lambda/ats-api-prod-auth-login`
- `/aws/lambda/ats-api-prod-auth-me`
- `/aws/lambda/ats-api-prod-candidates-detail`
- `/aws/lambda/ats-api-prod-clients-create`
- `/aws/lambda/ats-api-prod-goal-settings`
- `/aws/lambda/ats-api-prod-kintone-sync`
- `/aws/lambda/ats-api-prod-kpi-ads`
- `/aws/lambda/ats-api-prod-kpi-ads-detail`
- `/aws/lambda/ats-api-prod-kpi-clients`
- `/aws/lambda/ats-api-prod-kpi-clients-edit`
- `/aws/lambda/ats-api-prod-kpi-targets`
- `/aws/lambda/ats-api-prod-kpi-teleapo`
- `/aws/lambda/ats-api-prod-kpi-yield`
- `/aws/lambda/ats-api-prod-kpi-yield-daily`
- `/aws/lambda/ats-api-prod-kpi-yield-personal`
- `/aws/lambda/ats-api-prod-members`
- `/aws/lambda/ats-api-prod-ms-targets`
- `/aws/lambda/ats-api-prod-mypage`
- `/aws/lambda/ats-api-prod-teleapo-candidate-contact`
- `/aws/lambda/ats-api-prod-teleapo-log-create`
- `/aws/lambda/ats-api-prod-teleapo-logs`

