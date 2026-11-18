# Spec Delta

## MODIFIED Requirements

### Requirement: Full Audit Logging and Rate Limiting
The system SHALL record audit logs for every API call—including caller identity, client IP, target datasource, executed SQL, execution duration, returned rows, and result status—and enforce IP blacklist priority checks, IP whitelist checks, rate limiting, and failure cooldown.

#### Scenario: Complete audit record generated on query completion
- **WHEN** an API call completes (whether successful, failed, or blocked by AST/table/IP security rules)
- **THEN** system asynchronously records an audit log entry into `job_api_log` with execution metrics and status

#### Scenario: Request rate limit exceeded
- **WHEN** an account exceeds its configured QPS limit or triggers excessive consecutive security errors
- **THEN** system rejects subsequent calls with a rate-limiting or cooldown error code

#### Scenario: Request blocked by IP blacklist recorded in audit log
- **WHEN** an incoming OpenAPI request is rejected by the gateway due to matching an active IP blacklist rule
- **THEN** system rejects the request with HTTP 403 and asynchronously writes an audit log entry with `status = 2` (安全拦截) and the blacklist interception reason
