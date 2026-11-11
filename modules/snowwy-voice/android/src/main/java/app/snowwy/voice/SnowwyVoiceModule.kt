package app.snowwy.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

// Голосовые итоги спуска. Говорит только через наушники и на время фразы
// приглушает музыку из других приложений.
class SnowwyVoiceModule : Module() {
  private var tts: TextToSpeech? = null
  private var ready = false
  // Фраза, которую попросили сказать, пока синтезатор ещё запускался
  private var waiting: Pair<String, String>? = null
  private var focus: AudioFocusRequest? = null
  private var utterance = 0

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Нет контекста приложения")

  private val audio: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private val attributes: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()

  // Наушники отключили посреди фразы — замолкаем, чтобы звук не ушёл в динамик
  private val devices = object : AudioDeviceCallback() {
    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
      if (!headphonesConnected()) {
        tts?.stop()
        release()
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SnowwyVoice")

    OnCreate {
      audio.registerAudioDeviceCallback(devices, Handler(Looper.getMainLooper()))
      start()
    }

    OnDestroy {
      audio.unregisterAudioDeviceCallback(devices)
      tts?.shutdown()
      tts = null
      ready = false
      release()
    }

    Function("headphonesConnected") {
      headphonesConnected()
    }

    // Возвращает false, если наушников нет, звук занят (например, идёт звонок)
    // или в телефоне нет голоса для этого языка
    AsyncFunction("speak") { text: String, language: String ->
      if (!headphonesConnected()) return@AsyncFunction false
      if (tts == null) start()
      if (!ready) {
        waiting = text to language
        return@AsyncFunction true
      }
      say(text, language)
    }

    AsyncFunction("stop") {
      waiting = null
      tts?.stop()
      release()
    }
  }

  private fun start() {
    ready = false
    tts = TextToSpeech(context.applicationContext) { status ->
      if (status != TextToSpeech.SUCCESS) {
        tts = null
        waiting = null
        return@TextToSpeech
      }
      ready = true
      tts?.setAudioAttributes(attributes)
      tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(id: String?) {}

        override fun onDone(id: String?) = finished(id)

        @Deprecated("Deprecated in Java")
        override fun onError(id: String?) = finished(id)

        override fun onStop(id: String?, interrupted: Boolean) = finished(id)
      })
      waiting?.let { (text, language) -> say(text, language) }
      waiting = null
    }
  }

  private fun say(text: String, language: String): Boolean {
    val engine = tts ?: return false
    val result = engine.setLanguage(Locale.forLanguageTag(language))
    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) return false
    if (!duck()) return false
    utterance++
    return engine.speak(text, TextToSpeech.QUEUE_ADD, Bundle(), "snowwy-$utterance") == TextToSpeech.SUCCESS
  }

  // Последняя фраза закончилась — возвращаем громкость музыке
  private fun finished(id: String?) {
    if (id == "snowwy-$utterance") release()
  }

  private fun duck(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    if (focus != null) return true
    val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      .setAudioAttributes(attributes)
      .build()
    if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return false
    focus = request
    return true
  }

  private fun release() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    focus?.let { audio.abandonAudioFocusRequest(it) }
    focus = null
  }

  private fun headphonesConnected(): Boolean {
    val types = mutableSetOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) types.add(AudioDeviceInfo.TYPE_USB_HEADSET)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) types.add(AudioDeviceInfo.TYPE_HEARING_AID)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) types.add(AudioDeviceInfo.TYPE_BLE_HEADSET)
    return audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in types }
  }
}
