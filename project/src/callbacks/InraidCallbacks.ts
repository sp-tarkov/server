import { inject, injectable } from "tsyringe";

import { InraidController } from "@spt-aki/controllers/InraidController";
import { IEmptyRequestData } from "@spt-aki/models/eft/common/IEmptyRequestData";
import { INullResponseData } from "@spt-aki/models/eft/httpResponse/INullResponseData";
import { IItemDeliveryRequestData } from "@spt-aki/models/eft/inRaid/IItemDeliveryRequestData";
import { IRegisterPlayerRequestData } from "@spt-aki/models/eft/inRaid/IRegisterPlayerRequestData";
import { ISaveProgressRequestData } from "@spt-aki/models/eft/inRaid/ISaveProgressRequestData";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";

/**
 * Handle client requests
 */
@injectable()
export class InraidCallbacks
{
    constructor(
        @inject("InraidController") protected inraidController: InraidController,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
    )
    {}

    /**
     * Handle client/location/getLocalloot
     * Store active map in profile + applicationContext
     * @param url
     * @param info register player request
     * @param sessionID Session id
     * @returns Null http response
     */
    public registerPlayer(url: string, info: IRegisterPlayerRequestData, sessionID: string): INullResponseData
    {
        this.inraidController.addPlayer(sessionID, info);
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle raid/profile/save
     * @param url
     * @param info Save progress request
     * @param sessionID Session id
     * @returns Null http response
     */
    public saveProgress(url: string, info: ISaveProgressRequestData, sessionID: string): INullResponseData
    {
        this.inraidController.savePostRaidProgress(info, sessionID);
        return this.httpResponse.nullResponse();
    }

    /**
     * Handle singleplayer/settings/raid/endstate
     * @returns
     */
    public getRaidEndState(): string
    {
        return this.httpResponse.noBody(this.inraidController.getInraidConfig().MIAOnRaidEnd);
    }

    /**
     * Handle singleplayer/settings/raid/menu
     * @returns JSON as string
     */
    public getRaidMenuSettings(): string
    {
        return this.httpResponse.noBody(this.inraidController.getInraidConfig().raidMenuSettings);
    }

    /**
     * Handle singleplayer/settings/weapon/durability
     * @returns
     */
    public getWeaponDurability(): string
    {
        return this.httpResponse.noBody(this.inraidController.getInraidConfig().save.durability);
    }

    /**
     * Handle singleplayer/airdrop/config
     * @returns JSON as string
     */
    public getAirdropConfig(): string
    {
        return this.httpResponse.noBody(this.inraidController.getAirdropConfig());
    }

    /**
     * Handle singleplayer/btr/config
     * @returns JSON as string
     */
    public getBTRConfig(): string
    {
        return this.httpResponse.noBody(this.inraidController.getBTRConfig());
    }

    /**
     * Handle singleplayer/traderServices/getTraderServices
     */
    public getTraderServices(url: string, info: IEmptyRequestData, sessionId: string): string
    {
        const lastSlashPos = url.lastIndexOf("/");
        const traderId = url.substring(lastSlashPos + 1);
        return this.httpResponse.noBody(this.inraidController.getTraderServices(sessionId, traderId));
    }

    /**
     * Handle singleplayer/traderServices/itemDelivery
     */
    public itemDelivery(url: string, request: IItemDeliveryRequestData, sessionId: string): INullResponseData
    {
        this.inraidController.itemDelivery(sessionId, request.traderId, request.items);
        return this.httpResponse.nullResponse();
    }

    public getTraitorScavHostileChance(url: string, info: IEmptyRequestData, sessionId: string): string
    {
        return this.httpResponse.noBody(this.inraidController.getTraitorScavHostileChance(url, sessionId));
    }

    public getSandboxMaxPatrolValue(url: string, info: IEmptyRequestData, sessionId: string): string
    {
        return this.httpResponse.noBody(this.inraidController.getSandboxMaxPatrolValue(url, sessionId));
    }
}
