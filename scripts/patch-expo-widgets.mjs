// Правит expo-widgets после установки зависимостей (запускается из postinstall).
//
// Зачем: expo-widgets передаёт вёрстку окна на экране блокировки (Live Activity) из приложения
// в расширение через общую группу данных (App Group). При установке с бесплатным Apple ID
// группы данных нет, расширение не получает вёрстку и рисует пустое чёрное окно.
// Правка вшивает вёрстку в само расширение на этапе сборки — группа данных больше не нужна.
//
// Какие файлы с Live Activity вшивать, задаётся в package.json: "expoWidgetsLiveActivities".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(root, 'node_modules', 'expo-widgets');
const MARK = 'snowwy-patch';
const TESTED_VERSION = '58.0.27';

if (!fs.existsSync(pkgDir)) {
  console.log('[patch-expo-widgets] expo-widgets не установлен, пропускаю');
  process.exit(0);
}

const version = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version;
if (version !== TESTED_VERSION) {
  console.warn(`[patch-expo-widgets] правка проверялась на ${TESTED_VERSION}, установлена ${version}`);
}

/** Заменяет в файле каждый фрагмент; падает, если фрагмент не найден. */
function patch(file, replacements) {
  const full = path.join(pkgDir, file);
  let text = fs.readFileSync(full, 'utf8');
  if (text.includes(MARK)) return;
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      throw new Error(`[patch-expo-widgets] в ${file} не найден фрагмент:\n${from}`);
    }
    text = text.replace(from, to);
  }
  fs.writeFileSync(full, text);
  console.log(`[patch-expo-widgets] исправлен ${file}`);
}

// 1. При сборке реестра вёрсток запоминаем и вёрстки Live Activity
patch('bundle/layout-registry-stub.ts', [
  [
    `export function createLiveActivity() {
  return noopLiveActivityFactory;
}`,
    `// ${MARK}
const liveActivities: Record<string, { layout: string }> = {};

export function createLiveActivity(name?: string, layout?: unknown) {
  if (typeof name === 'string' && typeof layout === 'string') {
    liveActivities[name] = { layout };
  }
  return noopLiveActivityFactory;
}`,
  ],
  [
    `    widgets: { ...widgets },
  };`,
    `    widgets: { ...widgets },
    liveActivities: { ...liveActivities },
  };`,
  ],
]);

// 2. Скрипт сборки реестра: добавляем файлы Live Activity из package.json
patch('scripts/build-layout-registry.mjs', [
  [
    `  const expectedWidgets = await readExpectedWidgets(projectRoot, resolvedConfigPath);
  if (expectedWidgets.length === 0) {`,
    `  const expectedWidgets = await readExpectedWidgets(projectRoot, resolvedConfigPath);
  // ${MARK}
  const liveActivityFiles = readLiveActivityFiles(projectRoot);
  if (expectedWidgets.length === 0 && liveActivityFiles.length === 0) {`,
  ],
  [
    `  await fs.promises.writeFile(importsPath, createImportsSource(expectedWidgets));`,
    `  await fs.promises.writeFile(
    importsPath,
    createImportsSource(expectedWidgets) +
      liveActivityFiles.map((file) => \`import \${JSON.stringify(file)};\\n\`).join('')
  );`,
  ],
  [
    `  const registry = createLayoutRegistry(expectedWidgets, capturedLayouts);`,
    `  const registry = createLayoutRegistry(expectedWidgets, capturedLayouts);
  registry.liveActivities = capturedLayouts?.liveActivities ?? {};
  if (liveActivityFiles.length > 0 && Object.keys(registry.liveActivities).length === 0) {
    throw new Error('Live Activity layouts were listed in package.json but none was registered.');
  }`,
  ],
  [
    `async function readExpectedWidgets(`,
    `function readLiveActivityFiles(projectRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  return (pkg.expoWidgetsLiveActivities ?? []).map((file) => path.resolve(projectRoot, file));
}

async function readExpectedWidgets(`,
  ],
]);

// 3. Расширение: читаем вшитую вёрстку, если общей группы данных нет
patch('ios/Widgets/WidgetsLayoutRegistry.swift', [
  [
    `  private static let embeddedWidgets: [String: EmbeddedWidget] = {`,
    `  // ${MARK}
  public static func liveActivityLayout(for name: String) -> String? {
    if let layout = WidgetsStorage.getString(forKey: "__expo_widgets_live_activity_\\(name)_layout"),
       !layout.isEmpty {
      return layout
    }
    return embeddedLiveActivities[name]
  }

  private static let embeddedLiveActivities: [String: String] = {
    guard let bundleURL = Bundle.main.url(forResource: "ExpoWidgets", withExtension: "bundle"),
          let bundle = Bundle(url: bundleURL),
          let registryURL = bundle.url(
            forResource: "ExpoWidgetsLayoutRegistry",
            withExtension: "json"
          ),
          let data = try? Data(contentsOf: registryURL),
          let registry = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let activities = registry["liveActivities"] as? [String: [String: Any]] else {
      return [:]
    }
    return activities.compactMapValues { $0["layout"] as? String }
  }()

  private static let embeddedWidgets: [String: EmbeddedWidget] = {`,
  ],
]);

patch('ios/Widgets/Utils.swift', [
  [
    `  let layout = WidgetsStorage.getString(forKey: "__expo_widgets_live_activity_\\(name)_layout") ?? ""`,
    `  // ${MARK}
  let layout = WidgetsLayoutRegistry.liveActivityLayout(for: name) ?? ""`,
  ],
]);
