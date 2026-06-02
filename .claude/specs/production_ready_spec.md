# Production Readiness & AWS Deployment Specification

## Overview

This spec outlines all changes needed to make the Gmail Mailbox Analyzer production-ready and deployable to AWS. The current app works locally with a Vite dev server proxying to Express. In production, Express serves the built SPA directly on a single port with hardened security, proper logging, and process management.

---

## Part A: Production-Ready Local Changes

These changes make the app run locally the same way it would run on AWS — no Vite dev server, built static files, production middleware.

### A1. Production Dependencies (package.json)

| Package | Purpose |
|---|---|
| `helmet` | Security headers (X-Frame-Options, XSS, HSTS, etc.) |
| `morgan` | HTTP request logging (combined format in production) |
| `compression` | Gzip/deflate response compression |
| `express-rate-limit` | Rate limiting on API endpoints |

Install: `npm install helmet morgan compression express-rate-limit`

### A2. Server Entry Point Changes (server/index.js)

Add production middleware in this order:

```
1. helmet()                — Security headers (prod only or always)
2. compression()           — Response compression
3. cors()                  — Locked down in production
4. morgan('combined')      — HTTP logging (prod), 'dev' (dev)
5. express.json()           — Body parsing
6. express.urlencoded()     — Body parsing
7. cookieParser()           — Cookie parsing
8. rateLimiter             — API rate limiting (applied to /api/*)
```

**CORS Configuration:**
- Development: `cors()` (allow all — Vite proxy handles it)
- Production: `cors({ origin: process.env.APP_URL || 'https://yourdomain.com', credentials: true })`

**Rate Limiting:**
- Apply to `/api/*` routes: `100 requests per 15 minutes` per IP
- Skip in dev or use higher limit

**Static File Serving (already exists):**
- Remains the same — serve `client/dist/` in production with SPA catch-all

**Error Handler:**
- Add a `NODE_ENV` check — in production, don't leak stack traces
- Keep existing error code mapping (CREDENTIALS_MISSING → 503, AUTH_REQUIRED → 401)

### A3. Auth Module Changes (server/auth.js)

**Configurable Redirect URI:**
- Currently hardcoded: `REDIRECT_URI = 'http://localhost:3000/oauth2callback'`
- New: check `process.env.REDIRECT_URI || process.env.APP_URL + '/oauth2callback' || 'http://localhost:3000/oauth2callback'`
- The `APP_URL` env var represents the public-facing URL (e.g., `https://analyzer.example.com`)

**Env-var Based Credentials (for AWS):**
- Currently: reads `credentials.json` from project root
- New: also support `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars
- Priority: `credentials.json` → `GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET` env vars → throw CREDENTIALS_MISSING
- This eliminates the need to store credentials.json on AWS servers

**Better Error Messages:**
- Include context about which credential source failed

### A4. Auth Route Changes (server/routes/auth.routes.js)

**Dynamic Cookie Security:**
- Currently: `secure: false, sameSite: 'lax'`
- Production: `secure: true, sameSite: 'strict'`
- Dev: `secure: false, sameSite: 'lax'`
- Use `process.env.NODE_ENV === 'production'` to switch

**OAuth Callback Redirects:**
- Currently: checks `NODE_ENV` to decide between `http://localhost:5173/` and `/`
- This logic stays, but the dev redirect URL should be configurable

### A5. Environment Variables (.env.example)

Add to the existing config:

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3000 | Express server port |
| `FETCH_LIMIT` | 500 | Number of emails to fetch |
| `NODE_ENV` | `development` | Runtime environment |
| `APP_URL` | — | Public-facing URL (production only) |
| `REDIRECT_URI` | — | OAuth redirect URI (overrides APP_URL derivation) |
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID (for AWS) |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret (for AWS) |
| `CORS_ORIGIN` | — | Allowed CORS origin (defaults to APP_URL in production) |
| `RATE_LIMIT_WINDOW` | 15 | Rate limit window in minutes |
| `RATE_LIMIT_MAX` | 100 | Max requests per window per IP |

### A6. PM2 Process Management (ecosystem.config.js)

Create `ecosystem.config.js` in project root:

```javascript
module.exports = {
  apps: [{
    name: 'inbox-analyzer',
    script: 'server/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    max_memory_restart: '300M',
  }],
};
```

### A7. Dockerfile (for ECS or EB Docker deployment)

Create `Dockerfile` in project root for containerized deployment:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY client/package*.json client/
RUN cd client && npm ci
COPY client/ client/
RUN cd client && npm run build

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server/ server/
COPY --from=builder /app/client/dist client/dist
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server/index.js"]
```

Multi-stage: build the client in stage 1, then copy only what's needed into a slim production image.

---

## Part B: Google Cloud Console Changes

Before deploying to any production URL:

1. **Change OAuth app type** from "Desktop" to **"Web Application"**
2. **Add authorized redirect URIs** in Google Cloud Console:
   - `https://yourdomain.com/oauth2callback`
   - `http://localhost:3000/oauth2callback` (for local testing)
3. **Add authorized JavaScript origins:**
   - `https://yourdomain.com`
   - `http://localhost:3000`
4. **Download new credentials** as `credentials.json` (or use the client ID/secret as env vars on AWS)

**Important:** The redirect URI must match exactly. A trailing slash mismatch or protocol difference (http vs https) will cause `redirect_uri_mismatch` errors.

---

## Part C: AWS Deployment — ECS Fargate (Recommended)

**Why Fargate over Elastic Beanstalk for this project:**
- **No idle cost** — Fargate charges only when the container runs; EB pays for an always-on EC2 instance even when nobody is using the app
- **Immutable deployments** — push a Docker image, never worry about OS drift or config skew
- **Docker portability** — the same image runs locally, on your CI server, and in production
- **Cleaner debugging** — no EB abstraction layer to fight when something breaks

### C1. Infrastructure Architecture

```
User ── HTTPS ── Route 53 ── ALB (ACM SSL) ── ECS Fargate (port 3000)
                                                    │
                                              CloudWatch Logs
                                                    │
                                           (no database — all data
                                            fetched live from Gmail API)
```

**Key resources:**
- **ECR** — stores the Docker image
- **ECS cluster** — Fargate launch type
- **Task definition** — CPU/Memory, env vars, Secrets Manager references
- **Service** — desired count 1, ALB target group
- **ALB** — HTTPS listener with ACM cert, health check to `/auth/status`
- **Route 53** — A record alias to ALB
- **CloudWatch Logs** — container log streaming, 7-day retention
- **Secrets Manager** — stores `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### C2. CloudFormation / CDK Template

Use AWS CDK (TypeScript) for infrastructure-as-code. Creates everything except the domain/SSL cert initial setup:

**Key CDK stack resources:**
- ECR repository
- ECS Fargate task definition + service
- ALB + HTTPS listener + target group
- CloudWatch log group
- IAM roles (task execution + task role)
- Security groups (ALB → Fargate on 3000)

### C3. Fargate Task Definition

Key configuration:

| Setting | Value |
|---|---|
| Launch type | Fargate |
| OS | Linux/X86_64 |
| CPU | 0.25 vCPU (256) |
| Memory | 0.5 GB (512) |
| Desired count | 1 |
| Health check path | `/auth/status` |
| Health check grace period | 60s |
| Log driver | awslogs |

**Environment variables** (set in task definition, never in code):
- `NODE_ENV=production`
- `PORT=3000`
- `APP_URL=https://yourdomain.com`
- `REDIRECT_URI=https://yourdomain.com/oauth2callback`
- `FETCH_LIMIT=500`

**Secrets** (referenced from AWS Secrets Manager in task definition):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### C4. Docker Image Lifecycle

```
Developer pushes to main
    │
GitHub Actions:
    ├── Builds Docker image (multi-stage)
    ├── Pushes to ECR
    └── Forces ECS Fargate to restart with new image
```

### C5. SSL / Domain

| Step | Service | Action |
|---|---|---|
| 1 | Route 53 | Create hosted zone for your domain |
| 2 | ACM | Request public SSL cert, DNS-validate via Route 53 |
| 3 | ALB | Add HTTPS listener (port 443), attach cert |
| 4 | ALB | Add HTTP→HTTPS redirect rule |
| 5 | Route 53 | Create A record alias → ALB DNS name |

### C6. GitHub Actions CI/CD

Create `.github/workflows/deploy.yml`:

```yaml
name: Build and Deploy to ECS Fargate
on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: inbox-analyzer
  ECS_SERVICE: inbox-analyzer-service
  ECS_CLUSTER: inbox-analyzer-cluster
  CONTAINER_NAME: inbox-analyzer

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and tag image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Push image to ECR
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Deploy to ECS Fargate
        run: |
          aws ecs update-service \
            --cluster ${{ env.ECS_CLUSTER }} \
            --service ${{ env.ECS_SERVICE }} \
            --force-new-deployment
```

### C7. Alternative: EC2 + PM2 (Cheapest, ~$5/mo)

For maximum cost savings on a single-user app:

1. Launch Amazon Linux 2023 t3a.nano (~$4.50/mo)
2. Install Docker, pull image from ECR or `git clone` + `npm ci`
3. Run container or use PM2: `pm2 start ecosystem.config.js`
4. Nginx reverse proxy + certbot for Let's Encrypt SSL
5. Caveat: manual OS updates, no auto-scaling

**When to choose this:** You want zero ongoing AWS costs beyond the EC2 instance. For a personal tool accessed by only you, this is the most economical.

---

## Part D: Security Considerations

| Area | Implementation |
|---|---|
| **HTTPS** | ALB with ACM cert (EB/ECS) or Nginx + certbot (EC2) |
| **Security Headers** | helmet.js (X-Frame-Options, XSS, HSTS, content-type nosniff) |
| **Rate Limiting** | express-rate-limit on /api/* endpoints |
| **CORS** | Locked to production domain in production |
| **Cookie Security** | httpOnly + secure + sameSite:strict in production |
| **Credentials** | AWS Secrets Manager or env vars, never in code |
| **OS Updates** | EB: managed platform updates; EC2: manual unattended-upgrades |
| **IAM Roles** | Least-privilege: only S3 (for deployments) and CloudWatch (for logs) |
| **Network** | Security group allows only port 443 (ALB → port 3000 on instance) |
| **Logging** | CloudWatch Logs with 7-day retention |
| **Monitoring** | EB health checks; CloudWatch alarms for 5xx spikes |

---

## Part E: Implementation Order

### Step 1 — Harden the Server (local production mode)
| File | Change |
|---|---|
| `package.json` | Add helmet, morgan, compression, express-rate-limit |
| `server/index.js` | Add all production middleware with env-conditional config |
| `server/auth.js` | Configurable redirect URI, env-var credentials support |
| `server/routes/auth.routes.js` | Dynamic cookie security based on NODE_ENV |
| `.env.example` | Add all new env vars |

### Step 2 — Add Process & Container Configs
| File | Change |
|---|---|
| `ecosystem.config.js` | PM2 process config |
| `Dockerfile` | Multi-stage Docker build |

### Step 3 — AWS Deployment Infrastructure
| File | Change |
|---|---|
| `infra/ecs-task-definition.json` | Fargate task definition template |
| `infra/deploy.sh` | Deployment script (build → push to ECR → force ECS update) |
| `.github/workflows/deploy.yml` | CI/CD pipeline (build → ECR → ECS) |
| `DEPLOY.md` | Complete deployment guide with Fargate steps |

### Step 4 — Google Cloud Console
- Change app type from Desktop to Web Application
- Add production redirect URIs
- Download new credentials

---

## Part F: Rollout Checklist

- [ ] Google OAuth credentials updated to "Web Application" type
- [ ] Production redirect URIs registered in Google Cloud Console
- [ ] AWS account and IAM user/role created
- [ ] Domain name purchased and Route 53 hosted zone configured
- [ ] SSL certificate provisioned in ACM
- [ ] Environment variables set in AWS (not in code)
- [ ] `npm run build` produces a working `client/dist/`
- [ ] `npm start` serves the app on `http://localhost:3000`
- [ ] OAuth login/logout flow works end-to-end
- [ ] All API endpoints return correct data
- [ ] PM2 starts and restarts the app correctly
- [ ] Docker image builds and runs locally (`docker build -t inbox-analyzer .`)
- [ ] Docker container runs correctly with built client (`docker run -p 3000:3000 inbox-analyzer`)
- [ ] ECR repository created and image pushed successfully
- [ ] ECS Fargate task definition created with correct env vars and secrets
- [ ] ECS service reaches steady state (1 running task)
- [ ] HTTPS redirects from HTTP
- [ ] Rate limiting works (429 on excessive requests)
- [ ] Security headers present (verify with curl -I)
- [ ] Logs streaming to CloudWatch
- [ ] CloudWatch alarm configured for 5xx errors

---

## Appendix: Comparison of AWS Services

| Feature | EC2 + PM2 | Elastic Beanstalk | ECS Fargate |
|---|---|---|---|
| Setup complexity | Low | Low-Medium | Medium-High |
| Cost (t3a.nano) | ~$5/mo + EIP | ~$20/mo (ALB + instance) | ~$8-10/mo (Fargate) + ~$15 ALB = **~$23-25/mo** |
| Idle cost | Full instance cost always | Full instance cost always | ~$8/mo → **$0/mo** if set desiredCount=0 |
| Auto-scaling | Manual | Built-in | Built-in |
| SSL | Manual (certbot) | ACM via ALB | ACM via ALB |
| Blue/Green | Manual | Built-in | Manual |
| Logging | Manual (CloudWatch agent) | Built-in | Built-in |
| OS updates | Manual | Managed | N/A (container) |
| Best for | Hobby / single-user | Production apps | Scalable services |

**Recommendation:** Use **ECS Fargate** for this project. While the baseline cost is slightly higher than EC2 alone, the combo of immutable deploys, no-OS-management, and the ability to scale to zero makes it the right choice for a modern single-container app. The Dockerfile you build for Fargate also runs identically in local dev, closing the "works on my machine" gap.
