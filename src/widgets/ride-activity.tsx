import { Button, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  resizable,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

/**
 * Данные для окна на экране блокировки и для островка.
 * Все значения уже отформатированы: внутри виджета нельзя вызывать функции приложения.
 */
export type RideActivityProps = {
  /** Начало отсчёта таймера, мс с начала эпохи (время старта, сдвинутое на паузы) */
  startedAt: number;
  /** Время на момент паузы («12:34»). Пусто, пока запись идёт — тогда таймер идёт сам */
  frozen: string;
  /** Адрес файла со знаком приложения. Пусто — показываем значок лыжника */
  icon: string;
  /** Показать вместо кнопок вопрос «Завершить катание?» */
  confirm: boolean;
  /** «Спуск», «Подъём», «Пауза» */
  state: string;
  /** Число спусков и слово к нему: «7» и «спусков» */
  runs: string;
  runsLabel: string;
  /** Текущая и максимальная скорость, км/ч */
  speed: string;
  maxSpeed: string;
  /** Дистанция и перепад с единицами: «13,5 км», «3 517 м» */
  distance: string;
  vertical: string;
};

// Функция выполняется в отдельной среде виджета: без хуков, без обращения
// к чему-либо за её пределами, кроме импортированных компонентов.
const RideActivity = (props: RideActivityProps) => {
  'widget';
  const muted = '#8E8E93';
  const started = new Date(props.startedAt);

  // Знак приложения для островка
  const logo = (size: number) =>
    props.icon ? (
      <Image uiImage={props.icon} modifiers={[resizable(), frame({ width: size, height: size })]} />
    ) : (
      <Image systemName="figure.skiing.downhill" size={size - 6} />
    );

  // Время катания: идёт само, на паузе стоит
  const timer = (size: number, color: string, width: number) =>
    props.frozen ? (
      <Text modifiers={[font({ size }), monospacedDigit(), foregroundStyle(color)]}>{props.frozen}</Text>
    ) : (
      <Text
        date={started}
        dateStyle="timer"
        modifiers={[
          font({ size }),
          monospacedDigit(),
          foregroundStyle(color),
          multilineTextAlignment('trailing'),
          frame({ maxWidth: width }),
        ]}
      />
    );

  const stat = (label: string, value: string) => (
    <VStack alignment="leading" spacing={2}>
      <Text
        modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(muted), lineLimit(1), minimumScaleFactor(0.6)]}>
        {label}
      </Text>
      <Text modifiers={[font({ size: 17, weight: 'semibold' }), monospacedDigit(), lineLimit(1), minimumScaleFactor(0.6)]}>
        {value}
      </Text>
    </VStack>
  );

  return {
    banner: (
      <VStack spacing={10} modifiers={[padding({ all: 16 })]}>
        <HStack alignment="firstTextBaseline" spacing={8}>
          <Text modifiers={[font({ size: 44, weight: 'bold' }), monospacedDigit()]}>{props.runs}</Text>
          <Text modifiers={[font({ size: 17, weight: 'medium' }), foregroundStyle(muted)]}>{props.runsLabel}</Text>
          <Spacer />
          <VStack alignment="trailing" spacing={2}>
            <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{props.state}</Text>
            {timer(15, muted, 90)}
          </VStack>
        </HStack>
        <HStack spacing={8}>
          {stat('СКОРОСТЬ', `${props.speed} км/ч`)}
          <Spacer />
          {stat('МАКС.', `${props.maxSpeed} км/ч`)}
          <Spacer />
          {stat('ДИСТАНЦИЯ', props.distance)}
          <Spacer />
          {stat('ПЕРЕПАД', props.vertical)}
        </HStack>
      </VStack>
    ),
    compactLeading: logo(24),
    compactTrailing: timer(15, '#FFFFFF', 64),
    minimal: logo(22),
    expandedLeading: (
      <HStack spacing={8} modifiers={[padding({ leading: 8 })]}>
        {logo(30)}
        <VStack alignment="leading" spacing={0}>
          <Text modifiers={[font({ size: 24, weight: 'bold' }), monospacedDigit()]}>{props.runs}</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{props.runsLabel}</Text>
        </VStack>
      </HStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 8 })]}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{props.state}</Text>
        {timer(13, muted, 80)}
      </VStack>
    ),
    expandedBottom: (
      <VStack spacing={8} modifiers={[padding({ horizontal: 8, bottom: 4 })]}>
        <HStack spacing={12}>
          <Text modifiers={[font({ size: 14 }), monospacedDigit()]}>{props.speed} км/ч</Text>
          <Spacer />
          <Text modifiers={[font({ size: 14 }), monospacedDigit()]}>{props.distance}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 14 }), monospacedDigit()]}>{props.vertical}</Text>
        </HStack>
        {props.confirm ? (
          // Второе нажатие — чтобы катание не завершилось от случайного касания
          <HStack spacing={8}>
            <Button target="stop-no" label="Не завершать" modifiers={[buttonStyle('bordered'), controlSize('small'), tint('#FFFFFF')]} />
            <Spacer />
            <Button
              target="stop-yes"
              label="Да, завершить"
              modifiers={[buttonStyle('borderedProminent'), controlSize('small'), tint('#E8695C')]}
            />
          </HStack>
        ) : (
          <HStack spacing={8}>
            <Button
              target="pause"
              label={props.frozen ? 'Продолжить' : 'Пауза'}
              systemImage={props.frozen ? 'play.fill' : 'pause.fill'}
              modifiers={[buttonStyle('bordered'), controlSize('small'), tint('#FFFFFF')]}
            />
            <Spacer />
            <Button
              target="stop"
              label="Завершить"
              systemImage="flag.checkered"
              modifiers={[buttonStyle('bordered'), controlSize('small'), tint('#FFFFFF')]}
            />
          </HStack>
        )}
      </VStack>
    ),
  };
};

export default createLiveActivity('RideActivity', RideActivity);
