import React, { useState, useEffect, useRef } from 'react';
import { thumbnailGenerator } from '../utils/thumbnailUtils';

interface VideoThumbnailProps {
  videoUrl: string | null;
  timecode: string | number;
  alt?: string;
  className?: string;
}

const VideoThumbnail: React.FC<VideoThumbnailProps> = ({ videoUrl, timecode, alt = 'Video thumbnail', className = '' }) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setThumbnail(null);
  }, [videoUrl, timecode]);

  useEffect(() => {
    // If no video URL is provided, we can't generate a thumbnail.
    if (!isVisible || !videoUrl || thumbnail) return;

    let isMounted = true;
    thumbnailGenerator.generateThumbnail(videoUrl, timecode).then((dataUrl) => {
      if (isMounted) setThumbnail(dataUrl);
    });

    return () => { isMounted = false; };
  }, [isVisible, videoUrl, timecode, thumbnail]);

  return (
    <div ref={imgRef} className={`relative overflow-hidden bg-gray-800 rounded-md ${className}`} style={{ minHeight: '60px', minWidth: '100px' }}>
      {thumbnail ? (
        <img src={thumbnail} alt={alt} className="w-full h-full object-cover animate-fade-in" />
      ) : !videoUrl ? (
        // Fallback when video URL is missing (e.g. history/cloud mode)
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 border border-gray-700/50 p-2 text-center">
          <svg className="w-5 h-5 text-gray-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15V19M12 19L15 17M12 19L9 17" /></svg>
          <span className="text-[9px] text-gray-500 font-medium leading-tight">Cloud<br />File</span>
        </div>
      ) : (
        // Loading state
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-gray-600 border-t-gray-400 rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

export default VideoThumbnail;