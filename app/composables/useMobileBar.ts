// Page chrome (actions + record info) is registered by `Page` inside
// @tuanmjnh/tm-ui, so the app's surfaces must read the same store. Re-exporting
// the package's composable keeps one module-level store instead of two that
// silently never see each other's registrations.
export {
  useMobileBar,
  headerActionsToMobile,
  mobileActionLayout,
  type MobileAction,
  type MobileActionChild,
  type MobileActionLayout,
  type MobileInfo
} from '@tuanmjnh/tm-ui'
