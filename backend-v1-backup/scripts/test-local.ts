import fetch from 'node-fetch';

const API_URL = 'http://localhost:8080';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    console.log('🚀 Starting Local Backend Test...');

    // 1. Create Job
    const createPayload = {
        gcsUri: "gs://test-bucket/test-video.mp4",
        mimeType: "video/mp4",
        duration: 3600,
        analysisConfig: { fauna: true, transcription: true },
        userId: "test-user-local"
    };

    try {
        console.log('📝 Creating Job...');
        const createRes = await fetch(`${API_URL}/api/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(createPayload)
        });

        if (!createRes.ok) throw new Error(`Create Failed: ${createRes.statusText}`);
        const jobData = await createRes.json() as { id: string, status: string };
        const jobId = jobData.id;
        console.log(`✅ Job Created! ID: ${jobId}, Status: ${jobData.status}`);

        // If running with "npm run dev", the server likely logs "Cloud Tasks not configured"
        // and we might need to manually trigger the worker if we don't have a local task emulator.
        // However, the user asked for a "dev" script that calls /workers/process directly.
        // If that logic is server-side within the Create Job handler, we don't need to do it here.
        // BUT if the architecture relies on Cloud Tasks to call the worker, and we are skipping Cloud Tasks locally,
        // we must manually trigger the worker OR the server must do it.

        // Let's assume the "dev" mode on the server handles the direct call, OR we simulate it here:
        // SIMULATION: Manually trigger worker for testing purposes if the queue didn't fire.
        // For now, let's poll and see. If it stays 'queued', we trigger the worker manually.

        let status = jobData.status;
        let attempts = 0;

        while (status !== 'completed' && status !== 'failed' && attempts < 30) {
            await sleep(2000);
            attempts++;

            const getRes = await fetch(`${API_URL}/api/jobs/${jobId}`);
            const currentJob = await getRes.json() as any;
            status = currentJob.status;

            console.log(`⏳ Poll #${attempts}: Status = ${status}, Progress = ${currentJob.progress?.overall}%`);

            if (status === 'queued' && attempts === 2) {
                console.log('⚡️ Triggering Worker Manually (Simulating Cloud Task)...');
                await fetch(`${API_URL}/workers/process`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobId })
                });
            }
        }

        if (status === 'completed') {
            console.log('🎉 Test Passed! Job Completed.');
        } else {
            console.error('❌ Test Failed or Timed Out.');
        }

    } catch (error) {
        console.error('💥 Error:', error);
    }
}

runTest();
