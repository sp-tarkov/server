import { inject, injectable } from "tsyringe";

import { InraidCallbacks } from "@spt-aki/callbacks/InraidCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class InraidStaticRouter extends StaticRouter
{
    constructor(@inject("InraidCallbacks") protected inraidCallbacks: InraidCallbacks)
    {
        super([
            new RouteAction(
                "/raid/profile/save",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.saveProgress(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/settings/raid/endstate",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getRaidEndState();
                },
            ),
            new RouteAction(
                "/singleplayer/settings/weapon/durability",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getWeaponDurability();
                },
            ),
            new RouteAction(
                "/singleplayer/settings/raid/menu",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getRaidMenuSettings();
                },
            ),
            new RouteAction(
                "/singleplayer/airdrop/config",
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getAirdropConfig();
                },
            ),
        ]);
    }
}
