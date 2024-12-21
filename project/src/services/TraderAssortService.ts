import type { ITraderAssort } from "@spt/models/eft/common/tables/ITrader";

export class TraderAssortService {
    protected pristineTraderAssorts: Record<string, ITraderAssort> = {};

    public getPristineTraderAssort(traderId: string): ITraderAssort {
        return this.pristineTraderAssorts[traderId];
    }

    /**
     * Store trader assorts inside a class property
     * @param traderId Traderid to store assorts against
     * @param assort Assorts to store
     */
    public setPristineTraderAssort(traderId: string, assort: ITraderAssort): void {
        this.pristineTraderAssorts[traderId] = assort;
    }
}
