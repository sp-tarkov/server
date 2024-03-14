import "reflect-metadata";
import "source-map-support/register";

import { Program } from "@spt-aki/Program";

globalThis.G_DEBUG_CONFIGURATION = true;
globalThis.G_RELEASE_CONFIGURATION = false;
globalThis.G_MODS_ENABLED = true;
globalThis.G_MODS_TRANSPILE_TS = false;
globalThis.G_LOG_REQUESTS = true;
globalThis.G_WATERMARK_ENABLED = true;

const program = new Program();
program.start();
