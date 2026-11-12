// Значок достижения — тот же рисунок, что в design/achievements (scripts/achievement-icons.mjs).
import { useId } from 'react';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polyline, Stop, Text as SvgText } from 'react-native-svg';

import { badgeText, type AchievementCategory } from '@/lib/achievements';

/** Материалы уровней: от бронзы до северного сияния */
export const TIERS = [
  { name: 'Бронза', top: '#E9B48A', bottom: '#9A5B33', edge: '#FBE0C8', ink: '#3A1E0C' },
  { name: 'Серебро', top: '#EEF2F6', bottom: '#93A2B2', edge: '#FFFFFF', ink: '#1F2B38' },
  { name: 'Золото', top: '#FBE39A', bottom: '#C48A1E', edge: '#FFF4CF', ink: '#3D2A05' },
  { name: 'Лёд', top: '#D6EEFF', bottom: '#4D86B8', edge: '#F2FAFF', ink: '#0A2238' },
  { name: 'Хвоя', top: '#B7E6E5', bottom: '#317978', edge: '#E6FAF9', ink: '#082524' },
  { name: 'Аметист', top: '#E6D4FF', bottom: '#7552C2', edge: '#F6EEFF', ink: '#1E0E3D' },
  { name: 'Сияние', top: '#7CF5D8', mid: '#5AA8F5', bottom: '#9A5CF0', edge: '#FFFFFF', ink: '#0A1523', glow: true },
] as const;

const LOCKED = { top: '#3A4654', bottom: '#1E2732', edge: '#5B6876', ink: '#7F8C99' };

/** Материал ступени: ступени категории растягиваются на все семь материалов */
export function tierOf(index: number, count: number) {
  return TIERS[Math.min(TIERS.length - 1, Math.floor((index * TIERS.length) / count))];
}

const W = 120;
const H = 132;
const CX = W / 2;
const CY = H / 2;

function hexPath(r: number, round: number): string {
  const pts: [number, number][] = [];
  for (let k = 0; k < 6; k++) {
    const a = ((-90 + k * 60) * Math.PI) / 180;
    pts.push([CX + r * Math.cos(a), CY + r * Math.sin(a)]);
  }
  const t = round / r;
  const toward = (from: [number, number], to: [number, number]): [number, number] => [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
  ];
  let d = '';
  for (let k = 0; k < 6; k++) {
    const p = pts[k];
    const a = toward(p, pts[(k + 5) % 6]);
    const b = toward(p, pts[(k + 1) % 6]);
    d += `${k === 0 ? 'M' : 'L'}${a[0].toFixed(2)} ${a[1].toFixed(2)} Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;
  }
  return `${d}Z`;
}

const OUTER = hexPath(62, 14);
const INNER = hexPath(54, 11);
const GLOW = hexPath(64, 15);

/** Кристалл Snowwy за числом у старших значков */
const CRYSTAL = (() => {
  const chevron: [number, number][] = [
    [-64, -302],
    [0, -152],
    [64, -302],
  ];
  const s = 0.105;
  return [0, 1, 2, 3, 4, 5].map((k) => {
    const t = (k * 60 * Math.PI) / 180;
    return chevron
      .map(([x, y], i) => {
        const px = CX + (x * Math.cos(t) - y * Math.sin(t)) * s;
        const py = CY + 6 + (x * Math.sin(t) + y * Math.cos(t)) * s;
        return `${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`;
      })
      .join(' ');
  });
})();

/** Иконки категорий — те же, что в приложении (Lucide): Gauge, Timer, Route, TrendingDown, Map */
function CategoryIcon({ category, color }: { category: AchievementCategory; color: string }) {
  const common = { stroke: color, strokeWidth: 1.85, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  switch (category) {
    case 'speed':
      return (
        <G {...common}>
          <Path d="m12 14 4-4" />
          <Path d="M3.34 19a10 10 0 1 1 17.32 0" />
        </G>
      );
    case 'avg':
      return (
        <G {...common}>
          <Line x1={10} x2={14} y1={2} y2={2} />
          <Line x1={12} x2={15} y1={14} y2={11} />
          <Circle cx={12} cy={14} r={8} />
        </G>
      );
    case 'length':
      return (
        <G {...common}>
          <Circle cx={6} cy={19} r={3} />
          <Path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
          <Circle cx={18} cy={5} r={3} />
        </G>
      );
    case 'vertical':
      return (
        <G {...common}>
          <Polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
          <Polyline points="16 17 22 17 22 11" />
        </G>
      );
    default:
      return (
        <G {...common}>
          <Path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
          <Path d="M15 5.764v15" />
          <Path d="M9 3.236v15" />
        </G>
      );
  }
}

type Props = {
  category: AchievementCategory;
  value: number;
  /** Номер ступени и сколько ступеней в категории — по ним выбирается материал */
  index: number;
  count: number;
  locked?: boolean;
  /** Ширина значка, пт */
  size?: number;
};

/** Значок достижения: шестиугольник, иконка категории, порог; материал — по уровню. */
export function AchievementBadge({ category, value, index, count, locked = false, size = 72 }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tier = tierOf(index, count);
  const c = locked ? LOCKED : tier;
  const mid = !locked && 'mid' in tier ? tier.mid : null;
  const glow = !locked && 'glow' in tier;
  const { value: big, unit } = badgeText(category, value);
  const fontSize = big.length >= 5 ? 24 : big.length === 4 ? 28 : 32;
  const crystal = !locked && index >= count - 2;

  return (
    <Svg width={size} height={(size * H) / W} viewBox={`0 0 ${W} ${H}`} opacity={locked ? 0.4 : 1}>
      <Defs>
        <LinearGradient id={`f${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.top} />
          {/* У сияния три цвета; у остальных средний совпадает с переходом верх → низ */}
          <Stop offset="0.5" stopColor={mid ?? c.top} stopOpacity={mid ? 1 : 0} />
          <Stop offset="1" stopColor={c.bottom} />
        </LinearGradient>
        <LinearGradient id={`s${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={locked ? 0.06 : 0.55} />
          <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {glow ? <Path d={GLOW} fill="none" stroke={tier.top} strokeOpacity={0.45} strokeWidth={5} /> : null}
      <Path d={OUTER} fill={c.bottom} />
      <Path d={OUTER} fill="none" stroke={c.edge} strokeOpacity={locked ? 0.5 : 0.9} strokeWidth={2} />
      <Path d={INNER} fill={`url(#f${uid})`} />
      <Path d={INNER} fill={`url(#s${uid})`} />
      <Path d={INNER} fill="none" stroke={c.edge} strokeOpacity={locked ? 0.25 : 0.6} strokeWidth={1} />
      {crystal ? (
        <G fill="none" stroke="#FFFFFF" strokeOpacity={0.3} strokeWidth={5.67} strokeLinecap="round" strokeLinejoin="round">
          {CRYSTAL.map((d) => (
            <Path key={d} d={d} />
          ))}
        </G>
      ) : null}
      <G transform={`translate(${CX - 13} 24) scale(${26 / 24})`}>
        <CategoryIcon category={category} color={c.ink} />
      </G>
      <SvgText x={CX} y={CY + 16} textAnchor="middle" fontWeight="800" fontSize={fontSize} letterSpacing={-0.5} fill={c.ink}>
        {big}
      </SvgText>
      <SvgText x={CX} y={CY + 33} textAnchor="middle" fontWeight="700" fontSize={11} letterSpacing={0.6} fill={c.ink} fillOpacity={0.75}>
        {unit.toUpperCase()}
      </SvgText>
    </Svg>
  );
}
