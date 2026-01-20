#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# DEPLOYMENT SCRIPT - gemini-super-app
# ═══════════════════════════════════════════════════════════════════════════════
#
# Usage:
#   ./scripts/deploy.sh frontend  # Deploy frontend to Vercel
#   ./scripts/deploy.sh backend   # Deploy backend to Cloud Run
#   ./scripts/deploy.sh all       # Deploy both
#
# Configuration is auto-detected from existing project setup.
# ═══════════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration (from KI)
CLOUD_RUN_SERVICE="gemini-super-app-backend"
CLOUD_RUN_REGION="europe-west3"

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}🚀 DEPLOYMENT SCRIPT${NC}                                      ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

deploy_frontend() {
    echo -e "${BOLD}📦 Deploying Frontend to Vercel...${NC}"
    echo ""
    
    cd "$PROJECT_ROOT"
    
    # Check if vercel is available
    if ! command -v vercel &> /dev/null && ! command -v npx &> /dev/null; then
        echo -e "${RED}❌ Neither 'vercel' nor 'npx' found. Install Node.js first.${NC}"
        exit 1
    fi
    
    # Build first
    echo -e "${CYAN}[1/2]${NC} Building frontend..."
    npm run build
    
    # Deploy
    echo -e "${CYAN}[2/2]${NC} Deploying to Vercel..."
    npx vercel --prod --yes
    
    echo ""
    echo -e "${GREEN}✅ Frontend deployed successfully!${NC}"
}

deploy_backend() {
    echo -e "${BOLD}📦 Deploying Backend to Cloud Run...${NC}"
    echo ""
    
    cd "$PROJECT_ROOT/backend"
    
    # Check if gcloud is available
    if ! command -v gcloud &> /dev/null; then
        echo -e "${RED}❌ gcloud CLI not found.${NC}"
        echo -e "${YELLOW}   Option 1: Install gcloud: brew install --cask google-cloud-sdk${NC}"
        echo -e "${YELLOW}   Option 2: Use Google Cloud Shell (see docs)${NC}"
        exit 1
    fi
    
    # Verify authentication
    echo -e "${CYAN}[1/3]${NC} Verifying gcloud authentication..."
    ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)
    if [ -z "$ACCOUNT" ]; then
        echo -e "${YELLOW}⚠️ Not authenticated. Running gcloud auth login...${NC}"
        gcloud auth login
    else
        echo -e "  Authenticated as: ${ACCOUNT}"
    fi
    
    # Build locally
    echo -e "${CYAN}[2/3]${NC} Building TypeScript..."
    npm run build
    
    # Deploy to Cloud Run
    echo -e "${CYAN}[3/3]${NC} Deploying to Cloud Run..."
    gcloud run deploy "$CLOUD_RUN_SERVICE" \
        --source . \
        --region "$CLOUD_RUN_REGION" \
        --memory 4Gi \
        --cpu 2 \
        --timeout 3600 \
        --allow-unauthenticated
    
    echo ""
    echo -e "${GREEN}✅ Backend deployed successfully!${NC}"
    
    # Show the URL
    URL=$(gcloud run services describe "$CLOUD_RUN_SERVICE" --region "$CLOUD_RUN_REGION" --format="value(status.url)")
    echo -e "${CYAN}   Service URL: ${URL}${NC}"
    
    # Verify health
    echo ""
    echo -e "${CYAN}Verifying health endpoint...${NC}"
    HEALTH=$(curl -s "${URL}/health")
    if [ "$HEALTH" = "OK" ]; then
        echo -e "${GREEN}✅ Health check passed${NC}"
    else
        echo -e "${YELLOW}⚠️ Health check returned: ${HEALTH}${NC}"
    fi
}

show_help() {
    echo "Usage: ./scripts/deploy.sh [target]"
    echo ""
    echo "Targets:"
    echo "  frontend    Deploy frontend to Vercel"
    echo "  backend     Deploy backend to Cloud Run"
    echo "  all         Deploy both frontend and backend"
    echo ""
    echo "Configuration:"
    echo "  Cloud Run Service: $CLOUD_RUN_SERVICE"
    echo "  Cloud Run Region:  $CLOUD_RUN_REGION"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

TARGET="${1:-help}"

case "$TARGET" in
    frontend)
        deploy_frontend
        ;;
    backend)
        deploy_backend
        ;;
    all)
        deploy_backend
        echo ""
        echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
        echo ""
        deploy_frontend
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Unknown target: $TARGET${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac

echo ""
