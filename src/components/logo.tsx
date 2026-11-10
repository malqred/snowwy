import Svg, { Circle, Line, Path } from 'react-native-svg';

/** Знак Snowwy: мачта, перекладина с плюсом и склон. */
export function Logo({ size = 64, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        d="M318 592 L548 503 L548 770 Q505 645 318 592 Z M432 596 L502 652 L502 570 Z"
        fill={color}
        fillRule="evenodd"
      />
      <Line x1={548} y1={262} x2={548} y2={770} stroke={color} strokeWidth={48} strokeLinecap="round" />
      <Line x1={318} y1={592} x2={742} y2={428} stroke={color} strokeWidth={48} strokeLinecap="round" />
      <Line x1={668} y1={392} x2={668} y2={522} stroke={color} strokeWidth={48} strokeLinecap="round" />
      <Circle cx={392} cy={388} r={24} stroke={color} strokeWidth={7} fill="none" />
      <Circle cx={392} cy={388} r={7} fill={color} />
    </Svg>
  );
}
