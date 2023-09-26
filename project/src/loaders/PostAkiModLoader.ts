import { DependencyContainer, inject, injectable } from "tsyringe";
import { IPostAkiLoadMod } from "../models/external/IPostAkiLoadMod";
import { IPostAkiLoadModAsync } from "../models/external/IPostAkiLoadModAsync";
import { IModLoader } from "../models/spt/mod/IModLoader";
import { ILogger } from "../models/spt/utils/ILogger";
import { LocalisationService } from "../services/LocalisationService";
import { VFS } from "../utils/VFS";
import { BundleLoader } from "./BundleLoader";
import { ModTypeCheck } from "./ModTypeCheck";
import { PreAkiModLoader } from "./PreAkiModLoader";

@injectable()
export class PostAkiModLoader implements IModLoader
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("BundleLoader") protected bundleLoader: BundleLoader,
        @inject("VFS") protected vfs: VFS,
        @inject("PreAkiModLoader") protected preAkiModLoader: PreAkiModLoader,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ModTypeCheck") protected modTypeCheck: ModTypeCheck
    )
    { }

    public getModPath(mod: string): string
    {
        return this.preAkiModLoader.getModPath(mod);
    }

    public async load(): Promise<void>
    {
        if (globalThis.G_MODS_ENABLED)
        {
            await this.executeMods(this.preAkiModLoader.getContainer());
            this.addBundles();
        }
    }

    protected async executeMods(container: DependencyContainer): Promise<void>
    {
        const mods = this.preAkiModLoader.sortModsLoadOrder();
        for (const modName of mods)
        {
            // // import class
            const filepath = `${this.preAkiModLoader.getModPath(modName)}${this.preAkiModLoader.getImportedModDetails()[modName].main}`;
            const modpath = `${process.cwd()}/${filepath}`;
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mod = require(modpath);
            if (this.modTypeCheck.isPostAkiLoad(mod.mod))
            {
                (mod.mod as IPostAkiLoadMod).postAkiLoad(container);
            }
            if (this.modTypeCheck.isPostAkiLoadAsync(mod.mod))
            {
                try 
                {
                    await (mod.mod as IPostAkiLoadModAsync).postAkiLoadAsync(container);
                }
                catch (err) 
                {
                    this.logger.error(this.localisationService.getText("modloader-async_mod_error", `${err?.message ?? ""}\n${err.stack ?? ""}`));
                }
            }
        }
    }

    protected addBundles(): void
    {
        const mods = this.preAkiModLoader.sortModsLoadOrder();
        for (const modName of mods)
        {
            // add mod bundles
            const modpath = this.preAkiModLoader.getModPath(modName);
            if (this.vfs.exists(`${modpath}bundles.json`))
            {
                this.bundleLoader.addBundles(modpath);
            }
        }
    }
}