import { Program } from "@spt/Program";
import { ModTypeCheck } from "@spt/loaders/ModTypeCheck";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import { IPostSptLoadMod } from "@spt/models/external/IPostSptLoadMod";
import { IPostSptLoadModAsync } from "@spt/models/external/IPostSptLoadModAsync";
import { IModLoader } from "@spt/models/spt/mod/IModLoader";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { LocalisationService } from "@spt/services/LocalisationService";
import { DependencyContainer, inject, injectable } from "tsyringe";

@injectable()
export class PostSptModLoader implements IModLoader {
    protected container: DependencyContainer;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("PreSptModLoader") protected preSptModLoader: PreSptModLoader,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ModTypeCheck") protected modTypeCheck: ModTypeCheck,
    ) {}

    public getModPath(mod: string): string {
        return this.preSptModLoader.getModPath(mod);
    }

    public async load(): Promise<void> {
        if (Program.MODS) {
            this.container = this.preSptModLoader.getContainer();
            await this.executeModsAsync();
        }
    }

    protected async executeModsAsync(): Promise<void> {
        const mods = this.preSptModLoader.sortModsLoadOrder();
        for (const modName of mods) {
            // // import class
            const filepath = `${this.preSptModLoader.getModPath(modName)}${
                this.preSptModLoader.getImportedModDetails()[modName].main
            }`;
            const modpath = `${process.cwd()}/${filepath}`;
            const mod = require(modpath);

            if (this.modTypeCheck.isPostSptLoadAsync(mod.mod)) {
                try {
                    await (mod.mod as IPostSptLoadModAsync).postSptLoadAsync(this.container);
                } catch (err) {
                    this.logger.error(
                        this.localisationService.getText(
                            "modloader-async_mod_error",
                            `${err?.message ?? ""}\n${err.stack ?? ""}`,
                        ),
                    );
                }
            }

            if (this.modTypeCheck.isPostSptLoad(mod.mod)) {
                (mod.mod as IPostSptLoadMod).postSptLoad(this.container);
            }
        }
    }
}
