import { inject, injectable } from "tsyringe";

import { InraidCallbacks } from "@spt-aki/callbacks/InraidCallbacks";
import { RouteAction, StaticRouter } from "@spt-aki/di/Router";

@injectable()
export class InraidStaticRouter extends StaticRouter
{
    constructor(@inject("InraidCallbacks") protected inraidCallbacks: InraidCallbacks)
    {
        super([
            new RouteAction("/raid/profile/save", (url: string, info: any, sessionID: string, output: string): any =>
            {
                return this.inraidCallbacks.saveProgress(url, info, sessionID);
            }),
            new RouteAction(
                "/singleplayer/settings/raid/endstate",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getRaidEndState();
                },
            ),
            new RouteAction(
                "/singleplayer/settings/weapon/durability",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getWeaponDurability();
                },
            ),
            new RouteAction(
                "/singleplayer/settings/raid/menu",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getRaidMenuSettings();
                },
            ),
            new RouteAction(
                "/singleplayer/airdrop/config",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getAirdropConfig();
                },
            ),
            new RouteAction(
                "/singleplayer/btr/config",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getBTRConfig();
                },
            ),
            new RouteAction(
                "/singleplayer/traderServices/itemDelivery",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.itemDelivery(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/scav/traitorscavhostile",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getTraitorScavHostileChance(url, info, sessionID);
                },
            ),
            new RouteAction(
                "/singleplayer/sandbox/maxpatrol",
                (url: string, info: any, sessionID: string, output: string): any =>
                {
                    return this.inraidCallbacks.getSandboxMaxPatrolValue(url, info, sessionID);
                },
            ),
        ]);
    }
}
