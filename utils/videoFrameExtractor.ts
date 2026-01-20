
export class VideoFrameExtractor {
    static async extractFrames(file: File, timestamps: number[]): Promise<Blob[]> {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const blobs: Blob[] = [];
            const url = URL.createObjectURL(file);

            let currentIndex = 0;

            video.src = url;
            video.muted = true;
            video.playsInline = true;

            const processNext = async () => {
                if (currentIndex >= timestamps.length) {
                    URL.revokeObjectURL(url);
                    resolve(blobs);
                    return;
                }

                const time = timestamps[currentIndex];
                video.currentTime = time;
            };

            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                // Optionally scale down for AI analysis to save bandwidth?
                // Let's keep original for now or limit to 720p if huge
                if (canvas.width > 1280) {
                    const scale = 1280 / canvas.width;
                    canvas.width = 1280;
                    canvas.height = video.videoHeight * scale;
                }
            };

            video.onseeked = () => {
                if (!ctx) return;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    if (blob) blobs.push(blob);
                    currentIndex++;
                    processNext();
                }, 'image/jpeg', 0.8);
            };

            video.onerror = () => {
                console.error("Video error during extraction");
                currentIndex++;
                processNext();
            };

            // Start
            processNext();
        });
    }
}
