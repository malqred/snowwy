import Svg, { Path } from 'react-native-svg';

const CENTER = 512;
/** Одна «галочка» знака, остриём к центру; остальные пять — её повороты на 60° */
const CHEVRON: [number, number][] = [
  [448, 210],
  [512, 360],
  [576, 210],
];

function rotated(deg: number): string {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return CHEVRON.map(([x, y], i) => {
    const dx = x - CENTER;
    const dy = y - CENTER;
    const px = CENTER + dx * cos - dy * sin;
    const py = CENTER + dx * sin + dy * cos;
    return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join(' ');
}

const PATHS = [0, 60, 120, 180, 240, 300].map(rotated);

/** Знак Snowwy: кристалл из шести «галочек», сходящихся к пустому центру. */
export function Logo({ size = 64, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="150 150 724 724">
      {PATHS.map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
    </Svg>
  );
}
