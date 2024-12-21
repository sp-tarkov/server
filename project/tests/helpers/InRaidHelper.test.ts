import "reflect-metadata";
import type { InRaidHelper } from "@spt/helpers/InRaidHelper";
import type { IPmcData } from "@spt/models/eft/common/IPmcData";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("InRaidHelper", () => {
    let inraidHelper: any;

    beforeEach(() => {
        inraidHelper = container.resolve<InRaidHelper>("InRaidHelper");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("resetSkillPointsEarnedDuringRaid", () => {
        it("should reset PointsEarnedDuringSession for each skill in profile", () => {
            const mockProfile = {
                Skills: {
                    Common: [
                        { Id: "BotReload", Progress: 160.543, PointsEarnedDuringSession: 42, LastAccess: 1712633904 },
                        { Id: "BotSound", Progress: 145.6547, PointsEarnedDuringSession: 42, LastAccess: 1712633904 },
                        {
                            Id: "Endurance",
                            Progress: 223.951157,
                            PointsEarnedDuringSession: 42,
                            LastAccess: 1712633904,
                        },
                        { Id: "Strength", Progress: 141.2618, PointsEarnedDuringSession: 42, LastAccess: 1712633904 },
                    ],
                },
            };

            (inraidHelper as any).resetSkillPointsEarnedDuringRaid(<IPmcData>mockProfile);

            for (const skill of mockProfile.Skills.Common) {
                expect(skill.PointsEarnedDuringSession).toBe(0);
            }
        });
    });
});
