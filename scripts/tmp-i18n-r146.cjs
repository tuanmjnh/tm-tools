// R146: one-shot i18n patch for /system/profile/push, /system/docs,
// /system/settings, /administration/roles. Deletes itself after use.
// Adds `docs`, `notifications` top-level namespaces, plus settings theme
// keys and admin.permissions.title / admin.modules fallback.
'use strict'

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const load = (l) => JSON.parse(fs.readFileSync(path.join(root, 'i18n/locales', l + '.json'), 'utf8'))
const save = (l, obj) => fs.writeFileSync(path.join(root, 'i18n/locales', l + '.json'), JSON.stringify(obj, null, 2) + '\n', 'utf8')

const docs = {
  en: {
    description: 'API reference and architecture of the TM Hub control plane.',
    searchPlaceholder: 'Search endpoints, modules, descriptions…',
    allModules: 'All modules',
    endpointsCount: '{filtered} of {total} endpoints',
    architecture: {
      iamTitle: 'Identity & Access',
      iamDesc: 'Central IAM: JWT sessions, 2FA, passkeys, roles and per-app route permissions.',
      remoteConfigsTitle: 'Remote Configs',
      remoteConfigsDesc: 'Centralized app settings, typed and encrypted, synced to every satellite.',
      mediaGatewayTitle: 'Media Gateway',
      mediaGatewayDesc: 'Signed uploads, folder tree and resource management over Cloudinary.',
      notificationsTitle: 'Notifications',
      notificationsDesc: 'Push (FCM + VAPID), in-app inbox and webhooks with audit trail.'
    },
    sdk: {
      title: 'Client SDK',
      description: 'Use the tm-hub-client SDK from {app} — it attaches your app identity and tokens automatically.'
    },
    api: {
      title: 'REST API',
      prefix: '/api/v1',
      module: 'Module',
      method: 'Method',
      endpoint: 'Endpoint',
      description: 'Description',
      login: 'Authenticate and start a session',
      refresh: 'Rotate the access token',
      me: 'Current user profile and roles',
      routes: 'Route tree for the current app',
      getConfigs: 'Read app config values',
      updateConfigs: 'Update app config values',
      getPublicConfigs: 'Read public (non-secret) configs',
      getMediaFolders: 'List media folders',
      getMediaResources: 'List media resources',
      getMediaSignature: 'Request an upload signature',
      deleteMediaResource: 'Delete a media resource',
      subscribeNotification: 'Register a push subscription',
      getNotifications: 'List user notifications',
      sendNotification: 'Send an in-app notification'
    }
  },
  vi: {
    description: 'Tham chiếu API và kiến trúc của TM Hub control plane.',
    searchPlaceholder: 'Tìm endpoint, module, mô tả…',
    allModules: 'Tất cả module',
    endpointsCount: '{filtered} / {total} endpoint',
    architecture: {
      iamTitle: 'Định danh & Truy cập',
      iamDesc: 'IAM tập trung: phiên JWT, 2FA, passkey, vai trò và quyền route theo app.',
      remoteConfigsTitle: 'Cấu hình tập trung',
      remoteConfigsDesc: 'Cấu hình app kiểu hóa, mã hóa bí mật, đồng bộ xuống mọi vệ tinh.',
      mediaGatewayTitle: 'Cổng Media',
      mediaGatewayDesc: 'Upload có chữ ký, cây thư mục và quản lý tài nguyên qua Cloudinary.',
      notificationsTitle: 'Thông báo',
      notificationsDesc: 'Push (FCM + VAPID), inbox trong ứng dụng và webhook kèm nhật ký kiểm toán.'
    },
    sdk: {
      title: 'SDK client',
      description: 'Dùng SDK tm-hub-client trong {app} — nó tự gắn định danh app và token.'
    },
    api: {
      title: 'REST API',
      prefix: '/api/v1',
      module: 'Module',
      method: 'Phương thức',
      endpoint: 'Endpoint',
      description: 'Mô tả',
      login: 'Xác thực và khởi tạo phiên',
      refresh: 'Đổi token truy cập mới',
      me: 'Hồ sơ và vai trò của người dùng hiện tại',
      routes: 'Cây route của app hiện tại',
      getConfigs: 'Đọc giá trị cấu hình app',
      updateConfigs: 'Cập nhật giá trị cấu hình app',
      getPublicConfigs: 'Đọc cấu hình công khai (không bí mật)',
      getMediaFolders: 'Liệt kê thư mục media',
      getMediaResources: 'Liệt kê tài nguyên media',
      getMediaSignature: 'Yêu cầu chữ ký tải lên',
      deleteMediaResource: 'Xóa tài nguyên media',
      subscribeNotification: 'Đăng ký push subscription',
      getNotifications: 'Liệt kê thông báo của người dùng',
      sendNotification: 'Gửi thông báo trong ứng dụng'
    }
  }
}

const notifications = {
  en: {
    pushTitle: 'Push Notifications',
    pushDesc: 'Receive app alerts on this device via Firebase Cloud Messaging or VAPID web push.',
    pushUnsupported: 'This browser does not support web push notifications.',
    enablePushTitle: 'Enable push notifications?',
    enablePushDesc: 'You will receive alerts about new devices, security events and account activity.',
    enablePush: 'Enable',
    disablePushTitle: 'Disable push notifications?',
    disablePushDesc: 'You will stop receiving alerts on this device. Your in-app inbox is unaffected.',
    disablePush: 'Disable'
  },
  vi: {
    pushTitle: 'Thông báo Push',
    pushDesc: 'Nhận cảnh báo ứng dụng trên thiết bị này qua Firebase Cloud Messaging hoặc VAPID web push.',
    pushUnsupported: 'Trình duyệt này không hỗ trợ web push notification.',
    enablePushTitle: 'Bật thông báo push?',
    enablePushDesc: 'Bạn sẽ nhận cảnh báo về thiết bị mới, sự kiện bảo mật và hoạt động tài khoản.',
    enablePush: 'Bật',
    disablePushTitle: 'Tắt thông báo push?',
    disablePushDesc: 'Bạn sẽ ngừng nhận cảnh báo trên thiết bị này. Inbox trong ứng dụng không bị ảnh hưởng.',
    disablePush: 'Tắt'
  }
}

const settingsAdd = {
  en: {
    appearance: 'Appearance',
    theme: 'Theme',
    systemTheme: 'System',
    light: 'Light',
    dark: 'Dark',
    colors: 'Accent Colors',
    primaryColor: 'Primary color',
    neutralColor: 'Neutral color'
  },
  vi: {
    appearance: 'Hiển thị',
    theme: 'Giao diện',
    systemTheme: 'Theo hệ thống',
    light: 'Sáng',
    dark: 'Tối',
    colors: 'Màu nhấn',
    primaryColor: 'Màu chính',
    neutralColor: 'Màu trung tính'
  }
}

let count = 0
for (const lang of ['en', 'vi']) {
  const obj = load(lang)
  obj.docs = docs[lang]
  obj.notifications = notifications[lang]
  obj.settings = { ...settingsAdd[lang], ...obj.settings }
  if (obj.admin && typeof obj.admin === 'object') {
    // R146: roles page + CreateModal + EditModal call t('admin.permissions.title')
    // but the key is a bare string today -> they render the raw key. Convert
    // to an object; no other code references the bare `admin.permissions`.
    const permsTitle = typeof obj.admin.permissions === 'string' ? obj.admin.permissions
      : (lang === 'en' ? 'Permissions' : 'Phân quyền')
    obj.admin.permissions = { title: permsTitle }
    if (!obj.admin.modules) obj.admin.modules = {}
  }
  save(lang, obj)
  count++
}
console.log('i18n patched:', count, 'locales')
