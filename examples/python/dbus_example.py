#!/usr/bin/env python3
"""Drive animatrixd from Python over D-Bus (pure-Python `jeepney`, `pip install jeepney`).

The same calls work from any language, or from the shell:
    busctl --user call dev.animatrix.Matrix1 /dev/animatrix/Matrix1 \
        dev.animatrix.Matrix1 Play ss text '{"text": "hello from busctl"}'
"""
import json
import sys

from jeepney import DBusAddress, new_method_call
from jeepney.io.blocking import open_dbus_connection

MATRIX = DBusAddress(
    "/dev/animatrix/Matrix1",
    bus_name="dev.animatrix.Matrix1",
    interface="dev.animatrix.Matrix1",
)


def call(conn, method, signature=None, *args):
    reply = conn.send_and_get_reply(new_method_call(MATRIX, method, signature, args))
    if reply.header.message_type.name == "error":
        raise RuntimeError(f"{method} failed: {reply.body}")
    return reply.body


def main():
    with open_dbus_connection(bus="SESSION") as conn:
        info = json.loads(call(conn, "GetInfo")[0])
        print(f"{info['modelName']} ({info['model']}), {info['leds']} LEDs")

        call(conn, "SetBrightness", "y", 2)
        text = " ".join(sys.argv[1:]) or "hello from python"
        call(conn, "Play", "ss", "text", json.dumps({"text": text, "speed": 20}))

        state = json.loads(call(conn, "GetState")[0])
        print(f"now showing: {state['effect']}")


if __name__ == "__main__":
    main()
