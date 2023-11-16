import { DependencyContainer, inject, injectable } from "tsyringe";

import { BundleLoader } from "@spt-aki/loaders/BundleLoader";
import { ModTypeCheck } from "@spt-aki/loaders/ModTypeCheck";
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { IPostAkiLoadMod } from "@spt-aki/models/external/IPostAkiLoadMod";
import { IPostAkiLoadModAsync } from "@spt-aki/models/external/IPostAkiLoadModAsync";
import { IModLoader } from "@spt-aki/models/spt/mod/IModLoader";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { VFS } from "@spt-aki/utils/VFS";

@injectable()
export class PostAkiModLoader implements IModLoader
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("BundleLoader") protected bundleLoader: BundleLoader,
        @inject("VFS") protected vfs: VFS,
        @inject("PreAkiModLoader") protected preAkiModLoader: PreAkiModLoader,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ModTypeCheck") protected modTypeCheck: ModTypeCheck,
    )
    {}

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
            const filepath = `${this.preAkiModLoader.getModPath(modName)}${
                this.preAkiModLoader.getImportedModDetails()[modName].main
            }`;
            const modpath = `${process.cwd()}/${filepath}`;
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mod = require(modpath);

            if (this.modTypeCheck.isPostAkiLoadAsync(mod.mod))
            {
                try
                {
                    await (mod.mod as IPostAkiLoadModAsync).postAkiLoadAsync(container);
                }
                catch (err)
                {
                    this.logger.error(
                        this.localisationService.getText(
                            "modloader-async_mod_error",
                            `${err?.message ?? ""}\n${err.stack ?? ""}`,
                        ),
                    );
                }
            }

            if (this.modTypeCheck.isPostAkiLoad(mod.mod))
            {
                (mod.mod as IPostAkiLoadMod).postAkiLoad(container);
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
