import "reflect-metadata";
import "source-map-support/register";

import { Program } from "@spt-aki/Program";

globalThis.G_DEBUG_CONFIGURATION = false;
globalThis.G_RELEASE_CONFIGURATION = true;
globalThis.G_MODS_ENABLED = true;
globalThis.G_MODS_TRANSPILE_TS = true;
globalThis.G_LOG_REQUESTS = false;
globalThis.G_WATERMARK_ENABLED = false;

const program = new Program();
program.start();
