import { CustomisationSource } from "@spt/models/eft/common/tables/ICustomisationStorage";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IReward } from "@spt/models/eft/common/tables/IReward";
import { IPendingPrestige, ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { RewardType } from "@spt/models/enums/RewardType";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseService } from "@spt/services/DatabaseService";
import { MailSendService } from "@spt/services/MailSendService";
import { TimeUtil } from "@spt/utils/TimeUtil";
import type { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";
import { ProfileHelper } from "./ProfileHelper";
import { RewardHelper } from "./RewardHelper";

@injectable()
export class PrestigeHelper {
    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("PrimaryCloner") protected cloner: ICloner,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("RewardHelper") protected rewardHelper: RewardHelper,
    ) {}

    public processPendingPrestige(oldProfile: ISptProfile, newProfile: ISptProfile, prestige: IPendingPrestige): void {
        const prePrestigePmc = oldProfile.characters.pmc;
        const sessionId = newProfile.info.id;

        // Skill copy
        if (prePrestigePmc.Skills.Common) {
            const commonSKillsToCopy = prePrestigePmc.Skills.Common;
            for (const skillToCopy of commonSKillsToCopy) {
                // Set progress 5% of what it was
                skillToCopy.Progress = skillToCopy.Progress * 0.05;
                const existingSkill = newProfile.characters.pmc.Skills.Common.find(
                    (skill) => skill.Id === skillToCopy.Id,
                );
                if (existingSkill) {
                    existingSkill.Progress = skillToCopy.Progress;
                } else {
                    newProfile.characters.pmc.Skills.Common.push(skillToCopy);
                }
            }

            const masteringSkillsToCopy = prePrestigePmc.Skills.Mastering;
            for (const skillToCopy of masteringSkillsToCopy) {
                // Set progress 5% of what it was
                skillToCopy.Progress = skillToCopy.Progress * 0.05;
                const existingSkill = newProfile.characters.pmc.Skills.Mastering.find(
                    (skill) => skill.Id === skillToCopy.Id,
                );
                if (existingSkill) {
                    existingSkill.Progress = skillToCopy.Progress;
                } else {
                    newProfile.characters.pmc.Skills.Mastering.push(skillToCopy);
                }
            }
        }

        const indexOfPrestigeObtained = Math.min(prestige.prestigeLevel - 1, 1); // Index starts at 0

        // Add "Prestigious" achievement
        if (!newProfile.characters.pmc.Achievements["676091c0f457869a94017a23"]) {
            this.rewardHelper.addAchievementToProfile(newProfile, "676091c0f457869a94017a23");
        }

        // Assumes Prestige data is in descending order
        const currentPrestigeData = this.databaseService.getTemplates().prestige.elements[indexOfPrestigeObtained];
        const prestigeRewards = this.databaseService
            .getTemplates()
            .prestige.elements.slice(0, indexOfPrestigeObtained + 1)
            .flatMap((prestige) => prestige.rewards);

        this.addPrestigeRewardsToProfile(sessionId, newProfile, prestigeRewards);

        // Flag profile as having achieved this prestige level
        newProfile.characters.pmc.Prestige[currentPrestigeData.id] = this.timeUtil.getTimestamp();

        const itemsToTransfer: IItem[] = [];

        // Copy transferred items
        for (const transferRequest of prestige.items ?? []) {
            const item = prePrestigePmc.Inventory.items.find((item) => item._id === transferRequest.id);
            if (!item) {
                this.logger.error(
                    `Unable to find item with id: ${transferRequest.id} in profile: ${sessionId}, skipping`,
                );

                continue;
            }

            itemsToTransfer.push(item);
        }

        this.mailSendService.sendSystemMessageToPlayer(sessionId, "", itemsToTransfer, 31536000);

        newProfile.characters.pmc.Info.PrestigeLevel = prestige.prestigeLevel;
    }

    protected addPrestigeRewardsToProfile(sessionId: string, newProfile: ISptProfile, rewards: IReward[]) {
        const itemsToSend: IItem[] = [];

        for (const reward of rewards) {
            switch (reward.type) {
                case RewardType.CUSTOMIZATION_DIRECT: {
                    this.profileHelper.addHideoutCustomisationUnlock(newProfile, reward, CustomisationSource.PRESTIGE);
                    break;
                }
                case RewardType.SKILL:
                    this.profileHelper.addSkillPointsToPlayer(
                        newProfile.characters.pmc,
                        reward.target as SkillTypes,
                        reward.value as number,
                    );
                    break;
                case RewardType.ITEM: {
                    if (reward.items) {
                        itemsToSend.push(...reward.items);
                    }
                    break;
                }
                case RewardType.EXTRA_DAILY_QUEST: {
                    this.profileHelper.addExtraRepeatableQuest(newProfile, reward.target as string, reward.value as number);
                    break;
                }
                default:
                    this.logger.error(`Unhandled prestige reward type: ${reward.type}`);
                    break;
            }
        }

        if (itemsToSend.length > 0) {
            this.mailSendService.sendSystemMessageToPlayer(sessionId, "", itemsToSend, 31536000);
        }
    }
}
