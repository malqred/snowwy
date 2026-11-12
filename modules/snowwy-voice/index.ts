import { requireOptionalNativeModule } from 'expo';

type SnowwyVoiceModule = {
  headphonesConnected(): boolean;
  /** Есть ли голос для языка; нет в сборках до 1.0.2 */
  hasVoice?(language: string): boolean;
  /** Android, только для проверки в отладочной сборке: говорить и без наушников */
  speakAnywhere?(text: string, language: string): Promise<boolean>;
  speak(text: string, language: string): Promise<boolean>;
  stop(): Promise<void>;
};

/** Модуля нет в Expo Go и в сборках, сделанных до его появления. */
export default requireOptionalNativeModule<SnowwyVoiceModule>('SnowwyVoice');
