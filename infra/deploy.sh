#!/bin/bash
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPOSITORY="inbox-analyzer"
ECS_CLUSTER="inbox-analyzer-cluster"
ECS_SERVICE="inbox-analyzer-service"
IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')"

# ── Login to ECR ───────────────────────────────────────────────────
echo "=== Logging in to Amazon ECR ==="
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

# ── Build and tag ──────────────────────────────────────────────────
echo "=== Building Docker image ==="
docker build -t "$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" .
docker tag "$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" "$ECR_REGISTRY/$ECR_REPOSITORY:latest"

# ── Push to ECR ────────────────────────────────────────────────────
echo "=== Pushing to ECR ==="
docker push "$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"
docker push "$ECR_REGISTRY/$ECR_REPOSITORY:latest"

# ── Deploy to ECS ──────────────────────────────────────────────────
echo "=== Triggering ECS Fargate deployment ==="
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --force-new-deployment \
  --region "$AWS_REGION"

echo ""
echo "=== Deployment triggered! ==="
echo "Monitor with:"
echo "  aws ecs wait services-stable --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION"
echo "  aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION --query 'services[0].deployments'"
