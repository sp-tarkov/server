import "reflect-metadata";
import "source-map-support/register";
import { Program } from "@spt/Program";

Program.initialize();
const program = new Program();
program.start();
