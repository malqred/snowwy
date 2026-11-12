import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

import { batteryColor } from '@/lib/geo';
import { useTheme } from '@/theme';

type Props = {
  /** Заряд, % */
  level: number;
  charging?: boolean;
  /** Высота значка, пт; ширина считается сама */
  height?: number;
};

const BOLT = 'M40 3 L32 13.5 H37 L35 21 L43 10.5 H38 Z';

export { batteryColor } from '@/lib/geo';

/**
 * Значок батарейки с процентами внутри, как в строке состояния телефона.
 * При зарядке рядом с числом — молния.
 */
export function Battery({ level, charging = false, height = 22 }: Props) {
  const t = useTheme();
  const value = Math.max(0, Math.min(100, Math.round(level)));
  // Рисуем в своих единицах 56×24 и растягиваем до нужного размера
  const W = 56;
  const H = 24;
  const body = 50;
  const inner = body - 6;
  const fill = Math.max(4, (inner * value) / 100);
  const color = batteryColor(value);
  const label = `${value}`;
  // Молния занимает место справа от числа
  const textX = charging ? 21 : body / 2;

  return (
    <Svg
      width={(height * W) / H}
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      accessibilityRole="image"
      accessibilityLabel={`Заряд ${value}%${charging ? ', заряжается' : ''}`}>
      {/* Корпус и контакт */}
      <Rect x={1.25} y={1.25} width={body - 2.5} height={H - 2.5} rx={6} fill="none" stroke={t.text} strokeWidth={2.5} />
      <Rect x={body + 1} y={8} width={4} height={8} rx={1.5} fill={t.text} />
      {/* Заряд */}
      <Rect x={3} y={3} width={fill} height={H - 6} rx={4} fill={color} />
      {/* Сначала обводка цвета фона, поверх — само число: оно читается и на заливке, и на пустой части */}
      <SvgText
        x={textX}
        y={H / 2 + 5}
        fontSize={14}
        fontWeight="800"
        textAnchor="middle"
        fill={t.bg}
        stroke={t.bg}
        strokeWidth={3}
        strokeLinejoin="round">
        {label}
      </SvgText>
      <SvgText x={textX} y={H / 2 + 5} fontSize={14} fontWeight="800" textAnchor="middle" fill={t.text}>
        {label}
      </SvgText>
      {charging ? (
        <>
          <Path d={BOLT} fill={t.bg} stroke={t.bg} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d={BOLT} fill={t.text} />
        </>
      ) : null}
    </Svg>
  );
}
