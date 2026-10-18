# D-Bus API (`dev.animatrix.Matrix1`)

animatrixd owns `dev.animatrix.Matrix1` on the **session bus** and exports object `/dev/animatrix/Matrix1` with the interface `dev.animatrix.Matrix1`. This API is stable: methods may be added, but existing ones won't change meaning. Complex values travel as JSON strings, so any language (or `busctl`) can use it.

Errors are D-Bus errors named `dev.animatrix.Error.<CODE>`, where `CODE` is one of `DEVICE_NOT_FOUND`, `PERMISSION_DENIED`, `DEVICE_BUSY`, `UNSUPPORTED_MODEL`, `TRANSPORT_FAILED`, `DAEMON_UNAVAILABLE`, `INVALID_ARGUMENT` or `MEDIA_FAILED`. The message may end with a hint in parentheses.

## Methods

| Method                                     | In                          | Out      | Notes                                                                                                                                               |
| ------------------------------------------ | --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetInfo`                                  |                             | `s` JSON | `{version, model, modelName, tested, leds, slots, transport, maxFps, canvas: {planar, diagonal}}`. Fails with `DEVICE_NOT_FOUND` while disconnected |
| `GetState`                                 |                             | `s` JSON | `{connected, displayOn, gate, hardwareBrightness, softBrightness, content, effect, params, scene, builtins, fps, error}`                            |
| `SetBrightness`                            | `y` 0–3                     |          | Hardware level (`C0 04`), persisted                                                                                                                 |
| `SetSoftBrightness`                        | `d` 0–1                     |          | Software brightness on top, persisted                                                                                                               |
| `SetDisplay`                               | `b`                         |          | User on/off (the `user` gate)                                                                                                                       |
| `SetBuiltins`                              | `s` JSON, `b` enable        |          | Partial `{awake, sleep, shutdown, boot}`; `enable` hands the panel to the firmware                                                                  |
| `ShowFrame`                                | `ay`                        |          | Raw LED buffer (`slots` bytes). Stops the running effect. Stream it at up to the fps cap                                                            |
| `ShowTestPattern`                          |                             |          | Orientation test pattern                                                                                                                            |
| `Play`                                     | `s` effect, `s` params JSON |          | Validated against the effect's schema                                                                                                               |
| `Stop`                                     |                             |          | Stops the effect; the last frame stays                                                                                                              |
| `ListEffects`                              |                             | `s` JSON | `[{id, name, description, category, fps, params}]`; `params` is the schema                                                                          |
| `ListScenes`                               |                             | `s` JSON | `{name: {effect, params}}`                                                                                                                          |
| `ApplyScene` / `SaveScene` / `DeleteScene` | `s` name                    |          | Save stores the running effect                                                                                                                      |
| `GetConfig`                                |                             | `s` JSON | The full config (see `packages/daemon/src/config.ts`)                                                                                               |
| `UpdateConfig`                             | `s` JSON patch              |          | Deep merge; `scenes` is replaced whole                                                                                                              |
| `Flash`                                    | `s` text                    |          | Short notification pulse, then the previous content comes back                                                                                      |
| `WatchPreview`                             | `b`                         |          | Starts or stops a 10 s preview lease; renew it to keep receiving `Preview`                                                                          |
| `GetFrame`                                 |                             | `ay`     | Last frame actually sent (after brightness)                                                                                                         |

## Signals

| Signal         | Args                                | When                                                                     |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `StateChanged` | `s` JSON (same shape as `GetState`) | Content, gate, brightness or connection changes (not per streamed frame) |
| `Preview`      | `ay`                                | Each sent frame, at most 15 per second, while a preview lease is active  |

## Examples

```sh
B="busctl --user call dev.animatrix.Matrix1 /dev/animatrix/Matrix1 dev.animatrix.Matrix1"
$B GetState
$B SetBrightness y 1
$B Play ss clock '{"face":"analogue"}'
$B Play ss image '{"file":"/home/me/cat.png","fit":"cover"}'
$B ApplyScene s "Matrix rain"
$B SetBuiltins sb '{"sleep":"starfield"}' true
busctl --user monitor dev.animatrix.Matrix1      # watch signals
```

Python: [`examples/python/dbus_example.py`](../examples/python/dbus_example.py), using `jeepney`.
