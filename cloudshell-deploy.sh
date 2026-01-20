#!/bin/bash
# Direct deployment script - paste this entire thing into Cloud Shell
# It creates all files and deploys in one go

set -e

echo "🚀 Creating backend-v2 from scratch..."

# Clean up
rm -rf backend-v2
mkdir -p backend-v2/src/{config,controllers,services,utils}

# Create package.json
cat > backend-v2/package.json << 'PACKAGEJSON'
{
    "name": "gemini-video-analyzer-backend-v2",
    "version": "2.0.0",
    "main": "dist/index.js",
    "scripts": {
        "build": "tsc",
        "start": "node dist/index.js"
    },
    "dependencies": {
        "@google-cloud/storage": "^7.7.0",
        "@google-cloud/video-intelligence": "^5.0.0",
        "@google/genai": "^0.14.0",
        "cors": "^2.8.5",
        "express": "^4.18.2",
        "firebase-admin": "^12.0.0"
    },
    "devDependencies": {
        "@types/cors": "^2.8.17",
        "@types/express": "^4.17.21",
        "@types/node": "^20.10.0",
        "typescript": "^5.3.0"
    },
    "engines": {
        "node": ">=18.0.0"
    }
}
PACKAGEJSON

# Create tsconfig.json
cat > backend-v2/tsconfig.json << 'TSCONFIG'
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "lib": ["ES2022"],
        "outDir": "./dist",
        "rootDir": "./src",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "resolveJsonModule": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
}
TSCONFIG

# Create Dockerfile
cat > backend-v2/Dockerfile << 'DOCKERFILE'
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
DOCKERFILE

# Create .dockerignore
cat > backend-v2/.dockerignore << 'DOCKERIGNORE'
node_modules
.env*
*.log
DOCKERIGNORE

# Create src/index.ts
cat > backend-v2/src/index.ts << 'INDEXTS'
import express from 'express';
import cors from 'cors';
import { jobsRouter } from './controllers/jobs.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_, res) => res.send('OK'));
app.use('/api', jobsRouter);

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
INDEXTS

# Create src/config/env.ts
cat > backend-v2/src/config/env.ts << 'ENVTS'
export const config = {
    port: parseInt(process.env.PORT || '8080', 10),
    gcpProject: process.env.GOOGLE_CLOUD_PROJECT || '',
    storageBucket: process.env.GCS_BUCKET || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
};
ENVTS

# Create src/controllers/jobs.ts
cat > backend-v2/src/controllers/jobs.ts << 'JOBSTS'
import { Router, Request, Response } from 'express';
import { config } from '../config/env.js';

export const jobsRouter = Router();

jobsRouter.get('/jobs/:id', async (req: Request, res: Response) => {
    res.json({ id: req.params.id, status: 'ready', version: '2.0' });
});

jobsRouter.post('/jobs', async (req: Request, res: Response) => {
    const jobId = `job_${Date.now()}`;
    res.json({ id: jobId, status: 'queued' });
});

jobsRouter.post('/upload-url', async (req: Request, res: Response) => {
    res.json({ 
        uploadUrl: `https://storage.googleapis.com/${config.storageBucket}/uploads/temp`,
        gcsUri: `gs://${config.storageBucket}/uploads/temp`
    });
});
JOBSTS

# Create empty service files (placeholders)
touch backend-v2/src/services/gemini.ts
touch backend-v2/src/services/worker.ts
touch backend-v2/src/services/storage.ts
touch backend-v2/src/services/firebase.ts
touch backend-v2/src/types.ts
touch backend-v2/src/utils/retry.ts
touch backend-v2/src/utils/timecode.ts

echo "✅ Files created!"
echo ""
echo "Now deploying..."

cd backend-v2

gcloud run deploy gemini-super-app-backend \
  --source . \
  --region europe-west3 \
  --memory 2Gi \
  --timeout 600 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=gen-lang-client-0431510360,GCS_BUCKET=gemini-deliverables-app,GEMINI_API_KEY=AIzaSyDU2A3ryxp2SQH61g8KjjA5eRomCEKiXIw"

echo ""
echo "✅ Deployment complete!"
