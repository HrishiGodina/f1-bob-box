import { useMemo } from 'react';
import { CIRCUIT_GEOJSON } from '../../circuits/index';
import { CIRCUIT_ID_MAP, geoJsonToSvgPath, fallbackTrackPath } from '../../circuits/track';

export const CircuitTrack3D = ({ circuitId }: { circuitId: string }) => {
  const uid = useMemo(() => (circuitId || 'default').replace(/[^a-z0-9]/gi, '_'), [circuitId]);

  const path = useMemo(() => {
    const key = CIRCUIT_ID_MAP[circuitId];
    const geojson = key ? CIRCUIT_GEOJSON[key] : null;
    if (geojson) return geoJsonToSvgPath(geojson);
    return fallbackTrackPath(circuitId || 'default');
  }, [circuitId]);

  if (!path) return null;

  return (
    <div className="relative w-full h-full" style={{ minHeight: '180px' }}>
      <svg viewBox="0 0 440 310" className="w-full h-full" style={{ transform: 'perspective(620px) rotateX(26deg)', transformOrigin: 'center 62%' }}>
        <defs>
          <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={`dot-${uid}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={path} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" transform="translate(5,14)" opacity={0.55} />
        <path d={path} fill="none" stroke="rgba(204,0,0,0.18)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" filter={`url(#glow-${uid})`} />
        <path d={path} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} fill="none" stroke="#cc0000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="12 8" opacity={0.7} />
        <path d={path} fill="none" stroke="#cc0000" strokeWidth="9" strokeLinecap="butt" strokeDasharray="4 9999" opacity={0.95} />
        <circle r="14" fill="none" stroke="#cc0000" strokeWidth="1.5" opacity={0.3} filter={`url(#dot-${uid})`}>
          <animateMotion dur="9s" repeatCount="indefinite" path={path} rotate="auto" />
        </circle>
        <circle r="5" fill="#cc0000" filter={`url(#dot-${uid})`}>
          <animateMotion dur="9s" repeatCount="indefinite" path={path} rotate="auto" />
        </circle>
      </svg>
    </div>
  );
};
