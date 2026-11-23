import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import './TransitLoadingAnimation.css';

type TransitMode = 'train' | 'bus' | 'tram';

interface TransitLoadingAnimationProps {
  mode: TransitMode;
  label: string;
  compact?: boolean;
}

export default function TransitLoadingAnimation({ mode, label, compact = false }: TransitLoadingAnimationProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const vehicleRef = useRef<SVGSVGElement>(null);
  const trackRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const vehicle = vehicleRef.current;
    if (!scene || !vehicle) return;

    const media = gsap.matchMedia();
    media.add({ always: 'all', reduceMotion: '(prefers-reduced-motion: reduce)' }, ({ conditions }) => {
      const reducedMotion = Boolean(conditions?.reduceMotion);
      gsap.fromTo(vehicle, { x: -104 }, {
        x: scene.clientWidth + 104,
        duration: reducedMotion ? 7 : 2.8,
        ease: 'none',
        repeat: -1,
      });
      if (trackRef.current) {
        gsap.to(trackRef.current, { strokeDashoffset: -28, duration: reducedMotion ? 2.2 : 0.7, ease: 'none', repeat: -1 });
      }
    });

    return () => media.revert();
  }, [mode]);

  return (
    <div className={`transit-loader${compact ? ' transit-loader--compact' : ''}`} role="status" aria-live="polite" aria-busy="true">
      <div ref={sceneRef} className={`transit-loader__scene transit-loader__scene--${mode}`} aria-hidden="true">
        <svg className="transit-loader__track" viewBox="0 0 320 76" preserveAspectRatio="none">
          {mode === 'train' ? <>
            <path d="M0 51H320" className="transit-loader__rail" />
            <path ref={trackRef} d="M0 54H320" className="transit-loader__sleepers" />
            <path d="M0 60H320" className="transit-loader__rail" />
          </> : <>
            <path d="M0 55H320" className="transit-loader__road" />
            <path ref={trackRef} d="M0 55H320" className="transit-loader__road-markings" />
          </>}
        </svg>
        <svg ref={vehicleRef} className={`transit-loader__vehicle transit-loader__vehicle--${mode}`} viewBox="0 0 100 56">
          {mode === 'train' && <g>
            <path className="transit-loader__body" d="M12 9h66c8 0 13 6 13 14v17H8V16c0-4 2-7 4-7Z" />
            <path className="transit-loader__window" d="M17 14h20v12H17zm25 0h18v12H42zm23 0h10c4 0 7 3 7 7v5H65z" />
            <path className="transit-loader__trim" d="M9 34h81M19 40l-4 8m64-8 4 8" />
            <circle className="transit-loader__wheel" cx="25" cy="43" r="4" /><circle className="transit-loader__wheel" cx="73" cy="43" r="4" />
            <path className="transit-loader__light" d="M87 30h4" />
          </g>}
          {mode === 'bus' && <g>
            <path className="transit-loader__body" d="M10 13c0-4 3-7 7-7h60c7 0 12 5 12 12v22H10V13Z" />
            <path className="transit-loader__window" d="M16 12h19v13H16zm23 0h18v13H39zm22 0h10c5 0 8 4 8 9v4H61z" />
            <path className="transit-loader__trim" d="M10 31h79M18 40l-3 7m62-7 3 7" />
            <circle className="transit-loader__wheel" cx="26" cy="42" r="4" /><circle className="transit-loader__wheel" cx="72" cy="42" r="4" />
            <path className="transit-loader__light" d="M86 28h3" />
          </g>}
          {mode === 'tram' && <g>
            <path className="transit-loader__body" d="M8 11c0-4 3-7 7-7h67c6 0 10 5 10 11v25H8V11Z" />
            <path className="transit-loader__window" d="M14 10h17v15H14zm21 0h17v15H35zm21 0h17v15H56zm21 0h8v15h-8z" />
            <path className="transit-loader__trim" d="M8 31h84M17 40l-3 7m66-7 3 7" />
            <circle className="transit-loader__wheel" cx="25" cy="42" r="4" /><circle className="transit-loader__wheel" cx="74" cy="42" r="4" />
            <path className="transit-loader__light" d="M89 28h3" />
          </g>}
        </svg>
      </div>
      <span className="transit-loader__label">{label}</span>
    </div>
  );
}
