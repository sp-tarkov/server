import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IEliminationConfig, IQuestConfig, IRepeatableQuestConfig } from "@spt/models/spt/config/IQuestConfig";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { MathUtil } from "@spt/utils/MathUtil";
import { ProbabilityObject, ProbabilityObjectArray } from "@spt/utils/RandomUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RepeatableQuestHelper {
    protected questConfig: IQuestConfig;

    constructor(
        @inject("MathUtil") protected mathUtil: MathUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }

    /**
     * Get the relevant elimination config based on the current players PMC level
     * @param pmcLevel Level of PMC character
     * @param repeatableConfig Main repeatable config
     * @returns IEliminationConfig
     */
    public getEliminationConfigByPmcLevel(
        pmcLevel: number,
        repeatableConfig: IRepeatableQuestConfig,
    ): IEliminationConfig {
        return repeatableConfig.questConfig.Elimination.find(
            (x) => pmcLevel >= x.levelRange.min && pmcLevel <= x.levelRange.max,
        );
    }

    public probabilityObjectArray<K, V>(configArrayInput: ProbabilityObject<K, V>[]): ProbabilityObjectArray<K, V> {
        const configArray = this.cloner.clone(configArrayInput);
        const probabilityArray = new ProbabilityObjectArray<K, V>(this.mathUtil, this.cloner);
        for (const configObject of configArray) {
            probabilityArray.push(
                new ProbabilityObject(configObject.key, configObject.relativeProbability, configObject.data),
            );
        }
        return probabilityArray;
    }
}
