import "reflect-metadata";

import { HealthController } from "@spt/controllers/HealthController";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { IHealthTreatmentRequestData } from "@spt/models/eft/health/IHealthTreatmentRequestData";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("HealthController", () => {
    let healthController: HealthController; // Using "any" to access private/protected methods without type errors.

    beforeEach(() => {
        healthController = container.resolve<HealthController>("HealthController");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("healthTreatment", () => {
        it("Should Heal Players heavy bleed and heal chest to full hp", () => {
            const maxHealth = 100;
            const pmcData = {
                Health: {
                    BodyParts: {
                        Chest: {
                            Health: {
                                Current: 50, // Has damage
                                Maximum: maxHealth,
                            },
                            Effects: { HeavyBleeding: { Time: 20 } },
                        },
                    },
                },
            };
            const bleedRemovalAndLimbHealRequest = {
                Action: "RestoreHealth",
                trader: "54cb57776803fa99248b456e", // Therapist
                difference: {
                    BodyParts: {
                        Chest: {
                            Health: 23, // > 0 value means it will heal
                            Effects: ["HeavyBleeding"], // non-null means it will remove effect from player
                        },
                    },
                },
            };
            const sessionId = "12345";

            // Mock output generation
            vi.spyOn((healthController as any).eventOutputHolder, "getOutput").mockReturnValue({
                warnings: {},
                profileChanges: { 12345: { health: {} } },
            });

            // Mock payment
            vi.spyOn((healthController as any).paymentService, "payMoney").mockReturnValue({
                warnings: {},
                profileChanges: { 12345: { health: {} } },
            });

            const result = healthController.healthTreatment(
                pmcData as unknown as IPmcData,
                bleedRemovalAndLimbHealRequest as IHealthTreatmentRequestData,
                sessionId,
            );

            // Has healed chest to full
            expect(result.profileChanges[sessionId].health.BodyParts.Chest.Health.Current).equals(maxHealth);

            // Has removed Heavy bleed effect from chest
            expect(result.profileChanges[sessionId].health.BodyParts.Chest).not.toHaveProperty("Effects");
        });

        it("Should Heal Players heavy bleed and leave limb health at existing value", () => {
            const maxHealth = 100;
            const pmcData = {
                Health: {
                    BodyParts: {
                        Chest: {
                            Health: {
                                Current: 50, // Has damage
                                Maximum: maxHealth,
                            },
                            Effects: { HeavyBleeding: { Time: 20 } },
                        },
                    },
                },
            };
            const limbOnlyHealRequest = {
                Action: "RestoreHealth",
                trader: "54cb57776803fa99248b456e", // Therapist
                difference: {
                    BodyParts: {
                        Chest: {
                            Health: 23, // > 0 value means it will heal limb to full
                            Effects: null, // null means no healing of effects
                        },
                    },
                },
            };
            const sessionId = "12345";

            // Mock output generation
            vi.spyOn((healthController as any).eventOutputHolder, "getOutput").mockReturnValue({
                warnings: {},
                profileChanges: { 12345: { health: {} } },
            });

            // Mock payment
            vi.spyOn((healthController as any).paymentService, "payMoney").mockReturnValue({
                warnings: {},
                profileChanges: { 12345: { health: {} } },
            });

            const result = healthController.healthTreatment(
                pmcData as unknown as IPmcData,
                limbOnlyHealRequest as IHealthTreatmentRequestData,
                sessionId,
            );

            // Has healed chest to full
            expect(result.profileChanges[sessionId].health.BodyParts.Chest.Health.Current).equals(maxHealth);

            // Has not removed Heavy bleed effect from chest
            expect(result.profileChanges[sessionId].health.BodyParts.Chest).toHaveProperty("Effects");
        });

        it("Should Heal Players heavy bleed and leave limb health at existing value", () => {
            const maxHealth = 100;
            const currentHealth = 50;
            const pmcData = {
                Health: {
                    BodyParts: {
                        Chest: {
                            Health: {
                                Current: currentHealth, // Has damage
                                Maximum: maxHealth,
                            },
                            Effects: { HeavyBleeding: { Time: 20 } },
                        },
                    },
                },
            };
            const limbOnlyHealRequest = {
                Action: "RestoreHealth",
                trader: "54cb57776803fa99248b456e", // Therapist
                difference: {
                    BodyParts: {
                        Chest: {
                            Health: 0, // 0 value means it will not heal and damage
                            Effects: null, // null means no healing of effects
                        },
                    },
                },
            };
            const sessionId = "12345";

            // Mock output generation
            vi.spyOn((healthController as any).eventOutputHolder, "getOutput").mockReturnValue({
                warnings: {},
                profileChanges: { 12345: { health: {} } },
            });

            // Mock payment
            vi.spyOn((healthController as any).paymentService, "payMoney").mockReturnValue({
                warnings: {},
                profileChanges: { 12345: { health: {} } },
            });

            const result = healthController.healthTreatment(
                pmcData as unknown as IPmcData,
                limbOnlyHealRequest as IHealthTreatmentRequestData,
                sessionId,
            );

            // Has not healed chest to full
            expect(result.profileChanges[sessionId].health.BodyParts.Chest.Health.Current).equals(currentHealth);

            // Has not removed Heavy bleed effect from chest
            expect(result.profileChanges[sessionId].health.BodyParts.Chest).toHaveProperty("Effects");
        });
    });
});
