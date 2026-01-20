import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 8080,
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT, // Cloud Run sets GOOGLE_CLOUD_PROJECT auto-magically
    location: process.env.GOOGLE_CLOUD_LOCATION || 'europe-west3', // Default to europe-west3 for this user
    queueName: process.env.CLOUD_TASKS_QUEUE || 'video-analysis-queue',
    workerUrl: process.env.WORKER_URL || 'https://gemini-super-app-backend-193471035724.europe-west3.run.app', // Fallback to deployed URL
    serviceAccountEmail: process.env.SERVICE_ACCOUNT_EMAIL,
    geminiApiKey: process.env.GEMINI_API_KEY
};

if (!config.projectId) {
    console.warn('Warning: GOOGLE_CLOUD_PROJECT_ID is not set.');
}
