import { requireOptionalNativeModule } from 'expo';

type SnowwyVoiceModule = {
  headphonesConnected(): boolean;
  speak(text: string, language: string): Promise<boolean>;
  stop(): Promise<void>;
};

/** Модуля нет в Expo Go и в сборках, сделанных до его появления. */
export default requireOptionalNativeModule<SnowwyVoiceModule>('SnowwyVoice');
