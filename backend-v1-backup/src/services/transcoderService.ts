import { TranscoderServiceClient } from '@google-cloud/video-transcoder';

const transcoderClient = new TranscoderServiceClient();
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
// Use 'us-central1' as default if not specified, but it should be consistent with the bucket location
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

export const transcoderService = {
    async createProxyJob(inputUri: string, outputUri: string) {
        if (!PROJECT_ID) {
            throw new Error("GOOGLE_CLOUD_PROJECT is not defined");
        }
        const parent = `projects/${PROJECT_ID}/locations/${LOCATION}`;
        const [response] = await transcoderClient.createJob({
            parent,
            job: {
                inputUri,
                outputUri, // Must end in /
                config: {
                    elementaryStreams: [
                        {
                            key: 'video-stream',
                            videoStream: {
                                h264: {
                                    heightPixels: 720,
                                    bitrateBps: 1500000,
                                    frameRate: 30
                                }
                            }
                        },
                        {
                            key: 'audio-stream',
                            audioStream: {
                                codec: 'aac',
                                bitrateBps: 128000
                            }
                        }
                    ],
                    muxStreams: [
                        {
                            key: 'proxy',
                            container: 'mp4',
                            elementaryStreams: ['video-stream', 'audio-stream']
                        }
                    ]
                }
            }
        });
        return response.name; // returns job name to poll (projects/.../locations/.../jobs/...)
    },

    async getJobStatus(jobName: string) {
        const [job] = await transcoderClient.getJob({ name: jobName });
        return job.state; // 'SUCCEEDED', 'PROCESSING', 'FAILED', 'PENDING'
    }
};
