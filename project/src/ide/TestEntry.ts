import "reflect-metadata";
import "source-map-support/register";

import { Program } from "@spt/Program";
// target run:profiler doesnt work with this here
// since this is the Test entry we can just remove
// it and leave those empty
// import * as buildInfo from "./build.json";

globalThis.G_DEBUG_CONFIGURATION = true;
globalThis.G_RELEASE_CONFIGURATION = false;
globalThis.G_MODS_ENABLED = true;
globalThis.G_MODS_TRANSPILE_TS = false;
globalThis.G_LOG_REQUESTS = true;
globalThis.G_WATERMARK_ENABLED = false;

globalThis.G_SPTVERSION = "";
globalThis.G_COMMIT = "";
globalThis.G_BUILDTIME = 0;

const program = new Program();
program.start();
