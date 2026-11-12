package app.snowwy.power

import android.app.Notification
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import java.io.File
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Android закрывает приложения в фоне ради батареи. Этот модуль узнаёт, снято ли
// ограничение со Snowwy, и открывает нужные экраны настроек.
class SnowwyPowerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Нет контекста приложения")

  override fun definition() = ModuleDefinition {
    Name("SnowwyPower")

    // true — система не ограничивает работу приложения в фоне
    Function("unrestricted") {
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.isIgnoringBatteryOptimizations(context.packageName)
    }

    // Системный вопрос «Разрешить работу в фоне?». false — показать не удалось
    Function("ask") {
      open(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
      ) || open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    // Экран автозапуска или защиты от закрытия в оболочке производителя.
    // false — такого экрана в этом телефоне нет
    Function("openVendorSettings") {
      VENDOR_SCREENS.any { (pkg, cls) -> open(Intent().setComponent(ComponentName(pkg, cls))) }
    }

    // Ставит уведомление с ходом катания (tag) на место уведомления службы геопозиции,
    // чтобы в шторке было одно уведомление Snowwy, а не два. false — службы нет
    Function("mergeRideNotification") { tag: String ->
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val active = manager.activeNotifications
      val ride = active.firstOrNull { it.tag == tag } ?: return@Function false
      val service = active.firstOrNull {
        it.tag == null && it.notification.flags and Notification.FLAG_FOREGROUND_SERVICE != 0
      } ?: return@Function false
      val merged = ride.notification
      merged.flags = merged.flags or Notification.FLAG_ONGOING_EVENT or Notification.FLAG_NO_CLEAR
      manager.notify(service.id, merged)
      manager.cancel(ride.tag, ride.id)
      true
    }

    // Разрешено ли устанавливать приложения (Android 8+ спрашивает это у человека)
    Function("canInstallPackages") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()
    }

    Function("openInstallPermission") {
      open(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
    }

    // Системное окно установки для .apk из кэша приложения. Файл отдаётся через
    // FileProvider модуля expo-file-system: он открывает доступ к папке кэша.
    Function("installApk") { fileUri: String ->
      val file = File(Uri.parse(fileUri).path ?: return@Function false)
      val cache = context.cacheDir.canonicalFile
      val target = file.canonicalFile
      if (!target.exists() || !target.path.startsWith(cache.path + File.separator)) return@Function false
      val relative = target.path.substring(cache.path.length + 1).replace(File.separatorChar, '/')
      val uri = Uri.Builder()
        .scheme("content")
        .authority("${context.packageName}.FileSystemFileProvider")
        .encodedPath("/cached_expo_files/" + Uri.encode(relative, "/"))
        .build()
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      open(intent)
    }

    // Страница приложения в настройках системы
    Function("openAppSettings") {
      open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
    }
  }

  private fun open(intent: Intent): Boolean {
    return try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val activity = appContext.currentActivity
      if (activity != null) activity.startActivity(intent) else context.startActivity(intent)
      true
    } catch (e: Exception) {
      false
    }
  }

  companion object {
    // Известные экраны «Автозапуск» и «Защищённые приложения» у разных производителей
    private val VENDOR_SCREENS = listOf(
      "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
      "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
      "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
      "com.hihonor.systemmanager" to "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
      "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
      "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
      "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
      "com.oplus.safecenter" to "com.oplus.safecenter.startupapp.StartupAppListActivity",
      "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
      "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
      "com.samsung.android.lool" to "com.samsung.android.sm.battery.ui.BatteryActivity",
      "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity",
      "com.oneplus.security" to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
      "com.letv.android.letvsafe" to "com.letv.android.letvsafe.AutobootManageActivity",
      "com.asus.mobilemanager" to "com.asus.mobilemanager.powersaver.PowerSaverSettings",
      "com.transsion.phonemanager" to "com.itel.autobootmanager.activity.AutoBootMgrActivity"
    )
  }
}
