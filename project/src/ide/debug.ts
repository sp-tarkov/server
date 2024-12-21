import "core-js";
import "reflect-metadata";

import { Program } from "@spt/Program";
import build from "@spt/ide/build.json" with { type: "json" };

globalThis.G_DEBUG_CONFIGURATION = true;
globalThis.G_RELEASE_CONFIGURATION = true;
globalThis.G_MODS_ENABLED = true;
globalThis.G_MODS_TRANSPILE_TS = true;
globalThis.G_LOG_REQUESTS = true;
globalThis.G_WATERMARK_ENABLED = false;

globalThis.G_SPT_VERSION = build.sptVersion;
globalThis.G_COMMIT = build.commit;
globalThis.G_BUILD_TIME = build.buildTime;

const program = new Program();
program.start();
