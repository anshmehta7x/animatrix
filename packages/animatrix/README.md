# @anshmehta7x/animatrix

Drive the ASUS ROG AniMe Matrix lid display from Node.js (≥ 22) on Linux.

```ts
import { Matrix } from "@anshmehta7x/animatrix";

const m = await Matrix.open(); // via animatrixd if running, else direct
await m.setBrightness("medium");
await m.showImage("cat.png", { fit: "contain" });
await m.draw((c) => {
  c.clear();
  c.text(30, 4, "hi");
});
await m.close();
```

- Image, GIF, video and text helpers, plus `play(effectId, params)` for any built-in effect and `run(effect)` for your own.
- Typed errors: `PermissionDeniedError` (with a udev hint), `DeviceBusyError` (asusd or animatrixd), `UnsupportedModelError` and others.
- `@anshmehta7x/animatrix/client` is a native-free D-Bus client for the daemon.

See the [main README](https://github.com/anshmehta7x/animatrix#readme), the [examples](https://github.com/anshmehta7x/animatrix/tree/main/examples) and the [D-Bus API](https://github.com/anshmehta7x/animatrix/blob/main/docs/dbus-api.md).

The package is private until it is published. Publishing requires `@anshmehta7x/animatrix-core` and `@anshmehta7x/animatrix-effects` to be published too.
