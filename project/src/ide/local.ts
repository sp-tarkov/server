import "core-js";
import "reflect-metadata";

import { Program } from "@spt/Program";

globalThis.G_DEBUG_CONFIGURATION = true;
globalThis.G_RELEASE_CONFIGURATION = false;
globalThis.G_MODS_ENABLED = true;
globalThis.G_MODS_TRANSPILE_TS = false;
globalThis.G_LOG_REQUESTS = true;
globalThis.G_WATERMARK_ENABLED = false;

globalThis.G_SPT_VERSION = "";
globalThis.G_COMMIT = "";
globalThis.G_BUILD_TIME = 0;

const program = new Program();
program.start();
