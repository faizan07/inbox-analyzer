# Production Readiness & AWS Deployment — Implementation Plan

**Based on:** `.claude/specs/production_ready_spec.md`  
**Target:** Gmail Mailbox Analyzer → hardened for production → deployed on AWS ECS Fargate

---

## Phase 0: Prerequisites & Setup

Before touching code, the user needs:

- [ ] **Google Cloud Console:** Change OAuth app from "Desktop" → **"Web Application"** type
- [ ] **Google Cloud Console:** Add production redirect URI (e.g., `https://yourdomain.com/oauth2callback`)
- [ ] **Google Cloud Console:** Keep `http://localhost:3000/oauth2callback` for local testing
- [ ] **AWS Account:** IAM user with programmatic access (or OIDC role for GitHub Actions)
- [ ] **Domain name:** Registered (Route 53 or external) with a hosted zone
- [ ] **AWS CLI:** Installed and configured locally (`aws configure`)

---

## Phase 1: Local Production Hardening (7 files)

Make the app run locally in production mode with all security hardening.

### 1.1 Install production dependencies

**Command:** `npm install helmet morgan compression express-rate-limit`

| Package | Purpose |
|---|---|
| `helmet` | Sets security HTTP headers (X-Frame-Options, HSTS, XSS protection, etc.) |
| `morgan` | HTTP request logger — `combined` format in prod, `dev` in dev |
| `compression` | Gzip/deflate response compression middleware |
| `express-rate-limit` | Rate limiting middleware for API abuse prevention |

### 1.2 Update server/index.js

**File:** `server/index.js`

Changes:
1. **Add requires** at the top for helmet, morgan, compression, rateLimit
2. **Create rate limiter** for `/api/*` — 100 requests per 15 minutes per IP (skip in dev)
3. **Reorder middleware** in correct priority order:
   ```
   1. helmet()
   2. compression()
   3. cors() — lock to APP_URL/CORS_ORIGIN in production, allow all in dev
   4. morgan('combined') — production; 'dev' format in dev
   5. express.json()
   6. express.urlencoded()
   7. cookieParser()
   ```
4. **Apply rate limiter** to `/api` routes only (not auth routes)
5. **Update CORS:** In production, use `cors({ origin: process.env.APP_URL || process.env.CORS_ORIGIN, credentials: true })` instead of open `cors()`
6. **Update error handler:** Hide stack traces in production (`NODE_ENV !== 'production'` check)

### 1.3 Update server/auth.js

**File:** `server/auth.js`

Changes:
1. **Configurable REDIRECT_URI:**
   - Current: `const REDIRECT_URI = 'http://localhost:3000/oauth2callback'`
   - New: 
     ```js
     const REDIRECT_URI = process.env.REDIRECT_URI 
       || (process.env.APP_URL ? `${process.env.APP_URL}/oauth2callback` : null)
       || 'http://localhost:3000/oauth2callback';
     ```
   
2. **Env-var based credentials** (for AWS deployment without credentials.json):
   - Modify `loadCredentials()` to check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars first
   - Priority: `credentials.json` file → env vars → throw CREDENTIALS_MISSING
   - When using env vars, construct a credentials object matching the installed/web JSON structure

3. **Better error messages:** Include which credential source failed

### 1.4 Update server/routes/auth.routes.js

**File:** `server/routes/auth.routes.js`

Changes:
1. **Dynamic cookie security:**
   - Current: `secure: false, sameSite: 'lax'`
   - Production: `secure: true, sameSite: 'strict'`
   - Dev: `secure: false, sameSite: 'lax'`
   - Use `process.env.NODE_ENV === 'production'` to decide

2. The `isProduction` helper:
   ```js
   const isProduction = process.env.NODE_ENV === 'production';
   ```

3. Update all cookie writes and `res.clearCookie` calls to use the dynamic value

### 1.5 Update .env.example

**File:** `.env.example`

Add all new env vars with descriptions:

```env
# Server port (default: 3000)
PORT=3000

# Runtime environment: development | production
NODE_ENV=development

# Number of recent emails to fetch for analysis (default: 500)
FETCH_LIMIT=500

# Public-facing URL for OAuth redirects (production only)
# Example: https://analyzer.example.com
APP_URL=

# OAuth redirect URI (overrides APP_URL derivation if set)
# Must match exactly what's registered in Google Cloud Console
# Example: https://analyzer.example.com/oauth2callback
REDIRECT_URI=

# Google OAuth credentials (use these OR credentials.json, not both)
# Required on AWS where credentials.json isn't available
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Allowed CORS origin (defaults to APP_URL in production)
CORS_ORIGIN=

# Rate limiting: window in minutes (default: 15)
RATE_LIMIT_WINDOW=15

# Rate limiting: max requests per window per IP (default: 100)
RATE_LIMIT_MAX=100
```

### 1.6 Update package.json scripts

**File:** `package.json`

Changes:
1. Update `start` script to include `NODE_ENV=production` (already done, but ensure cross-platform)
   - Current: `"start": "NODE_ENV=production node server/index.js"`
   - For Windows compat: Use `cross-env` or keep as-is (works on Linux/macOS, Windows users use npm scripts)
   - Keep as-is for now; the Dockerfile sets `ENV NODE_ENV=production` natively

2. Add a `docker-build` script: `"docker-build": "docker build -t inbox-analyzer ."`
3. Add a `docker-run` script: `"docker-run": "docker run -p 3000:3000 --env-file .env inbox-analyzer"`

### 1.7 Create ecosystem.config.js

**File:** `ecosystem.config.js` (project root)

PM2 process config for EC2 deployment (alternative path):

```js
module.exports = {
  apps: [{
    name: 'inbox-analyzer',
    script: 'server/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    max_memory_restart: '300M',
  }],
};
```

---

## Phase 2: Containerization (1 file)

Make the app deployable as a Docker container.

### 2.1 Create Dockerfile

**File:** `Dockerfile` (project root)

Multi-stage build:
- **Stage 1 (builder):** Node 20 Alpine, install client deps, build client
- **Stage 2 (production):** Node 20 Alpine, copy server code + built client, run as non-root

```dockerfile
# ── Stage 1: Build client ──────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY client/package*.json client/
RUN cd client && npm ci
COPY client/ client/
RUN cd client && npm run build

# ── Stage 2: Production image ──────────────────────────────
FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy server code and built client
COPY server/ server/
COPY --from=builder /app/client/dist client/dist

# Security: run as non-root user
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/auth/status || exit 1

CMD ["node", "server/index.js"]
```

**Key design decisions:**
- Alpine for minimal image size (~150MB final)
- Non-root user for security
- `npm ci --omit=dev` — installs only production deps
- Healthcheck hits `/auth/status` for ECS task health routing

---

## Phase 3: AWS ECS Fargate Infrastructure (3 files)

Create the deployment infrastructure for ECS Fargate.

### 3.1 Create infra directory and ECS task definition

**File:** `infra/ecs-task-definition.json`

Template for the ECS task definition. Key config:

```json
{
  "family": "inbox-analyzer",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [{
    "name": "inbox-analyzer",
    "image": "ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/inbox-analyzer:latest",
    "essential": true,
    "portMappings": [{
      "containerPort": 3000,
      "protocol": "tcp"
    }],
    "environment": [
      { "name": "NODE_ENV", "value": "production" },
      { "name": "PORT", "value": "3000" },
      { "name": "FETCH_LIMIT", "value": "500" },
      { "name": "APP_URL", "value": "https://yourdomain.com" },
      { "name": "REDIRECT_URI", "value": "https://yourdomain.com/oauth2callback" }
    ],
    "secrets": [
      { "name": "GOOGLE_CLIENT_ID", "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:inbox-analyzer-google-credentials" },
      { "name": "GOOGLE_CLIENT_SECRET", "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:inbox-analyzer-google-credentials" }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/inbox-analyzer",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "healthCheck": {
      "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/auth/status || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 15
    }
  }]
}
```

**Note:** `ACCOUNT_ID`, `REGION`, `yourdomain.com`, and secret ARNs are placeholders to be replaced during actual deployment.

### 3.2 Create deployment script

**File:** `infra/deploy.sh`

Bash script for local deployment (or CI use):

```bash
#!/bin/bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPOSITORY="inbox-analyzer"
ECS_CLUSTER="inbox-analyzer-cluster"
ECS_SERVICE="inbox-analyzer-service"

echo "=== Logging in to ECR ==="
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin \
  "$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com"

ECR_REGISTRY="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE_TAG="$(git rev-parse --short HEAD)"

echo "=== Building image ==="
docker build -t "$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" .
docker tag "$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" "$ECR_REGISTRY/$ECR_REPOSITORY:latest"

echo "=== Pushing to ECR ==="
docker push "$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"
docker push "$ECR_REGISTRY/$ECR_REPOSITORY:latest"

echo "=== Forcing ECS deployment ==="
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force-new-deployment \
  --region "$AWS_REGION"

echo "=== Deployment triggered! ==="
echo "Monitor: aws ecs wait services-stable --cluster $ECS_CLUSTER --services $ECS_SERVICE"
```

### 3.3 Create GitHub Actions CI/CD workflow

**File:** `.github/workflows/deploy.yml`

Triggered on push to `main`:

```yaml
name: Build and Deploy to ECS Fargate
on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: inbox-analyzer
  ECS_CLUSTER: inbox-analyzer-cluster
  ECS_SERVICE: inbox-analyzer-service

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

      - name: Build, tag, and push image to ECR
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest

      - name: Deploy to ECS Fargate
        run: |
          aws ecs update-service \
            --cluster ${{ env.ECS_CLUSTER }} \
            --service ${{ env.ECS_SERVICE }} \
            --force-new-deployment \
            --region ${{ env.AWS_REGION }}

      - name: Wait for service stability
        run: |
          aws ecs wait services-stable \
            --cluster ${{ env.ECS_CLUSTER }} \
            --services ${{ env.ECS_SERVICE }} \
            --region ${{ env.AWS_REGION }}
```

---

## Phase 4: AWS Infrastructure Setup (manual, one-time)

These steps happen in the AWS Console or via AWS CLI, not in code. Documented here so nothing is forgotten.

### 4.1 ECR Repository

```bash
aws ecr create-repository --repository-name inbox-analyzer
```

### 4.2 Secrets Manager

Store Google OAuth credentials:
```bash
aws secretsmanager create-secret \
  --name inbox-analyzer-google-credentials \
  --secret-string '{"GOOGLE_CLIENT_ID":"your-client-id","GOOGLE_CLIENT_SECRET":"your-client-secret"}'
```

### 4.3 ECS Cluster

```bash
aws ecs create-cluster --cluster-name inbox-analyzer-cluster
```

### 4.4 IAM Roles

- **ecsTaskExecutionRole** — allows ECS to pull from ECR and write to CloudWatch Logs
- **ecsTaskRole** — the task itself; can be minimal for this app (no AWS API calls)

### 4.5 Security Groups

- **ALB SG:** Inbound — 443 (HTTPS) from 0.0.0.0/0
- **Fargate SG:** Inbound — 3000 from ALB SG only

### 4.6 ALB + Target Group

- Target group: HTTP on port 3000, health check path `/auth/status`
- ALB: Internet-facing, HTTPS listener with ACM cert
- HTTP→HTTPS redirect rule

### 4.7 Route 53

- A record alias pointing to the ALB DNS name

### 4.8 Register task definition and create service

```bash
# Register task definition (replace placeholders)
aws ecs register-task-definition --cli-input-json file://infra/ecs-task-definition.json

# Create service
aws ecs create-service \
  --cluster inbox-analyzer-cluster \
  --service-name inbox-analyzer-service \
  --task-definition inbox-analyzer \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=inbox-analyzer,containerPort=3000"
```

---

## Phase 5: Verification

### Local verification (post-Phase 1):
1. `npm run build` → produces `client/dist/`
2. `npm start` → serves app on `http://localhost:3000`
3. OAuth login/logout flow works end-to-end
4. All API endpoints return correct data
5. `curl -I http://localhost:3000` shows security headers (X-Frame-Options, XSS, HSTS, etc.)
6. Rapid requests to `/api/*` return 429 after exceeding limit

### Docker verification (post-Phase 2):
1. `docker build -t inbox-analyzer .` → succeeds
2. `docker run -p 3000:3000 --env-file .env inbox-analyzer` → app works
3. Image size is reasonable (< 200MB)

### AWS verification (post-Phase 3 & 4):
1. ECS service reaches `RUNNING` state
2. ALB health checks pass on `/auth/status`
3. HTTPS loads the app in browser
4. OAuth login redirects back to the production domain
5. Dashboard loads with Gmail data

---

## Rollback Plan

| Scenario | Action |
|---|---|
| OAuth broken after deploy | Check `REDIRECT_URI` env var matches Google Cloud Console exactly |
| ALB health check failing | SSH into task (ECS Exec), curl localhost:3000/auth/status |
| Image build fails | `git revert` the last commit, push again |
| ECS task crashes in loop | Check CloudWatch Logs for error stack traces |
| Environment variable wrong | Update task definition → force new deployment |
| Secrets missing | Verify Secrets Manager ARN and IAM permissions |
| Domain/SSL issue | Verify ACM cert status (must be ISSUED), Route 53 alias to ALB |

---

## Summary of All Files to Create/Modify

| # | File | Action | Phase |
|---|---|---|---|
| 1 | `package.json` | Modify (add deps, add scripts) | 1.1, 1.6 |
| 2 | `server/index.js` | Modify (add middleware, CORS, rate limit) | 1.2 |
| 3 | `server/auth.js` | Modify (configurable URI, env creds) | 1.3 |
| 4 | `server/routes/auth.routes.js` | Modify (secure cookies) | 1.4 |
| 5 | `.env.example` | Modify (all new vars) | 1.5 |
| 6 | `ecosystem.config.js` | Create | 1.7 |
| 7 | `Dockerfile` | Create | 2.1 |
| 8 | `infra/ecs-task-definition.json` | Create | 3.1 |
| 9 | `infra/deploy.sh` | Create | 3.2 |
| 10 | `.github/workflows/deploy.yml` | Create | 3.3 |
| 11 | `DEPLOY.md` | Create (deployment guide) | 3.4 |
