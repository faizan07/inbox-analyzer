# Deployment Guide: AWS ECS Fargate

This guide walks through deploying the Gmail Mailbox Analyzer to AWS ECS Fargate.

---

## Prerequisites

- [ ] **Google Cloud Console:** OAuth app changed from "Desktop" to **"Web Application"** type
- [ ] **Google Cloud Console:** Production redirect URI registered (`https://yourdomain.com/oauth2callback`)
- [ ] **AWS Account:** With permissions to create ECR, ECS, IAM, ALB, Route 53 resources
- [ ] **Domain name:** Registered and managed in Route 53 (or external with NS records in Route 53)
- [ ] **AWS CLI:** Installed and configured (`aws configure`)
- [ ] **Docker:** Installed locally
- [ ] **Node.js:** 20.x installed locally

---

## Step 1: Google Cloud Console Setup

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client ID
3. Change **Application type** from "Desktop app" to **"Web application"**
4. Under **Authorized redirect URIs**, add:
   - `https://yourdomain.com/oauth2callback`
   - `http://localhost:3000/oauth2callback` (keep for local testing)
5. Under **Authorized JavaScript origins**, add:
   - `https://yourdomain.com`
   - `http://localhost:3000`
6. Save and note your **Client ID** and **Client Secret**

---

## Step 2: Local Build Verification

Test that the app builds and runs correctly:

```bash
# Install dependencies
npm ci

# Build the client
npm run build

# Start in production mode
npm start
# → Open http://localhost:3000
```

Verify:
- [ ] App loads without Vite dev server (port 3000 only)
- [ ] OAuth login/logout works
- [ ] Dashboard shows Gmail data
- [ ] Security headers present: `curl -I http://localhost:3000`

---

## Step 3: Docker Build Verification

```bash
# Build the Docker image
npm run docker-build

# Run locally with your .env
npm run docker-run
# → Open http://localhost:3000
```

Verify:
- [ ] Image builds successfully
- [ ] Container starts and passes health check
- [ ] App works the same as direct `npm start`

---

## Step 4: AWS Infrastructure Setup

Do these steps **once** via AWS Console or AWS CLI.

### 4.1 Create ECR Repository

```bash
aws ecr create-repository --repository-name inbox-analyzer
```

### 4.2 Store Google OAuth Secrets in Secrets Manager

```bash
aws secretsmanager create-secret \
  --name inbox-analyzer-google-credentials \
  --secret-string '{"GOOGLE_CLIENT_ID":"your-client-id","GOOGLE_CLIENT_SECRET":"your-client-secret"}'
```

Note the secret ARN — update it in `infra/ecs-task-definition.json`.

### 4.3 Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name inbox-analyzer-cluster
```

### 4.4 Set Up IAM Roles

**ecsTaskExecutionRole** (allows ECS to pull images from ECR and write logs):

```bash
# Create trust policy
cat > ecs-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

# Create role
aws iam create-role --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://ecs-trust-policy.json

# Attach managed policy
aws iam attach-role-policy --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

**ecsTaskRole** (minimal — this app makes no AWS API calls, but creation is needed):

```bash
aws iam create-role --role-name ecsTaskRole \
  --assume-role-policy-document file://ecs-trust-policy.json
```

### 4.5 Create Security Groups

```bash
# ALB security group (allow HTTPS from internet)
ALB_SG=$(aws ec2 create-security-group \
  --group-name inbox-analyzer-alb-sg \
  --description "ALB for inbox-analyzer" \
  --output text --query 'GroupId')
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# Fargate security group (allow traffic only from ALB)
FARGATE_SG=$(aws ec2 create-security-group \
  --group-name inbox-analyzer-fargate-sg \
  --description "Fargate tasks for inbox-analyzer" \
  --output text --query 'GroupId')
aws ec2 authorize-security-group-ingress \
  --group-id $FARGATE_SG \
  --protocol tcp --port 3000 --source-group $ALB_SG
```

### 4.6 Create Target Group and ALB

```bash
# Target group
TARGET_GROUP_ARN=$(aws elbv2 create-target-group \
  --name inbox-analyzer-tg \
  --protocol HTTP --port 3000 \
  --target-type ip \
  --vpc-id vpc-xxxxx \
  --health-check-path /auth/status \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --output text --query 'TargetGroups[0].TargetGroupArn')

# ALB (replace subnet-xxxxx with your public subnets)
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name inbox-analyzer-alb \
  --subnets subnet-xxxxx subnet-yyyyy \
  --security-groups $ALB_SG \
  --scheme internet-facing \
  --output text --query 'LoadBalancers[0].LoadBalancerArn')

# HTTPS listener (replace cert-arn with your ACM certificate)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=arn:aws:acm:region:account:certificate/cert-id \
  --default-actions Type=forward,TargetGroupArn=$TARGET_GROUP_ARN

# HTTP → HTTPS redirect
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}'
```

### 4.7 Set Up SSL Certificate (ACM)

```bash
# Request certificate (replace with your domain)
aws acm request-certificate \
  --domain-name yourdomain.com \
  --validation-method DNS \
  --region us-east-1

# After requesting, create the DNS validation record in Route 53
# (Check the console or `aws acm describe-certificate` for the CNAME details)
```

### 4.8 Update infra/ecs-task-definition.json

Edit `infra/ecs-task-definition.json` and replace:
- `ACCOUNT_ID` → your AWS account ID
- `REGION` → your AWS region (e.g., `us-east-1`)
- `yourdomain.com` → your actual domain
- Secret ARNs → the ARN from Step 4.2

### 4.9 Register Task Definition and Create Service

```bash
# Register task definition
aws ecs register-task-definition --cli-input-json file://infra/ecs-task-definition.json

# Create ECS service
aws ecs create-service \
  --cluster inbox-analyzer-cluster \
  --service-name inbox-analyzer-service \
  --task-definition inbox-analyzer \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxxxx],securityGroups=[$FARGATE_SG],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TARGET_GROUP_ARN,containerName=inbox-analyzer,containerPort=3000"
```

### 4.10 Configure Route 53

Create an A record in your hosted zone that aliases to the ALB:

```bash
# Get ALB DNS name
aws elbv2 describe-load-balancers --names inbox-analyzer-alb \
  --query 'LoadBalancers[0].DNSName' --output text

# Create A record alias in Route 53
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "ALB_ZONE_ID",
          "DNSName": "ALB_DNS_NAME",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

---

## Step 5: Deploy

### First deployment (manual):

```bash
# Set env vars
export AWS_REGION=us-east-1

# Run the deployment script
./infra/deploy.sh
```

### Subsequent deployments (auto via CI/CD):

Push to `main` branch — GitHub Actions will:
1. Build the Docker image
2. Push to ECR
3. Force a new ECS deployment

---

## Verification Checklist

- [ ] HTTPS loads the app (`https://yourdomain.com`)
- [ ] OAuth login redirects back to your domain, not localhost
- [ ] Dashboard loads with Gmail data
- [ ] `curl -I https://yourdomain.com` shows security headers
- [ ] CloudWatch Logs show application logs
- [ ] ALB health checks are passing (Target Group shows healthy)

---

## Monitoring

| Tool | What to watch |
|---|---|
| **CloudWatch Logs** | `/ecs/inbox-analyzer` log group — app stdout/stderr |
| **ECS Console** | Service status, task count, deployment events |
| **ALB** | Target group health, 4xx/5xx rates |
| **CloudWatch Alarms** | Set up alarm for >5% 5xx rate on ALB |

## Cost Estimates (us-east-1, ~$8-10/month)

| Resource | Cost |
|---|---|
| ECS Fargate (0.25 vCPU, 0.5GB, always-on) | ~$8-10/mo |
| ALB (1 LCU average) | ~$15/mo |
| ECR storage | ~$0.10/mo |
| Secrets Manager | ~$0.40/mo |
| Route 53 hosted zone | ~$0.50/mo |
| **Total** | **~$24/mo** |

**To reduce cost:** Set `desiredCount: 0` when not using the app (pay only for storage and ALB).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `redirect_uri_mismatch` | REDIRECT_URI env var doesn't match Google Cloud Console | Check both match exactly |
| ALB health check failing (502) | App crashed or not responding | Check CloudWatch Logs for errors |
| "credentials.json not found" | GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set | Check Secrets Manager + task definition env vars |
| OAuth callback gets 404 | ALB listener misconfigured | Check listener rules and target group |
| ECS task won't start | Insufficient memory/vCPU or bad task definition | Check ECS event stream in console |
| CORS error in browser | APP_URL or CORS_ORIGIN mismatch | Verify CORS_ORIGIN matches the exact domain you're accessing from |
