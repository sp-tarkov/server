import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { IPostDBLoadModAsync } from "@spt/models/external/IPostDBLoadModAsync";
import { IPostSptLoadMod } from "@spt/models/external/IPostSptLoadMod";
import { IPostSptLoadModAsync } from "@spt/models/external/IPostSptLoadModAsync";
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { IPreSptLoadModAsync } from "@spt/models/external/IPreSptLoadModAsync";
import { injectable } from "tsyringe";

@injectable()
export class ModTypeCheck {
    /**
     * Use defined safe guard to check if the mod is a IPreSptLoadMod
     * @returns boolean
     */
    public isPreSptLoad(mod: any): mod is IPreSptLoadMod {
        return mod?.preSptLoad;
    }

    /**
     * Use defined safe guard to check if the mod is a IPostSptLoadMod
     * @returns boolean
     */
    public isPostSptLoad(mod: any): mod is IPostSptLoadMod {
        return mod?.postSptLoad;
    }

    /**
     * Use defined safe guard to check if the mod is a IPostDBLoadMod
     * @returns boolean
     */
    public isPostDBLoad(mod: any): mod is IPostDBLoadMod {
        return mod?.postDBLoad;
    }

    /**
     * Use defined safe guard to check if the mod is a IPreSptLoadModAsync
     * @returns boolean
     */
    public isPreSptLoadAsync(mod: any): mod is IPreSptLoadModAsync {
        return mod?.preSptLoadAsync;
    }

    /**
     * Use defined safe guard to check if the mod is a IPostSptLoadModAsync
     * @returns boolean
     */
    public isPostSptLoadAsync(mod: any): mod is IPostSptLoadModAsync {
        return mod?.postSptLoadAsync;
    }

    /**
     * Use defined safe guard to check if the mod is a IPostDBLoadModAsync
     * @returns boolean
     */
    public isPostDBLoadAsync(mod: any): mod is IPostDBLoadModAsync {
        return mod?.postDBLoadAsync;
    }

    /**
     * Checks for mod to be compatible with 3.X+
     * @returns boolean
     */
    public isPostV3Compatible(mod: any): boolean {
        return (
            this.isPreSptLoad(mod) ||
            this.isPostSptLoad(mod) ||
            this.isPostDBLoad(mod) ||
            this.isPreSptLoadAsync(mod) ||
            this.isPostSptLoadAsync(mod) ||
            this.isPostDBLoadAsync(mod)
        );
    }
}
