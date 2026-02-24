#!/bin/bash
# Deploy Backend to Cloud Run
# Run this script from the backend directory
#
# Keys are loaded from the project root .env file automatically.
# Or set manually: export GEMINI_API_KEY="your-key-here"

set -e

# Auto-load .env from project root if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env" ]; then
  echo "📋 Loading environment from .env..."
  set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

# Configuration
PROJECT_ID="gen-lang-client-0431510360"
REGION="europe-west3"
SERVICE_NAME="gemini-backend-v2"
GCS_BUCKET="gemini-deliverables-app"

# Validate required environment variable
if [ -z "${GEMINI_API_KEY}" ]; then
  echo "❌ ERROR: GEMINI_API_KEY is not set."
  echo "   Add it to the .env file in the project root, or:"
  echo "   export GEMINI_API_KEY=\"your-key-here\""
  exit 1
fi

echo "🚀 Deploying V2 Backend to Cloud Run..."
echo "   Project: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Service: $SERVICE_NAME"

# Build TypeScript
echo "📦 Building TypeScript..."
npm run build

# Deploy to Cloud Run
echo "☁️  Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --project $PROJECT_ID \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --timeout 600 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GCS_BUCKET=$GCS_BUCKET,GEMINI_API_KEY=$GEMINI_API_KEY"

echo "✅ Deployment complete!"
echo ""
echo "Your V2 backend is now available at:"
gcloud run services describe $SERVICE_NAME --project $PROJECT_ID --region $REGION --format "value(status.url)"
