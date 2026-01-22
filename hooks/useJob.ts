/**
 * useJob Hook
 * 
 * Polls job status until complete or failed.
 * Handles offline detection and automatic retry.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getJob, ApiError } from '../services/api';
import type { Job, JobStatus } from '../types_v2';

interface UseJobOptions {
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number;
  /** Stop polling on these statuses (default: completed, failed) */
  stopOnStatus?: JobStatus[];
  /** Callback when job completes */
  onComplete?: (job: Job) => void;
  /** Callback when job fails */
  onError?: (error: Error) => void;
}

interface UseJobReturn {
  job: Job | null;
  loading: boolean;
  error: Error | null;
  /** Manually refetch job */
  refetch: () => Promise<void>;
  /** Stop polling */
  stop: () => void;
}

export function useJob(
  jobId: string | null,
  options: UseJobOptions = {}
): UseJobReturn {
  const {
    pollInterval = 3000,
    stopOnStatus = ['completed', 'failed'],
    onComplete,
    onError,
  } = options;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const pollTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  // Track poll count to prevent infinite polling
  const pollCountRef = useRef(0);
  const MAX_POLLS = 1800; // 90 minutes max at 3s intervals

  const fetchJob = useCallback(async () => {
    if (!jobId || !mountedRef.current) return;

    // Check max polls
    pollCountRef.current++;
    if (pollCountRef.current > MAX_POLLS) {
      const timeoutError = new Error('Job timeout - analysis took too long. Please try again.');
      setError(timeoutError);
      stop();
      onError?.(timeoutError);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const fetchedJob = await getJob(jobId);

      if (!mountedRef.current) return;

      setJob(fetchedJob);

      // Check if we should stop polling
      if (stopOnStatus.includes(fetchedJob.status)) {
        stop();

        if (fetchedJob.status === 'completed') {
          onComplete?.(fetchedJob);
        } else if (fetchedJob.status === 'failed') {
          const err = new Error(fetchedJob.error?.message || 'Job failed');
          setError(err);
          onError?.(err);
        }
      } else {
        // Continue polling
        pollTimeoutRef.current = window.setTimeout(fetchJob, pollInterval);
      }
    } catch (err) {
      if (!mountedRef.current) return;

      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);

      // Retry on network errors, stop on 404
      if (err instanceof ApiError && err.status === 404) {
        stop();
        onError?.(error);
      } else {
        // Retry with backoff
        pollTimeoutRef.current = window.setTimeout(fetchJob, pollInterval * 2);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [jobId, pollInterval, stopOnStatus, onComplete, onError, stop]);

  // Start polling when jobId changes
  useEffect(() => {
    if (jobId) {
      setJob(null);
      setError(null);
      fetchJob();
    } else {
      stop();
      setJob(null);
    }

    return stop;
  }, [jobId, fetchJob, stop]);

  return {
    job,
    loading,
    error,
    refetch: fetchJob,
    stop,
  };
}

/**
 * Hook for just checking if a job is done
 */
export function useJobStatus(jobId: string | null): {
  status: JobStatus | null;
  progress: number;
  isComplete: boolean;
  isFailed: boolean;
  isProcessing: boolean;
} {
  const { job } = useJob(jobId);

  return {
    status: job?.status ?? null,
    progress: job?.progress?.overall ?? 0,
    isComplete: job?.status === 'completed',
    isFailed: job?.status === 'failed',
    isProcessing: job?.status === 'processing',
  };
}
