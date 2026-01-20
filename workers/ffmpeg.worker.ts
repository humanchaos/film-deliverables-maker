import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

let loaded = false;

// Initialize FFmpeg singleton
async function loadFFmpeg() {
    if (loaded) return;
    try {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        loaded = true;
        self.postMessage({ type: 'status', message: 'FFmpeg loaded' });
    } catch (error) {
        self.postMessage({ type: 'error', message: 'Failed to load FFmpeg: ' + error });
        throw error;
    }
}

self.onmessage = async ({ data }) => {
    const { type, videoFile } = data;

    try {
        await loadFFmpeg();

        if (!videoFile) return;

        const { name } = videoFile;
        self.postMessage({ type: 'status', message: 'Writing file to memory...' });
        await ffmpeg.writeFile(name, await fetchFile(videoFile));

        if (type === 'DETECT_SCENES') {
            const { threshold = 0.4 } = data;
            self.postMessage({ type: 'status', message: 'Analyzing scenes...' });

            const logData: string[] = [];
            const logHandler = ({ message }: { message: string }) => {
                if (message.includes('pts_time:')) {
                    logData.push(message);
                }
            };
            ffmpeg.on('log', logHandler);

            await ffmpeg.exec([
                '-i', name,
                '-vf', `select='gt(scene,${threshold})',showinfo`,
                '-f', 'null',
                '-'
            ]);

            ffmpeg.off('log', logHandler);

            const scenes = logData.map(log => {
                const match = log.match(/pts_time:([0-9.]+)/);
                return match ? parseFloat(match[1]) : null;
            }).filter(t => t !== null) as number[];

            self.postMessage({ type: 'result', payload: { scenes } });

        } else if (type === 'EXTRACT_KEYFRAMES') {
            self.postMessage({ type: 'status', message: 'Extracting I-frames...' });

            // Ensure output directory exists or just use root
            // We will output pattern: frame_%03d.jpg

            await ffmpeg.exec([
                '-i', name,
                '-vf', "select='eq(pict_type,I)'",
                '-vsync', 'vfr',
                'frame_%03d.jpg'
            ]);

            // Read all generated files
            const files = await ffmpeg.listDir('/');
            const frameFiles = files.filter((f: any) => f.name.startsWith('frame_') && f.name.endsWith('.jpg'));

            const blobs: Blob[] = [];

            for (const file of frameFiles) {
                const data = await ffmpeg.readFile(file.name);
                // FFmpeg 0.12+ uses SharedArrayBuffer which confuses standard Blob types
                blobs.push(new Blob([data as any], { type: 'image/jpeg' }));
                // Cleanup each frame immediately to save memory? No, maybe after.
                await ffmpeg.deleteFile(file.name);
            }

            self.postMessage({ type: 'result', payload: { blobs } });

        } else if (type === 'GET_METADATA') {
            self.postMessage({ type: 'status', message: 'Extracting metadata...' });

            const logData: string[] = [];
            const logHandler = ({ message }: { message: string }) => {
                logData.push(message);
            };
            ffmpeg.on('log', logHandler);

            // Run ffmpeg -i just to get the info (it will error because no output is specified, which is fine)
            try {
                await ffmpeg.exec(['-i', name]);
            } catch (e) {
                // Expected error: "At least one output file must be specified"
                // We ignore this as we only want the startup logs (metadata)
            }

            ffmpeg.off('log', logHandler);

            // Parse the logs to find relevant info
            const logs = logData.join('\n');

            // Simple regex extractors for the "Law of Physics"
            // Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'video.mp4':
            // Duration: 00:00:13.54, start: 0.000000, bitrate: 4405 kb/s

            const containerMatch = logs.match(/Input #0, ([^,]+)/);
            const durationMatch = logs.match(/Duration: ([^,]+)/);
            const bitrateMatch = logs.match(/bitrate: ([^ ]+)/);
            const streams = logs.split('Stream #').slice(1).map(s => 'Stream #' + s.split('\n')[0].trim());

            const metadata = {
                container: containerMatch ? containerMatch[1] : 'unknown',
                duration: durationMatch ? durationMatch[1] : 'unknown',
                bitrate: bitrateMatch ? bitrateMatch[1] + ' kb/s' : 'unknown',
                streams: streams,
                rawLogs: logs // For full transparency in the UI
            };

            self.postMessage({ type: 'result', payload: metadata });
        }

        // Cleanup input file
        await ffmpeg.deleteFile(name);

    } catch (error: any) {
        self.postMessage({ type: 'error', message: error.message || String(error) });
    }
};
