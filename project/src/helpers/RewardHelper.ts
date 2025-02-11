import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { TraderHelper } from "@spt/helpers/TraderHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { CustomisationSource } from "@spt/models/eft/common/tables/ICustomisationStorage";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IReward } from "@spt/models/eft/common/tables/IReward";
import { IHideoutProduction } from "@spt/models/eft/hideout/IHideoutProduction";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { RewardType } from "@spt/models/enums/RewardType";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class RewardHelper {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("TraderHelper") protected traderHelper: TraderHelper,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {}

    /**
     * Apply the given rewards to the passed in profile
     * @param rewards List of rewards to apply
     * @param source The source of the rewards (Achievement, quest)
     * @param fullProfile The full profile to apply the rewards to
     * @param questId The quest or achievement ID, used for finding production unlocks
     * @param questResponse Response to quest completion when a production is unlocked
     * @returns List of items that were rewarded
     */
    public applyRewards(
        rewards: IReward[],
        source: CustomisationSource,
        fullProfile: ISptProfile,
        profileData: IPmcData,
        questId: string,
        questResponse?: IItemEventRouterResponse,
    ): IItem[] {
        const sessionId = fullProfile?.info?.id;
        const pmcProfile = fullProfile?.characters.pmc;
        if (!pmcProfile) {
            this.logger.error(`Unable to get pmc profile for: ${sessionId}, no rewards given`);
            return [];
        }

        const gameVersion = pmcProfile.Info.GameVersion;

        for (const reward of rewards) {
            // Handle reward availability for different game versions, notAvailableInGameEditions currently not used
            if (!this.rewardIsForGameEdition(reward, gameVersion)) {
                continue;
            }

            switch (reward.type) {
                case RewardType.SKILL:
                    // This needs to use the passed in profileData, as it could be the scav profile
                    this.profileHelper.addSkillPointsToPlayer(
                        profileData,
                        reward.target as SkillTypes,
                        Number(reward.value),
                    );
                    break;
                case RewardType.EXPERIENCE:
                    this.profileHelper.addExperienceToPmc(sessionId, Number.parseInt(<string>reward.value)); // this must occur first as the output object needs to take the modified profile exp value
                    break;
                case RewardType.TRADER_STANDING:
                    this.traderHelper.addStandingToTrader(
                        sessionId,
                        reward.target,
                        Number.parseFloat(<string>reward.value),
                    );
                    break;
                case RewardType.TRADER_UNLOCK:
                    this.traderHelper.setTraderUnlockedState(reward.target, true, sessionId);
                    break;
                case RewardType.ITEM:
                    // Item rewards are retrieved by getRewardItems() below, and returned to be handled by caller
                    break;
                case RewardType.ASSORTMENT_UNLOCK:
                    // Handled by getAssort(), locked assorts are stripped out by `assortHelper.stripLockedLoyaltyAssort()` before being sent to player
                    break;
                case RewardType.ACHIEVEMENT:
                    this.addAchievementToProfile(fullProfile, reward.target);
                    break;
                case RewardType.STASH_ROWS:
                    this.profileHelper.addStashRowsBonusToProfile(sessionId, Number.parseInt(<string>reward.value)); // Add specified stash rows from reward - requires client restart
                    break;
                case RewardType.PRODUCTIONS_SCHEME:
                    this.findAndAddHideoutProductionIdToProfile(pmcProfile, reward, questId, sessionId, questResponse);
                    break;
                case RewardType.POCKETS:
                    this.profileHelper.replaceProfilePocketTpl(pmcProfile, reward.target);
                    break;
                case RewardType.CUSTOMIZATION_DIRECT:
                    this.profileHelper.addHideoutCustomisationUnlock(fullProfile, reward, source);
                    break;
                default:
                    this.logger.error(
                        this.localisationService.getText("reward-type_not_handled", {
                            rewardType: reward.type,
                            questId: questId,
                        }),
                    );
                    break;
            }
        }

        return this.getRewardItems(rewards, gameVersion);
    }

    /**
     * Does the provided reward have a game version requirement to be given and does it match
     * @param reward Reward to check
     * @param gameVersion Version of game to check reward against
     * @returns True if it has requirement, false if it doesnt pass check
     */
    public rewardIsForGameEdition(reward: IReward, gameVersion: string): boolean {
        if (reward.availableInGameEditions?.length > 0 && !reward.availableInGameEditions?.includes(gameVersion)) {
            // Reward has edition whitelist and game version isnt in it
            return false;
        }

        if (reward.notAvailableInGameEditions?.length > 0 && reward.notAvailableInGameEditions?.includes(gameVersion)) {
            // Reward has edition blacklist and game version is in it
            return false;
        }

        // No whitelist/blacklist or reward isnt blacklisted/whitelisted
        return true;
    }

    /**
     * WIP - Find hideout craft id and add to unlockedProductionRecipe array in player profile
     * also update client response recipeUnlocked array with craft id
     * @param pmcData Player profile
     * @param craftUnlockReward Reward with craft unlock details
     * @param questId Quest or achievement ID with craft unlock reward
     * @param sessionID Session id
     * @param response Response to send back to client
     */
    protected findAndAddHideoutProductionIdToProfile(
        pmcData: IPmcData,
        craftUnlockReward: IReward,
        questId: string,
        sessionID: string,
        response?: IItemEventRouterResponse,
    ): void {
        const matchingProductions = this.getRewardProductionMatch(craftUnlockReward, questId);
        if (matchingProductions.length !== 1) {
            this.logger.error(
                this.localisationService.getText("reward-unable_to_find_matching_hideout_production", {
                    questId: questId,
                    matchCount: matchingProductions.length,
                }),
            );

            return;
        }

        // Add above match to pmc profile + client response
        const matchingCraftId = matchingProductions[0]._id;
        pmcData.UnlockedInfo.unlockedProductionRecipe.push(matchingCraftId);
        if (response) {
            response.profileChanges[sessionID].recipeUnlocked[matchingCraftId] = true;
        }
    }

    /**
     * Find hideout craft for the specified reward
     * @param craftUnlockReward Reward with craft unlock details
     * @param questId Quest or achievement ID with craft unlock reward
     * @returns Hideout craft
     */
    public getRewardProductionMatch(craftUnlockReward: IReward, questId: string): IHideoutProduction[] {
        // Get hideout crafts and find those that match by areatype/required level/end product tpl - hope for just one match
        const craftingRecipes = this.databaseService.getHideout().production.recipes;

        // Area that will be used to craft unlocked item
        const desiredHideoutAreaType = Number.parseInt(craftUnlockReward.traderId);

        let matchingProductions = craftingRecipes.filter(
            (prod) =>
                prod.areaType === desiredHideoutAreaType &&
                //prod.requirements.some((requirement) => requirement.questId === questId) && // BSG dont store the quest id in requirement any more!
                prod.requirements.some((requirement) => requirement.type === "QuestComplete") &&
                prod.requirements.some((requirement) => requirement.requiredLevel === craftUnlockReward.loyaltyLevel) &&
                prod.endProduct === craftUnlockReward.items[0]._tpl,
        );

        // More/less than single match, above filtering wasn't strict enough
        if (matchingProductions.length !== 1) {
            // Multiple matches were found, last ditch attempt to match by questid (value we add manually to production.json via `gen:productionquests` command)
            matchingProductions = matchingProductions.filter((prod) =>
                prod.requirements.some((requirement) => requirement.questId === questId),
            );
        }

        return matchingProductions;
    }

    /**
     * Gets a flat list of reward items from the given rewards for the specified game version
     * @param rewards Array of rewards to get the items from
     * @param gameVersion The game version of the profile
     * @returns array of items with the correct maxStack
     */
    protected getRewardItems(rewards: IReward[], gameVersion: string): IItem[] {
        // Iterate over all rewards with the desired status, flatten out items that have a type of Item
        const rewardItems = rewards.flatMap((reward: IReward) =>
            reward.type === "Item" && this.rewardIsForGameEdition(reward, gameVersion)
                ? this.processReward(reward)
                : [],
        );

        return rewardItems;
    }

    /**
     * Take reward item and set FiR status + fix stack sizes + fix mod Ids
     * @param reward Reward item to fix
     * @returns Fixed rewards
     */
    protected processReward(reward: IReward): IItem[] {
        /** item with mods to return */
        let rewardItems: IItem[] = [];
        let targets: IItem[] = [];
        const mods: IItem[] = [];

        // Is armor item that may need inserts / plates
        if (reward.items.length === 1 && this.itemHelper.armorItemCanHoldMods(reward.items[0]._tpl)) {
            // Only process items with slots
            if (this.itemHelper.itemHasSlots(reward.items[0]._tpl)) {
                // Attempt to pull default preset from globals and add child items to reward (clones reward.items)
                this.generateArmorRewardChildSlots(reward.items[0], reward);
            }
        }

        for (const rewardItem of reward.items) {
            this.itemHelper.addUpdObjectToItem(rewardItem);

            // Reward items are granted Found in Raid status (except currency)
            this.itemHelper.setFoundInRaid(reward.items);

            // Is root item, fix stacks
            if (rewardItem._id === reward.target) {
                // Is base reward item
                if (
                    rewardItem.parentId !== undefined &&
                    rewardItem.parentId === "hideout" && // Has parentId of hideout
                    rewardItem.upd !== undefined &&
                    rewardItem.upd.StackObjectsCount !== undefined && // Has upd with stackobject count
                    rewardItem.upd.StackObjectsCount > 1 // More than 1 item in stack
                ) {
                    rewardItem.upd.StackObjectsCount = 1;
                }
                targets = this.itemHelper.splitStack(rewardItem);
                // splitStack created new ids for the new stacks. This would destroy the relation to possible children.
                // Instead, we reset the id to preserve relations and generate a new id in the downstream loop, where we are also reparenting if required
                for (const target of targets) {
                    target._id = rewardItem._id;
                }
            } else {
                // Is child mod
                if (reward.items[0].upd.SpawnedInSession) {
                    // Propigate FiR status into child items
                    rewardItem.upd.SpawnedInSession = reward.items[0].upd.SpawnedInSession;
                }

                mods.push(rewardItem);
            }
        }

        // Add mods to the base items, fix ids
        for (const target of targets) {
            // This has all the original id relations since we reset the id to the original after the splitStack
            const itemsClone = [this.cloner.clone(target)];
            // Here we generate a new id for the root item
            target._id = this.hashUtil.generate();

            for (const mod of mods) {
                itemsClone.push(this.cloner.clone(mod));
            }

            rewardItems = rewardItems.concat(this.itemHelper.reparentItemAndChildren(target, itemsClone));
        }

        return rewardItems;
    }

    /**
     * Add missing mod items to an armor reward
     * @param originalRewardRootItem Original armor reward item from IReward.items object
     * @param reward Armor reward
     */
    protected generateArmorRewardChildSlots(originalRewardRootItem: IItem, reward: IReward): void {
        // Look for a default preset from globals for armor
        const defaultPreset = this.presetHelper.getDefaultPreset(originalRewardRootItem._tpl);
        if (defaultPreset) {
            // Found preset, use mods to hydrate reward item
            const presetAndMods: IItem[] = this.itemHelper.replaceIDs(defaultPreset._items);
            const newRootId = this.itemHelper.remapRootItemId(presetAndMods);

            reward.items = presetAndMods;

            // Find root item and set its stack count
            const rootItem = reward.items.find((item) => item._id === newRootId);

            // Remap target id to the new presets root id
            reward.target = rootItem._id;

            // Copy over stack count otherwise reward shows as missing in client
            this.itemHelper.addUpdObjectToItem(rootItem);

            rootItem.upd.StackObjectsCount = originalRewardRootItem.upd.StackObjectsCount;

            return;
        }

        this.logger.warning(
            `Unable to find default preset for armor ${originalRewardRootItem._tpl}, adding mods manually`,
        );
        const itemDbData = this.itemHelper.getItem(originalRewardRootItem._tpl)[1];

        // Hydrate reward with only 'required' mods - necessary for things like helmets otherwise you end up with nvgs/visors etc
        reward.items = this.itemHelper.addChildSlotItems(reward.items, itemDbData, undefined, true);
    }

    /**
     * Add an achievement to player profile and handle any rewards for the achievement
     * Triggered from a quest, or another achievement
     * @param fullProfile Profile to add achievement to
     * @param achievementId Id of achievement to add
     */
    public addAchievementToProfile(fullProfile: ISptProfile, achievementId: string): void {
        if (!fullProfile.characters.pmc.Achievements[achievementId]) {
            // Add achievement id to profile with timestamp it was unlocked
            fullProfile.characters.pmc.Achievements[achievementId] = this.timeUtil.getTimestamp();
        }

        // Check for any customisation unlocks
        const achievementDataDb = this.databaseService
            .getTemplates()
            .achievements.find((achievement) => achievement.id === achievementId);
        if (!achievementDataDb) {
            return;
        }

        // Note: At the moment, we don't know the exact quest and achievement data layout for an achievement
        //       that is triggered by a quest, that gives an item, because BSG has only done this once. However
        //       based on deduction, I am going to assume that the *quest* will handle the initial item reward,
        //       and the achievement reward should only be handled post-wipe.
        // All of that is to say, we are going to ignore the list of returned reward items here
        const pmcProfile = fullProfile.characters.pmc;
        this.applyRewards(
            achievementDataDb.rewards,
            CustomisationSource.ACHIEVEMENT,
            fullProfile,
            pmcProfile,
            achievementDataDb.id,
        );
    }
}
