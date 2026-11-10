import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

/**
 * Данные для окна на экране блокировки.
 * Все значения уже отформатированы: внутри виджета нельзя вызывать функции приложения.
 */
export type RideActivityProps = {
  /** Начало катания, мс с начала эпохи — от него идёт таймер */
  startedAt: number;
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

  return {
    banner: (
      <VStack spacing={10} modifiers={[padding({ all: 16 })]}>
        <HStack alignment="firstTextBaseline" spacing={8}>
          <Text modifiers={[font({ size: 44, weight: 'bold' }), monospacedDigit()]}>{props.runs}</Text>
          <Text modifiers={[font({ size: 17, weight: 'medium' }), foregroundStyle(muted)]}>{props.runsLabel}</Text>
          <Spacer />
          <VStack alignment="trailing" spacing={2}>
            <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{props.state}</Text>
            <Text
              date={started}
              dateStyle="timer"
              modifiers={[font({ size: 15 }), monospacedDigit(), foregroundStyle(muted)]}
            />
          </VStack>
        </HStack>
        <HStack spacing={12}>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(muted)]}>СКОРОСТЬ</Text>
            <Text modifiers={[font({ size: 17, weight: 'semibold' }), monospacedDigit()]}>{props.speed} км/ч</Text>
          </VStack>
          <Spacer />
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(muted)]}>МАКС.</Text>
            <Text modifiers={[font({ size: 17, weight: 'semibold' }), monospacedDigit()]}>{props.maxSpeed} км/ч</Text>
          </VStack>
          <Spacer />
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(muted)]}>ДИСТАНЦИЯ</Text>
            <Text modifiers={[font({ size: 17, weight: 'semibold' }), monospacedDigit()]}>{props.distance}</Text>
          </VStack>
          <Spacer />
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(muted)]}>ПЕРЕПАД</Text>
            <Text modifiers={[font({ size: 17, weight: 'semibold' }), monospacedDigit()]}>{props.vertical}</Text>
          </VStack>
        </HStack>
      </VStack>
    ),
    compactLeading: <Image systemName="figure.skiing.downhill" />,
    compactTrailing: <Text modifiers={[monospacedDigit()]}>{props.runs}</Text>,
    minimal: <Text modifiers={[monospacedDigit()]}>{props.runs}</Text>,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 8 })]}>
        <Text modifiers={[font({ size: 28, weight: 'bold' }), monospacedDigit()]}>{props.runs}</Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted)]}>{props.runsLabel}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 8 })]}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' })]}>{props.state}</Text>
        <Text date={started} dateStyle="timer" modifiers={[font({ size: 13 }), monospacedDigit(), foregroundStyle(muted)]} />
      </VStack>
    ),
    expandedBottom: (
      <HStack spacing={12} modifiers={[padding({ horizontal: 8, bottom: 4 })]}>
        <Text modifiers={[font({ size: 14 }), monospacedDigit()]}>{props.speed} км/ч</Text>
        <Spacer />
        <Text modifiers={[font({ size: 14 }), monospacedDigit()]}>{props.distance}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 14 }), monospacedDigit()]}>{props.vertical}</Text>
      </HStack>
    ),
  };
};

export default createLiveActivity('RideActivity', RideActivity);
