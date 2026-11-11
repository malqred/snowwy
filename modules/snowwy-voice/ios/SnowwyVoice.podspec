Pod::Spec.new do |s|
  s.name           = 'SnowwyVoice'
  s.version        = '1.0.0'
  s.summary        = 'Голосовые итоги спуска в наушниках'
  s.description    = 'Произносит короткие фразы только через наушники, приглушая другую музыку.'
  s.license        = 'MIT'
  s.author         = 'Snowwy'
  s.homepage       = 'https://github.com/malqred/snowwy'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/malqred/snowwy.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
end
