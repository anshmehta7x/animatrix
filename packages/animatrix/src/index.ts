/**
 * `@anshmehta7x/animatrix`: drive the ASUS ROG AniMe Matrix from Node.js.
 *
 * @packageDocumentation
 */
export { Matrix } from "./matrix.js";
export type {
  BrightnessName,
  OpenOptions,
  MediaOptions,
  AnimationOptions,
  DrawOptions,
} from "./matrix.js";
export { AnimeDevice, resolveProfile, type DeviceOptions } from "./device.js";
export { MockTransport, type Transport, type TransportKind } from "./transport.js";
export {
  openHidraw,
  findHidrawPath,
  VENDOR_ID,
  PRODUCT_ID,
  USAGE_PAGE,
  USAGE,
} from "./transports/hidraw.js";
export { openLibusb } from "./transports/libusb.js";
export { DaemonClient, isDaemonRunning, fromDbusError } from "./daemon-client.js";
export * from "./dbus-api.js";
export { readDmiModel, isAsusdRunning, isProcessRunning } from "./system.js";
export {
  AnimatrixError,
  DeviceBusyError,
  DeviceNotFoundError,
  InvalidArgumentError,
  PermissionDeniedError,
  TransportError,
  UnsupportedModelError,
  Canvas,
  type AnimatrixErrorCode,
  type BuiltinSelection,
  type HardwareBrightness,
  type MappingMode,
  type ModelProfile,
} from "@anshmehta7x/animatrix-core";
export type { Effect, EffectInstance, ParamSchema } from "@anshmehta7x/animatrix-effects";
