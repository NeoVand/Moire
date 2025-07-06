import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

export function MoireAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const pausedProgressRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size - optimized for the animation
    const width = 300;  // Slightly more than 2 * diameter (2 * 140 = 280)
    const height = 200; // Increased height for better visibility
    
    // Get device pixel ratio for retina display support
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // Set actual canvas size in memory (scaled up for retina)
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    
    // Scale the context back down to the original size
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    // Set display size (CSS pixels)
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    let startTime = Date.now();
    const animationDuration = 12000; // 12 seconds for more relaxed movement

    const drawConcentricCircles = (
      ctx: CanvasRenderingContext2D,
      centerX: number,
      centerY: number,
      maxRadius: number,
      rings: number
    ) => {
      ctx.strokeStyle = 'black';
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.2; // Increased line width for better visibility

      for (let i = 1; i <= rings; i++) {
        const radius = (i / rings) * maxRadius;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
    };

    const drawFrame = (progress: number) => {
      // Clear canvas with slightly transparent white background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(0, 0, width, height);

      const maxRadius = 70;
      const rings = 20;
      const centerX = width / 2;
      const centerY = height / 2;

      // Create a perfect loop with dramatic slowdown at center convergence
      const rawT = Math.sin(progress * 2 * Math.PI);
      
      // Apply power easing to slow down near center (t = 0)
      // Using power > 1 (3.0) to create dramatic slowdown when circles converge
      const easedT = Math.sign(rawT) * Math.pow(Math.abs(rawT), 3.0);
      const t = easedT * Math.PI;
      
      // This creates:
      // - Smooth continuous loop (no direction reversals)
      // - Dramatic slowdown when centers match (t ≈ 0)
      // - Faster motion at the extremes for dynamic contrast

      // Parametric equations for spiral paths
      // Scale by maxRadius to fit our canvas coordinate system
      const scale = maxRadius;
      
      // Left circle path: x = t*cos(3t)/(2*PI), y = t*sin(3t)/(4*PI)
      const leftX = centerX + scale * t * Math.cos(3 * t) / (2 * Math.PI);
      const leftY = centerY + scale * t * Math.sin(3 * t) / (4 * Math.PI);
      
      // Right circle path: x = -t*cos(3t)/(2*PI), y = -t*sin(3t)/(4*PI)
      const rightX = centerX - scale * t * Math.cos(3 * t) / (2 * Math.PI);
      const rightY = centerY - scale * t * Math.sin(3 * t) / (4 * Math.PI);

      drawConcentricCircles(ctx, leftX, leftY, maxRadius, rings);
      drawConcentricCircles(ctx, rightX, rightY, maxRadius, rings);
    };

    const animate = () => {
      if (!isPlaying) {
        // Keep drawing the current paused frame
        drawFrame(pausedProgressRef.current);
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // When resuming from pause, adjust startTime to continue from paused progress
      if (pausedTimeRef.current > 0) {
        const resumeTime = pausedProgressRef.current * animationDuration;
        startTime = Date.now() - resumeTime;
        pausedTimeRef.current = 0;
      }

      const currentTime = Date.now();
      const elapsed = (currentTime - startTime) % animationDuration;
      const progress = elapsed / animationDuration;
      
      // Store current progress for paused state
      pausedProgressRef.current = progress;

      drawFrame(progress);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current !== undefined) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying]);

  const togglePlayPause = () => {
    if (isPlaying) {
      // About to pause - pausedProgressRef.current is already set in animate()
      setIsPlaying(false);
          } else {
        // About to resume - trigger the resume mechanism
        pausedTimeRef.current = 1; // Set to any non-zero value to trigger resume logic
        setIsPlaying(true);
      }
  };

  return (
    <div className="flex flex-col items-center">
      <div 
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <canvas
          ref={canvasRef}
          className="rounded-lg border border-[var(--border)]/30"
        />
        
        {/* Play/Pause Toggle - only visible on hover */}
        {isHovered && (
          <button
            onClick={togglePlayPause}
            className="absolute top-2 right-2 w-8 h-8 bg-black/20 hover:bg-black/40 backdrop-blur-sm text-white rounded-lg transition-all duration-200 flex items-center justify-center"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
} 