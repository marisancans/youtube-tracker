# Production Deployment Guide

## Overview

YouTube Detox consists of:
1. **Chrome Extension** - Distributed via Chrome Web Store
2. **Backend API** - Self-hosted FastAPI service
3. **PostgreSQL Database** - User data storage

---

## Backend Deployment

### Option 1: Docker Compose (Recommended)

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    build: ./packages/backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:${DB_PASSWORD}@db:5432/ytdetox
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - REQUIRE_AUTH=true
      - CORS_ORIGINS=["chrome-extension://${EXTENSION_ID}"]
      - RATE_LIMIT=100/minute
      - RATE_LIMIT_SYNC=20/minute
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=ytdetox
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

```bash
# Deploy
export DB_PASSWORD="your-secure-password"
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export EXTENSION_ID="your-chrome-extension-id"

docker-compose -f docker-compose.prod.yml up -d

# Run migrations
docker-compose exec api alembic upgrade head
```

### Option 2: Railway/Render/Fly.io

**Railway:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
cd packages/backend
railway init
railway add --database postgresql
railway up
```

**Render:**
1. Create new Web Service → Connect repo
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add PostgreSQL database
5. Set environment variables

### Option 3: VPS (Ubuntu)

```bash
# Install dependencies
sudo apt update
sudo apt install -y python3.11 python3.11-venv postgresql nginx certbot

# Setup database
sudo -u postgres createdb ytdetox
sudo -u postgres psql -c "CREATE USER ytdetox WITH PASSWORD 'your-password';"
sudo -u postgres psql -c "GRANT ALL ON DATABASE ytdetox TO ytdetox;"

# Clone and setup
git clone https://github.com/marisancans/youtube-tracker.git
cd youtube-tracker/packages/backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env
cat > .env << EOF
DATABASE_URL=postgresql+asyncpg://ytdetox:your-password@localhost:5432/ytdetox
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
REQUIRE_AUTH=true
CORS_ORIGINS=["chrome-extension://your-extension-id"]
EOF

# Run migrations
alembic upgrade head

# Setup systemd service
sudo cat > /etc/systemd/system/ytdetox.service << EOF
[Unit]
Description=YouTube Detox API
After=network.target postgresql.service

[Service]
User=www-data
WorkingDirectory=/path/to/youtube-tracker/packages/backend
Environment=PATH=/path/to/youtube-tracker/packages/backend/venv/bin
ExecStart=/path/to/youtube-tracker/packages/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable ytdetox
sudo systemctl start ytdetox

# Setup nginx reverse proxy
sudo cat > /etc/nginx/sites-available/ytdetox << EOF
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/ytdetox /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL with Let's Encrypt
sudo certbot --nginx -d api.yourdomain.com
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `REQUIRE_AUTH` | ✅ | Set `true` for production |
| `CORS_ORIGINS` | ✅ | Allowed origins (extension ID) |
| `RATE_LIMIT` | ❌ | Default: `100/minute` |
| `RATE_LIMIT_SYNC` | ❌ | Default: `20/minute` |
| `MAX_REQUEST_SIZE_MB` | ❌ | Default: `5` |
| `DEBUG` | ❌ | Default: `false` |

---

## Chrome Extension Publishing

### 1. Build for Production

```bash
cd packages/extension
pnpm build
```

### 2. Update manifest.json

```json
{
  "name": "YouTube Detox",
  "version": "1.0.0",
  "description": "Gradually reduce YouTube addiction with awareness and friction",
  "oauth2": {
    "client_id": "YOUR_PRODUCTION_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["openid", "email", "profile"]
  }
}
```

### 3. Create ZIP

```bash
cd packages/extension/dist
zip -r ../youtube-detox-v1.0.0.zip .
```

### 4. Submit to Chrome Web Store

1. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay $5 one-time developer fee
3. Create new item → Upload ZIP
4. Fill in:
   - Screenshots (1280x800 or 640x400)
   - Detailed description
   - Privacy policy URL
   - Category: Productivity
5. Submit for review (1-3 days)

### 5. Get Extension ID

After publishing, your extension ID will be shown in the dashboard.
Update backend `CORS_ORIGINS` with this ID.

---

## Google OAuth Setup

### 1. Create OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create new OAuth 2.0 Client ID
3. Application type: **Chrome Extension**
4. Authorized JavaScript origins: Leave empty for extensions
5. Note the Client ID

### 2. Configure Extension

Update `packages/extension/public/manifest.json`:
```json
{
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["openid", "email", "profile"]
  }
}
```

### 3. Configure Backend

Set `GOOGLE_CLIENT_ID` environment variable to the same client ID.

---

## Database Migrations

```bash
# Create new migration
cd packages/backend
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

---

## Monitoring

### Health Check

```bash
curl https://api.yourdomain.com/health
# {"status":"ok","version":"0.4.0","auth_required":true}
```

### Logs

```bash
# Docker
docker-compose logs -f api

# Systemd
journalctl -u ytdetox -f
```

### Database Backup

```bash
# Backup
pg_dump -U postgres ytdetox > backup_$(date +%Y%m%d).sql

# Restore
psql -U postgres ytdetox < backup_20250210.sql
```

---

## Security Checklist

- [ ] `REQUIRE_AUTH=true`
- [ ] `CORS_ORIGINS` restricted to extension ID only
- [ ] HTTPS enabled (SSL certificate)
- [ ] Database password is strong and unique
- [ ] Regular database backups configured
- [ ] Rate limiting enabled
- [ ] Firewall: only ports 80/443 open
- [ ] Log monitoring set up

---

## Troubleshooting

### "Invalid token" errors
- Ensure `GOOGLE_CLIENT_ID` matches extension's manifest
- Token might be expired - extension should auto-refresh

### CORS errors
- Check `CORS_ORIGINS` includes your extension ID
- Format: `chrome-extension://abcdefghijklmnop`

### Database connection failed
- Check `DATABASE_URL` format
- Ensure PostgreSQL is running
- Check firewall allows connection

### Rate limit exceeded
- Wait 1 minute and retry
- Check if user is making too many requests
