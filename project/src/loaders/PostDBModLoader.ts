import { DependencyContainer, inject, injectable } from "tsyringe";

import { OnLoad } from "@spt-aki/di/OnLoad";
import { ModTypeCheck } from "@spt-aki/loaders/ModTypeCheck";
import { PreAkiModLoader } from "@spt-aki/loaders/PreAkiModLoader";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { IPostDBLoadModAsync } from "@spt-aki/models/external/IPostDBLoadModAsync";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { LocalisationService } from "@spt-aki/services/LocalisationService";

@injectable()
export class PostDBModLoader implements OnLoad
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("PreAkiModLoader") protected preAkiModLoader: PreAkiModLoader,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ModTypeCheck") protected modTypeCheck: ModTypeCheck,
    )
    {}

    public async onLoad(): Promise<void>
    {
        if (globalThis.G_MODS_ENABLED)
        {
            await this.executeMods(this.preAkiModLoader.getContainer());
        }
    }

    public getRoute(): string
    {
        return "aki-mods";
    }

    public getModPath(mod: string): string
    {
        return this.preAkiModLoader.getModPath(mod);
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

            if (this.modTypeCheck.isPostDBAkiLoadAsync(mod.mod))
            {
                try
                {
                    await (mod.mod as IPostDBLoadModAsync).postDBLoadAsync(container);
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

            if (this.modTypeCheck.isPostDBAkiLoad(mod.mod))
            {
                (mod.mod as IPostDBLoadMod).postDBLoad(container);
            }
        }
    }
}
