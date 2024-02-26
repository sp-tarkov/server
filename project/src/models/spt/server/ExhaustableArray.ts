import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";

export class ExhaustableArray<T> implements IExhaustableArray<T>
{
    private pool: T[];

    constructor(private itemPool: T[], private randomUtil: RandomUtil, private jsonUtil: JsonUtil)
    {
        this.pool = this.jsonUtil.clone(itemPool);
    }

    public getRandomValue(): T
    {
        if (!this.pool?.length)
        {
            return null;
        }

        const index = this.randomUtil.getInt(0, this.pool.length - 1);
        const toReturn = this.jsonUtil.clone(this.pool[index]);
        this.pool.splice(index, 1);
        return toReturn;
    }

    public getFirstValue(): T
    {
        if (!this.pool?.length)
        {
            return null;
        }

        const toReturn = this.jsonUtil.clone(this.pool[0]);
        this.pool.splice(0, 1);
        return toReturn;
    }

    public hasValues(): boolean
    {
        if (this.pool?.length)
        {
            return true;
        }

        return false;
    }
}

export interface IExhaustableArray<T>
{
    getRandomValue(): T;
    getFirstValue(): T;
    hasValues(): boolean;
}
