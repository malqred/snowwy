import AVFoundation
import ExpoModulesCore

// Голосовые итоги спуска. Говорит только через наушники и на время фразы
// приглушает музыку из других приложений.
public final class SnowwyVoiceModule: Module {
  private let synthesizer = AVSpeechSynthesizer()
  private let delegate = SnowwyVoiceDelegate()
  private var routeObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("SnowwyVoice")

    OnCreate {
      self.synthesizer.delegate = self.delegate
      // Наушники отключили посреди фразы — замолкаем, чтобы звук не ушёл в динамик
      self.routeObserver = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: nil,
        queue: nil
      ) { [weak self] _ in
        if !SnowwyVoiceModule.headphonesConnected() {
          self?.synthesizer.stopSpeaking(at: .immediate)
        }
      }
    }

    OnDestroy {
      if let observer = self.routeObserver {
        NotificationCenter.default.removeObserver(observer)
      }
    }

    // Есть ли в телефоне голос для языка
    Function("hasVoice") { (language: String) -> Bool in
      return AVSpeechSynthesisVoice(language: language) != nil
    }

    Function("headphonesConnected") { () -> Bool in
      return SnowwyVoiceModule.headphonesConnected()
    }

    // Возвращает false, если наушников нет или звук занят (например, идёт звонок)
    AsyncFunction("speak") { (text: String, language: String) -> Bool in
      guard SnowwyVoiceModule.headphonesConnected() else {
        return false
      }
      let session = AVAudioSession.sharedInstance()
      do {
        try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
        try session.setActive(true)
      } catch {
        return false
      }
      let utterance = AVSpeechUtterance(string: text)
      utterance.voice = AVSpeechSynthesisVoice(language: language)
      self.synthesizer.speak(utterance)
      return true
    }

    AsyncFunction("stop") {
      self.synthesizer.stopSpeaking(at: .immediate)
    }
  }

  static func headphonesConnected() -> Bool {
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    if outputs.isEmpty {
      return false
    }
    let headphones: [AVAudioSession.Port] = [
      .headphones,
      .bluetoothA2DP,
      .bluetoothHFP,
      .bluetoothLE,
      .usbAudio
    ]
    return outputs.allSatisfy { headphones.contains($0.portType) }
  }
}

final class SnowwyVoiceDelegate: NSObject, AVSpeechSynthesizerDelegate {
  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
    release(synthesizer)
  }

  func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
    release(synthesizer)
  }

  // Фраза закончилась — возвращаем громкость музыке
  private func release(_ synthesizer: AVSpeechSynthesizer) {
    if synthesizer.isSpeaking {
      return
    }
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }
}
