import { IPackageJsonData } from "@spt/models/spt/mod/IPackageJsonData";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { LocalisationService } from "@spt/services/LocalisationService";
import { inject, injectable } from "tsyringe";

@injectable()
export class ModLoadOrder {
    protected mods = new Map<string, IPackageJsonData>();
    protected modsAvailable = new Map<string, IPackageJsonData>();
    protected loadOrder = new Set<string>();

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("LocalisationService") protected localisationService: LocalisationService,
    ) {}

    public setModList(mods: Record<string, IPackageJsonData>): void {
        this.mods = new Map<string, IPackageJsonData>(Object.entries(mods));
        this.modsAvailable = structuredClone(this.mods);
        this.loadOrder = new Set<string>();

        const visited = new Set<string>();

        // invert loadBefore into loadAfter on specified mods
        for (const [modName, modConfig] of this.modsAvailable) {
            if ((modConfig.loadBefore ?? []).length > 0) {
                this.invertLoadBefore(modName);
            }
        }

        for (const modName of this.modsAvailable.keys()) {
            this.getLoadOrderRecursive(modName, visited);
        }
    }

    public getLoadOrder(): string[] {
        return Array.from(this.loadOrder);
    }

    public getModsOnLoadBefore(mod: string): Set<string> {
        if (!this.mods.has(mod)) {
            throw new Error(this.localisationService.getText("modloader-mod_isnt_present", mod));
        }

        const config = this.mods.get(mod);

        const loadBefore = new Set<string>(config.loadBefore);

        for (const loadBeforeMod of loadBefore) {
            if (!this.mods.has(loadBeforeMod)) {
                loadBefore.delete(loadBeforeMod);
            }
        }

        return loadBefore;
    }

    public getModsOnLoadAfter(mod: string): Set<string> {
        if (!this.mods.has(mod)) {
            throw new Error(this.localisationService.getText("modloader-mod_isnt_present", mod));
        }

        const config = this.mods.get(mod);

        const loadAfter = new Set<string>(config.loadAfter);

        for (const loadAfterMod of loadAfter) {
            if (!this.mods.has(loadAfterMod)) {
                loadAfter.delete(loadAfterMod);
            }
        }

        return loadAfter;
    }

    protected invertLoadBefore(mod: string): void {
        const loadBefore = this.getModsOnLoadBefore(mod);

        for (const loadBeforeMod of loadBefore) {
            const loadBeforeModConfig = this.modsAvailable.get(loadBeforeMod);

            loadBeforeModConfig.loadAfter ??= [];
            loadBeforeModConfig.loadAfter.push(mod);

            this.modsAvailable.set(loadBeforeMod, loadBeforeModConfig);
        }
    }

    protected getLoadOrderRecursive(mod: string, visited: Set<string>): void {
        // Validate package
        if (this.loadOrder.has(mod)) {
            return;
        }

        if (visited.has(mod)) {
            // Additional info to help debug
            this.logger.debug(this.localisationService.getText("modloader-checking_mod", mod));
            this.logger.debug(`${this.localisationService.getText("modloader-checked")}:`);
            this.logger.debug(JSON.stringify(this.loadOrder, undefined, "\t"));
            this.logger.debug(`${this.localisationService.getText("modloader-visited")}:`);
            this.logger.debug(JSON.stringify(visited, undefined, "\t"));

            throw new Error(this.localisationService.getText("modloader-cyclic_dependency"));
        }

        // Check dependencies
        if (!this.modsAvailable.has(mod)) {
            throw new Error(this.localisationService.getText("modloader-error_parsing_mod_load_order"));
        }

        const config = this.modsAvailable.get(mod);

        config.loadAfter ??= [];
        config.modDependencies ??= {};

        const dependencies = new Set<string>(Object.keys(config.modDependencies));

        for (const modAfter of config.loadAfter) {
            if (this.modsAvailable.has(modAfter)) {
                if (this.modsAvailable.get(modAfter)?.loadAfter?.includes(mod)) {
                    throw new Error(
                        this.localisationService.getText("modloader-load_order_conflict", {
                            modOneName: mod,
                            modTwoName: modAfter,
                        }),
                    );
                }

                dependencies.add(modAfter);
            }
        }

        visited.add(mod);

        for (const mod of dependencies) {
            this.getLoadOrderRecursive(mod, visited);
        }

        visited.delete(mod);
        this.loadOrder.add(mod);
    }
}
