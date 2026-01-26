#!/bin/bash
# Cloud Run Deployment Script for Gemini Video Analyzer Backend
# 
# Optimized for long-running video analysis jobs with:
# - 2GB memory for large file processing
# - 60-minute timeout for long videos
# - Min instances to prevent cold starts
# - CPU boost for faster startup

set -e

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-gen-lang-client-0431510360}"
SERVICE_NAME="gemini-super-app-backend"
REGION="${REGION:-us-central1}"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Deploying Gemini Video Analyzer Backend                   ║"
echo "║  Project: $PROJECT_ID"
echo "║  Region:  $REGION"
echo "╚════════════════════════════════════════════════════════════╝"

# Build the container
echo ""
echo "📦 Building container..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

# Deploy to Cloud Run with optimized settings
echo ""
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --min-instances 1 \
  --max-instances 10 \
  --cpu-boost \
  --execution-environment gen2 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production"

echo ""
echo "✅ Deployment complete!"
echo ""

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
echo "🌐 Service URL: $SERVICE_URL"
echo ""

# Health check
echo "🔍 Running health check..."
curl -s "$SERVICE_URL/health" | jq .
echo ""
echo "Done!"
