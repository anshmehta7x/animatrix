#!/usr/bin/env node
/**
 * animatrixd: the single process that writes to the AniMe Matrix. Run as a systemd user service.
 *
 *   animatrixd [--model GA402] [--mock] [--quiet]
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import dbus from "dbus-next";
import { AnimeDevice, BUS_NAME, OBJECT_PATH, type Transport } from "@anshmehta7x/animatrix";
import { EffectRegistry, Services } from "@anshmehta7x/animatrix-effects";
import { configPath, loadConfig, saveConfig } from "./config.js";
import { Controller } from "./controller.js";
import { Flasher, flashEffect } from "./flash.js";
import { consoleLogger } from "./log.js";
import { Policy } from "./policy.js";
import { PowerMonitor } from "./power.js";
import { MatrixInterface } from "./service.js";

const nullTransport: Transport = {
  kind: "mock",
  path: "null",
  send: async () => undefined,
  close: async () => undefined,
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      model: { type: "string" },
      mock: { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
      config: { type: "string" },
    },
  });
  const log = consoleLogger(values.quiet);
  const version = (
    JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    }
  ).version;
  const cfgFile = values.config ?? configPath();
  const config = await loadConfig(cfgFile, (m) => log.warn(m));
  const save = (c: typeof config): Promise<void> => saveConfig(c, cfgFile);

  const bus = dbus.sessionBus();
  bus.on("error", (e) => log.error(e));
  const reply = await bus.requestName(BUS_NAME, dbus.NameFlag.DO_NOT_QUEUE);
  if (
    reply !== dbus.RequestNameReply.PRIMARY_OWNER &&
    reply !== dbus.RequestNameReply.ALREADY_OWNER
  ) {
    log.warn("another animatrixd already owns the bus name; exiting");
    process.exit(1);
  }

  const registry = new EffectRegistry();
  registry.register(flashEffect);
  const services = new Services();
  const model = values.model ?? (config.device.model || (values.mock ? "GA402" : undefined));
  const ctl = new Controller({
    openDevice: () => AnimeDevice.open({ model, transport: values.mock ? nullTransport : "auto" }),
    config,
    saveConfig: save,
    registry,
    services,
    log,
  });
  const flasher = new Flasher(ctl);
  const power = values.mock ? null : new PowerMonitor();
  const policy = new Policy(ctl, power, log);
  const iface = new MatrixInterface({
    ctl,
    registry,
    flasher,
    saveConfig: save,
    onConfigChanged: () => {
      policy.configChanged();
      flasher.configure(ctl.config.notifications.flash, ctl.config.notifications.showText);
    },
    log,
    version,
  });
  bus.export(OBJECT_PATH, iface);

  const powerProblem = await power?.start();
  if (powerProblem) log.warn(powerProblem);
  await ctl.start();
  policy.start();
  flasher.configure(config.notifications.flash, config.notifications.showText);
  log.info("animatrixd ready", { version, config: cfgFile, mock: values.mock });

  const quit = async (): Promise<void> => {
    log.info("shutting down");
    policy.stop();
    flasher.stop();
    power?.stop();
    services.dispose();
    await ctl.shutdown().catch(() => undefined);
    bus.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void quit());
  process.on("SIGINT", () => void quit());
}

main().catch((err: unknown) => {
  console.error("animatrixd failed to start:", err);
  process.exit(1);
});
