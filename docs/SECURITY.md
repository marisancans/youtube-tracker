# Security Documentation

## Authentication

### Google OAuth 2.0
The backend uses Google OAuth ID tokens for authentication:

1. **Extension** gets token via `chrome.identity.getAuthToken()`
2. **Backend** verifies token with Google's OAuth2 API
3. Token verification is cached (5 min TTL) to reduce API calls

### Development Mode
Set `REQUIRE_AUTH=false` in `.env` to disable OAuth verification.
In dev mode, the `X-User-Id` header is used directly.

## Rate Limiting

Using [slowapi](https://github.com/laurentS/slowapi) (based on Flask-Limiter):

| Endpoint | Limit |
|----------|-------|
| `/sync` (POST) | 20/minute per user |
| `/sync/videos` (GET) | 100/minute per user |
| `/sync/stats/*` (GET) | 100/minute per user |
| `/health`, `/` | 60/minute per IP |

Rate limit key: User ID (from token) > IP address fallback

## Payload Limits

- **Max request size**: 5 MB
- **Max video sessions per sync**: 200
- **Max events per type**: 1000
- **Max productive URLs**: 100

## Input Validation

### Pydantic Models
All input validated with Pydantic v2:
- String length limits (e.g., `title: max 500 chars`)
- Numeric ranges (e.g., `watchedSeconds: 0-86400`)
- URL format validation
- Required field enforcement

### SQL Injection Protection
- SQLAlchemy ORM with parameterized queries
- No raw SQL string interpolation
- All user input goes through ORM methods

### String Sanitization
`sanitize_string()` function:
- Removes null bytes
- Strips control characters
- Truncates to max length

## CORS Policy

Restricted origins:
```python
cors_origins = [
    "chrome-extension://*",
    "http://localhost:*",
    "http://127.0.0.1:*",
]
```

For production, restrict to your specific extension ID:
```
chrome-extension://abcdefghijklmnopqrstuvwxyz
```

## Security Headers

All responses include:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

## Soft Delete

Productive URLs use soft delete (`deleted_at` field):
- Data can be recovered if needed
- Prevents accidental permanent deletion
- Supports cross-device sync conflicts

## Recommendations

### Production Deployment
1. Set `REQUIRE_AUTH=true`
2. Configure `GOOGLE_CLIENT_ID`
3. Restrict `CORS_ORIGINS` to specific extension ID
4. Use HTTPS only
5. Set up database backups
6. Enable PostgreSQL connection pooling
7. Consider adding:
   - Request ID logging
   - Prometheus metrics
   - Sentry error tracking

### Extension Security
1. Only request necessary permissions in `manifest.json`
2. Use `chrome.identity` for OAuth (not custom flows)
3. Store sensitive data in `chrome.storage.local` (not sync)
4. Content scripts run in isolated world

## Incident Response

If you suspect a security issue:
1. Check rate limit logs for abuse patterns
2. Review recent user registrations
3. Check for unusual payload sizes
4. Monitor database for anomalies

## Updating Dependencies

Regularly update:
```bash
pip install --upgrade fastapi sqlalchemy slowapi google-auth
```

Check for CVEs:
```bash
pip-audit
```
