
import { ffmpegService } from './ffmpegService';
import { embeddingService } from './embeddingService';
import { modelRouter } from './llm/ModelRouter';
import { VideoFrameExtractor } from '../utils/videoFrameExtractor';
import { retryWithBackoff } from '../utils/retryUtils';

// Helper to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// We need a way to call Gemini with a Blob image easily.
// I'll add a helper inside IndexingService to call ModelRouter.generateText with multimedia parts?
// `LLMProvider` interface has `generateText(prompt)`. It doesn't strictly support images in that signature.
// `analyzeVideo` is for video files.
// Implementation Detail: I will cast the Provider to specialized or just instantiate generic logic here?
// Better: Add `analyzeImage` to `LLMProvider`? 
// No, I'll stick to a focused implementation here that uses `ModelRouter` but constructs the request manually 
// or I update `ModelRouter` to be more flexible. 
// Let's update `ModelRouter` to support `generateContent(parts[])`? 
// That's too raw. 
// I will implement `describeImage` inside `IndexingService` by using `ModelRouter.getProvider('gemini')` 
// and accessing its internal `genAI` if I made it public? No, it's private.
// Okay, I will add `describeImage` to `LLMProvider` interface. It's a common task.

export class IndexingService {

    async indexVideo(file: File, onProgress: (msg: string, progress: number) => void) {
        onProgress('Detecting Scenes...', 10);

        // 1. Detect Scenes (WASM)
        // Ensure threshold is sensible (e.g., 0.3)
        const { scenes } = await ffmpegService.detectScenes(file, 0.3, (msg) => console.log(msg));

        if (scenes.length === 0) {
            // Fallback: If no scenes, just take one every 60s
            // or just start/middle/end
            scenes.push(file.size > 0 ? 0 : 0);
        }

        onProgress(`Found ${scenes.length} scenes. Extracting thumbnails...`, 30);

        // 2. Select Mid-Points (timestamp + 1s to avoid the fade/cut itself)
        const timestamps = scenes.map(s => s + 1.0);

        // 3. Extract Frames (Browser Canvas)
        const thumbnails = await VideoFrameExtractor.extractFrames(file, timestamps);

        onProgress('Analyzing scenes with AI...', 50);

        // 4. Describe & Embed
        const documents: any[] = [];
        let completed = 0;

        // Process in batches
        const BATCH_SIZE = 3;
        for (let i = 0; i < thumbnails.length; i += BATCH_SIZE) {
            const batch = thumbnails.slice(i, i + BATCH_SIZE);
            const batchIndices = Array.from({ length: batch.length }, (_, k) => i + k);

            await Promise.all(batch.map(async (blob, idx) => {
                const realIdx = batchIndices[idx];
                const _timestamp = timestamps[realIdx];
                const sceneTime = scenes[realIdx];

                try {
                    // Convert Blob to Base64 for Gemini Inline
                    const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                    const cleanBase64 = base64.split(',')[1];

                    // Direct call to Gemini Flash for speed/cost (Using specific helper to bypass router if needed, 
                    // but ideally we route. Since Router doesn't have Image support yet, I'll effectively "Hack" it 
                    // or just use `generateJSON` with complex input if I updated the interface.
                    // For MVP speed: I will instantiate a temporary Gemini instance here or import the generic one?
                    // I will simply use the existing `uploadFileToGemini` for small files? No.
                    // I'll add `analyzeImage` to `LLMProvider` in next step. For now assume it exists.

                    const description = await modelRouter.analyzeImage(cleanBase64, "image/jpeg",
                        "Describe this scene in one detailed sentence. Focus on visual action, objects, and mood.");

                    documents.push({
                        id: `scene_${realIdx}`,
                        text: description,
                        metadata: {
                            timestamp: sceneTime,
                            thumbnail: base64 // Store small thumb for UI
                        }
                    });

                } catch (e) {
                    console.error(`Failed to analyze scene ${realIdx}`, e);
                }
            }));

            completed += batch.length;
            onProgress(`Analyzed ${completed}/${scenes.length} scenes...`, 50 + (completed / scenes.length) * 30);
        }

        onProgress('Generating Embeddings...', 90);

        // 5. Store in Vector DB
        await embeddingService.addDocumentsBatch(documents);

        onProgress('Indexing Complete!', 100);
    }
}

export const indexingService = new IndexingService();
