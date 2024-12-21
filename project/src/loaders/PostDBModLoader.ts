import type { OnLoad } from "@spt/di/OnLoad";
import { BundleLoader } from "@spt/loaders/BundleLoader";
import { ModTypeCheck } from "@spt/loaders/ModTypeCheck";
import { PreSptModLoader } from "@spt/loaders/PreSptModLoader";
import type { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import type { IPostDBLoadModAsync } from "@spt/models/external/IPostDBLoadModAsync";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { LocalisationService } from "@spt/services/LocalisationService";
import { inject, injectable } from "tsyringe";
import type { DependencyContainer } from "tsyringe";

@injectable()
export class PostDBModLoader implements OnLoad {
    protected container: DependencyContainer;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("BundleLoader") protected bundleLoader: BundleLoader,
        @inject("PreSptModLoader") protected preSptModLoader: PreSptModLoader,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ModTypeCheck") protected modTypeCheck: ModTypeCheck,
    ) {}

    public async onLoad(): Promise<void> {
        if (globalThis.G_MODS_ENABLED) {
            this.container = this.preSptModLoader.getContainer();
            await this.executeModsAsync();
            this.addBundles();
        }
    }

    public getRoute(): string {
        return "spt-mods";
    }

    public getModPath(mod: string): string {
        return this.preSptModLoader.getModPath(mod);
    }

    protected async executeModsAsync(): Promise<void> {
        const mods = this.preSptModLoader.sortModsLoadOrder();
        for (const modName of mods) {
            // import class
            const filepath = `${this.preSptModLoader.getModPath(modName)}${
                this.preSptModLoader.getImportedModDetails()[modName].main
            }`;
            const modpath = `${process.cwd()}/${filepath}`;
            const mod = require(modpath);

            if (this.modTypeCheck.isPostDBLoadAsync(mod.mod)) {
                try {
                    await (mod.mod as IPostDBLoadModAsync).postDBLoadAsync(this.container);
                } catch (err) {
                    this.logger.error(
                        this.localisationService.getText(
                            "modloader-async_mod_error",
                            `${err?.message ?? ""}\n${err.stack ?? ""}`,
                        ),
                    );
                }
            }

            if (this.modTypeCheck.isPostDBLoad(mod.mod)) {
                (mod.mod as IPostDBLoadMod).postDBLoad(this.container);
            }
        }
    }

    protected addBundles(): void {
        const importedMods = this.preSptModLoader.getImportedModDetails();
        for (const [mod, pkg] of Object.entries(importedMods)) {
            const modPath = this.preSptModLoader.getModPath(mod);

            if (pkg.isBundleMod ?? false) {
                this.bundleLoader.addBundles(modPath);
            }
        }
    }
}
