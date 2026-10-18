/** Machine-readable error codes shared by every animatrix package. */
export type AnimatrixErrorCode =
  | "DEVICE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "DEVICE_BUSY"
  | "UNSUPPORTED_MODEL"
  | "TRANSPORT_FAILED"
  | "DAEMON_UNAVAILABLE"
  | "INVALID_ARGUMENT"
  | "MEDIA_FAILED";

/** Base class for every error animatrix throws. Check `code` to branch on the failure. */
export class AnimatrixError extends Error {
  /** Stable machine-readable code. */
  readonly code: AnimatrixErrorCode;
  /** Optional human hint on how to fix the problem. */
  readonly hint: string | null;

  constructor(
    code: AnimatrixErrorCode,
    message: string,
    hint: string | null = null,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.code = code;
    this.hint = hint;
  }
}

/** No AniMe Matrix (0b05:193b, usage page 0xFF31) was found. */
export class DeviceNotFoundError extends AnimatrixError {
  constructor(message = "No AniMe Matrix device (0b05:193b) found", cause?: unknown) {
    super(
      "DEVICE_NOT_FOUND",
      message,
      "Is this an AniMe Matrix laptop? Check `lsusb -d 0b05:193b`.",
      cause,
    );
  }
}

/** The device node exists but this user cannot open it. */
export class PermissionDeniedError extends AnimatrixError {
  constructor(path: string, cause?: unknown) {
    super(
      "PERMISSION_DENIED",
      `Permission denied opening ${path}`,
      "Install the udev rule: sudo cp packaging/udev/70-animatrix.rules /etc/udev/rules.d/ && " +
        "sudo udevadm control --reload && sudo udevadm trigger",
      cause,
    );
  }
}

/** Another process (animatrixd or asusd) owns the device. */
export class DeviceBusyError extends AnimatrixError {
  /** Who holds the device, if known. */
  readonly holder: "animatrixd" | "asusd" | "unknown";

  constructor(holder: "animatrixd" | "asusd" | "unknown", cause?: unknown) {
    const hint =
      holder === "asusd"
        ? "asusd owns the AniMe device. Stop it (systemctl stop asusd) or use asusctl instead."
        : holder === "animatrixd"
          ? "animatrixd is running; use Matrix.open() without { direct: true } to go through it."
          : "Close the other program using the AniMe Matrix.";
    super("DEVICE_BUSY", `AniMe Matrix is in use by ${holder}`, hint, cause);
    this.holder = holder;
  }
}

/** The laptop model is not an AniMe Matrix model this project can drive. */
export class UnsupportedModelError extends AnimatrixError {
  constructor(model: string, reason: string) {
    super("UNSUPPORTED_MODEL", `Unsupported model "${model}": ${reason}`);
  }
}

/** A write to the device failed after it was opened. */
export class TransportError extends AnimatrixError {
  constructor(message: string, cause?: unknown) {
    super("TRANSPORT_FAILED", message, null, cause);
  }
}

/** An argument was outside its valid range or of the wrong shape. */
export class InvalidArgumentError extends AnimatrixError {
  constructor(message: string) {
    super("INVALID_ARGUMENT", message);
  }
}

/** Wrap any thrown value as an AnimatrixError (pass-through if it already is one). */
export function toAnimatrixError(
  err: unknown,
  wrap: (cause: unknown) => AnimatrixError,
): AnimatrixError {
  return err instanceof AnimatrixError ? err : wrap(err);
}
