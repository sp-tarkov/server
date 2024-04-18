import "reflect-metadata";
import "source-map-support/register";

import { Program } from "@spt-aki/Program";
import * as buildInfo from "./build.json";

globalThis.G_DEBUG_CONFIGURATION = true;
globalThis.G_RELEASE_CONFIGURATION = false;
globalThis.G_MODS_ENABLED = true;
globalThis.G_MODS_TRANSPILE_TS = false;
globalThis.G_LOG_REQUESTS = true;
globalThis.G_WATERMARK_ENABLED = false;

globalThis.G_AKIVERSION = buildInfo.akiVersion;
globalThis.G_COMMIT = buildInfo.commit;
globalThis.G_BUILDTIME = buildInfo.buildTime;

const program = new Program();
program.start();
