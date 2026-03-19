
import { parseTimecode } from './tableUtils';

interface Task {
  id: string;
  videoUrl: string;
  time: number;
  originalTimecode?: string; // Store original string to retry parsing if needed
  resolve: (dataUrl: string) => void;
  reject: (err: any) => void;
}

class ThumbnailGenerator {
  private stack: Task[] = [];
  private isProcessing = false;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private currentVideoUrl: string | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      this.videoElement = document.createElement('video');
      this.videoElement.muted = true;
      this.videoElement.crossOrigin = 'anonymous';
      this.videoElement.preload = 'auto';
      this.videoElement.playsInline = true;

      // FORCE DOM ATTACHMENT: Browsers deprioritize detached video rendering
      // Styles to keep it hidden but "visible" to the layout engine
      this.videoElement.style.position = 'fixed';
      this.videoElement.style.top = '-9999px';
      this.videoElement.style.left = '-9999px';
      this.videoElement.style.width = '240px';
      this.videoElement.style.height = '135px';
      this.videoElement.style.opacity = '0';
      this.videoElement.style.pointerEvents = 'none';

      document.body.appendChild(this.videoElement);

      this.canvasElement = document.createElement('canvas');
    }
  }

  public generateThumbnail(videoUrl: string, timecode: string | number, frameRate: number = 25): Promise<string> {
    const time = typeof timecode === 'string' ? parseTimecode(timecode, frameRate) : timecode;
    const id = `${videoUrl}-${time}`;

    // Deduplicate: If request exists, remove it (we will re-add at the top of stack)
    this.stack = this.stack.filter(t => t.id !== id);

    return new Promise((resolve, reject) => {
      // LIFO: Unshift (add to front) to prioritize most recent request (scrolling down)
      this.stack.unshift({
        id,
        videoUrl,
        time,
        originalTimecode: typeof timecode === 'string' ? timecode : undefined,
        resolve,
        reject
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing || this.stack.length === 0 || !this.videoElement || !this.canvasElement) return;

    this.isProcessing = true;
    const task = this.stack.shift(); // Get newest task

    if (!task) {
      this.isProcessing = false;
      return;
    }

    try {
      // 1. Load Source
      if (this.currentVideoUrl !== task.videoUrl) {
        this.videoElement.src = task.videoUrl;
        this.currentVideoUrl = task.videoUrl;
        await new Promise((resolve, reject) => {
          const onLoaded = () => { cleanup(); resolve(true); };
          const onError = () => { cleanup(); reject(new Error('Video load failed')); };
          const cleanup = () => {
            this.videoElement?.removeEventListener('loadeddata', onLoaded);
            this.videoElement?.removeEventListener('error', onError);
          };
          this.videoElement?.addEventListener('loadeddata', onLoaded);
          this.videoElement?.addEventListener('error', onError);
        });
      }

      // 2. Validate and Correct Time
      let seekTime = task.time;
      const duration = this.videoElement.duration;

      // Heuristic: If parsed time is way longer than duration, and we have the original string,
      // it's likely a parsing error (e.g. MM:SS:FF parsed as HH:MM:SS)
      if (seekTime > duration && task.originalTimecode) {
        console.warn(`Timecode ${task.originalTimecode} parsed as ${seekTime}s which exceeds duration ${duration}s. Attempting fallback parse.`);

        const parts = task.originalTimecode.split(/[:;]/);
        // If 3 parts (XX:YY:ZZ) and first parse failed, try MM:SS:FF interpretation
        if (parts.length === 3) {
          const m = parseInt(parts[0], 10);
          const s = parseInt(parts[1], 10);
          const f = parseInt(parts[2], 10);
          const alternateTime = (m * 60) + s + (f / 25); // Assume 25fps for fallback

          if (alternateTime <= duration) {
            console.log(`Fallback parse successful: Interpreted ${task.originalTimecode} as MM:SS:FF -> ${alternateTime}s`);
            seekTime = alternateTime;
          }
        }
      }

      // Clamp to duration to avoid seeking past end
      if (seekTime > duration) {
        console.warn(`Clamping seek time ${seekTime}s to duration ${duration}s`);
        seekTime = duration - 0.1; // Seek slightly before end to get a frame
      }

      // 3. Seek to specific time
      const targetTime = Math.min(seekTime, duration - 0.1);
      this.videoElement.currentTime = targetTime;

      // 4. Wait for seek + frame decode verification
      // We wait for BOTH 'seeked' (media engine done) AND 'timeupdate' (frame actually decoded)
      // This prevents capturing a stale frame from the previous seek position
      const seekSuccess = await new Promise<boolean>((resolve) => {
        let seeked = false;
        let timeUpdated = false;

        const timeoutId = setTimeout(() => {
          cleanup();
          // If seeked fired but timeupdate didn't, still try to capture
          resolve(seeked);
        }, 6000);

        const checkDone = () => {
          if (seeked && timeUpdated) {
            cleanup();
            resolve(true);
          }
        };

        const onSeeked = () => {
          seeked = true;
          checkDone();
        };

        const onTimeUpdate = () => {
          timeUpdated = true;
          checkDone();
        };

        const onError = () => {
          cleanup();
          resolve(false);
        };

        const cleanup = () => {
          clearTimeout(timeoutId);
          this.videoElement?.removeEventListener('seeked', onSeeked);
          this.videoElement?.removeEventListener('timeupdate', onTimeUpdate);
          this.videoElement?.removeEventListener('error', onError);
        };

        this.videoElement?.addEventListener('seeked', onSeeked);
        this.videoElement?.addEventListener('timeupdate', onTimeUpdate);
        this.videoElement?.addEventListener('error', onError);
      });

      // 5. Capture with double-RAF to ensure GPU texture is flushed
      if (seekSuccess && this.canvasElement && this.videoElement) {
        // Double requestAnimationFrame: first RAF schedules the
        // compositing of the new video frame, second RAF ensures
        // the GPU texture has been uploaded and is ready for drawImage
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const ctx = this.canvasElement.getContext('2d');
        if (ctx) {
          const videoRatio = this.videoElement.videoWidth / this.videoElement.videoHeight;
          const targetWidth = 240;
          const targetHeight = targetWidth / videoRatio;

          this.canvasElement.width = targetWidth;
          this.canvasElement.height = targetHeight;

          ctx.drawImage(this.videoElement, 0, 0, targetWidth, targetHeight);
          try {
            const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.6);
            task.resolve(dataUrl);
            return;
          } catch (e) {
            console.warn('Canvas export failed', e);
          }
        }
      }

      // Fallback (Timeout, Error, or Canvas Fail)
      task.resolve('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

    } catch (error) {
      console.warn('Thumbnail generation failed:', error);
      // Transparent pixel fallback
      task.resolve('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    } finally {
      this.isProcessing = false;
      // Use requestAnimationFrame for smoother UI yielding
      requestAnimationFrame(() => this.processQueue());
    }
  }
}

export const thumbnailGenerator = new ThumbnailGenerator();
