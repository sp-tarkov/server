import "reflect-metadata";

import { InsuranceController } from "@spt/controllers/InsuranceController";
import { IItem } from "@spt/models/eft/common/tables/IItem";
import { IInsurance } from "@spt/models/eft/profile/ISptProfile";
import { MessageType } from "@spt/models/enums/MessageType";
import { ProfileInsuranceFactory } from "@tests/__factories__/ProfileInsurance.factory";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("InsuranceController", () => {
    let insuranceController: any; // Using "any" to access private/protected methods without type errors.
    let insuranceFixture: IInsurance[];

    beforeEach(() => {
        insuranceController = container.resolve<InsuranceController>("InsuranceController");
        insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().get();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("processReturn", () => {
        it("should process return for all profiles", () => {
            const session1 = "session1";
            const session2 = "session2";
            const profiles = { [session1]: {}, [session2]: {} };
            const getProfilesSpy = vi.spyOn(insuranceController.saveServer, "getProfiles").mockReturnValue(profiles);
            const processReturnByProfileSpy = vi
                .spyOn(insuranceController, "processReturnByProfile")
                .mockReturnValue(vi.fn());

            // Execute the method.
            insuranceController.processReturn();

            // Should make a call to get all of the profiles.
            expect(getProfilesSpy).toHaveBeenCalledTimes(1);

            // Should process each returned profile.
            expect(processReturnByProfileSpy).toHaveBeenCalledTimes(2);
            expect(processReturnByProfileSpy).toHaveBeenCalledWith(session1);
            expect(processReturnByProfileSpy).toHaveBeenCalledWith(session2);
        });

        it("should not attempt to process profiles if no profiles exist", () => {
            const processReturnByProfileSpy = vi
                .spyOn(insuranceController, "processReturnByProfile")
                .mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.processReturn();

            // Should not process any profiles.
            expect(processReturnByProfileSpy).not.toHaveBeenCalled();
        });
    });

    describe("processReturnByProfile", () => {
        it("should process insurance for a profile", () => {
            const sessionId = "session-id";

            // Mock internal methods.
            const mockFilterInsuredItems = vi
                .spyOn(insuranceController, "filterInsuredItems")
                .mockReturnValue(insuranceFixture);
            const mockProcessInsuredItems = vi
                .spyOn(insuranceController, "processInsuredItems")
                .mockImplementation(vi.fn());

            insuranceController.processReturnByProfile(sessionId);

            // Verify that the correct methods were called.
            expect(mockFilterInsuredItems).toBeCalledTimes(1);
            expect(mockProcessInsuredItems).toHaveBeenNthCalledWith(1, insuranceFixture, sessionId);
        });

        it("should skip processing if there are no insurance packages found within the profile", () => {
            const sessionId = "session-id";

            // Mock internal methods.
            const mockFilterInsuredItems = vi.spyOn(insuranceController, "filterInsuredItems").mockReturnValue([]); // Return an empty array.
            const mockProcessInsuredItems = vi
                .spyOn(insuranceController, "processInsuredItems")
                .mockImplementation(vi.fn());

            insuranceController.processReturnByProfile(sessionId);

            // Verify that the correct methods were called.
            expect(mockFilterInsuredItems).toBeCalledTimes(1);
            expect(mockProcessInsuredItems).not.toHaveBeenCalled();
        });
    });

    describe("filterInsuredItems", () => {
        it("should return all insurance packages if no time is specified", () => {
            const sessionID = "session-id";
            const insured = JSON.parse(JSON.stringify(insuranceFixture));

            // Mock getProfile to return the fixture.
            const mockGetProfile = vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue({
                insurance: insured,
            });
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");

            // Execute the method.
            const insuredFiltered = insuranceController.filterInsuredItems(sessionID);

            // Verify that the correct methods were called.
            expect(mockGetProfile).toBeCalledTimes(1);
            expect(mockLoggerDebug).toBeCalledTimes(1);
            expect(insuredFiltered.length).toBe(insuranceFixture.length);
        });

        it("should filter out insurance packages with scheduledTime values in the future", () => {
            const sessionID = "session-id";
            const insured = JSON.parse(JSON.stringify(insuranceFixture));

            // Set the scheduledTime to 2 hours in the future so it should be skipped over.
            insured[0].scheduledTime = Math.floor(Date.now() / 1000 + 2 * 60 * 60);

            // Mock getProfile to return the fixture.
            const mockGetProfile = vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue({
                insurance: insured,
            });
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");

            // Execute the method.
            const insuredFiltered = insuranceController.filterInsuredItems(sessionID);

            // Verify that the correct methods were called.
            expect(mockGetProfile).toBeCalledTimes(1);
            expect(mockLoggerDebug).toBeCalledTimes(1);
            expect(insuredFiltered.length).toBe(insuranceFixture.length - 1); // Should be 1 less than the original fixture.
        });

        it("should return an empty array if no insurance packages match the criteria", () => {
            const sessionID = "session-id";
            const insured = JSON.parse(JSON.stringify(insuranceFixture));

            // Mock getProfile to return the fixture.
            const mockGetProfile = vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue({
                insurance: insured,
            });
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");

            // Execute the method, passing in a time that's two hours in the past. The function should use this past
            // date as the target to judge if an insurance package is ready to be sent or not.
            const insuredFiltered = insuranceController.filterInsuredItems(
                sessionID,
                Math.floor(Date.now() / 1000 - 2 * 60 * 60),
            );

            // Verify that the correct methods were called.
            expect(mockGetProfile).toBeCalledTimes(1);
            expect(mockLoggerDebug).toBeCalledTimes(1);

            // Verify that the returned array is empty.
            expect(insuredFiltered.length).toBe(0);
        });
    });

    describe("processInsuredItems", () => {
        it("should log information about the insurance package", () => {
            const sessionId = "session-id";
            const numberOfItems = 666;

            // Spy on the logger.debug method.
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");
            vi.spyOn(insuranceController, "countAllInsuranceItems").mockReturnValue(numberOfItems);
            vi.spyOn(insuranceController, "findItemsToDelete").mockImplementation(vi.fn());
            vi.spyOn(insuranceController, "removeItemsFromInsurance").mockImplementation(vi.fn());
            vi.spyOn(insuranceController.itemHelper, "adoptOrphanedItems").mockImplementation(vi.fn());
            vi.spyOn(insuranceController, "sendMail").mockImplementation(vi.fn());
            vi.spyOn(insuranceController, "removeInsurancePackageFromProfile").mockImplementation(vi.fn());
            vi.spyOn(insuranceController.insuranceService.saveServer, "getProfile").mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.processInsuredItems(insuranceFixture, sessionId);

            // Verify that the log was written.
            expect(mockLoggerDebug).toBeCalledWith(
                `Processing ${insuranceFixture.length} insurance packages, which includes a total of ${numberOfItems} items, in profile ${sessionId}`,
            );
        });

        it("should call processing methods once per insurance package", () => {
            const sessionId = "session-id";
            const packageCount = insuranceFixture.length;

            // Spy on the processing methods.
            const mockFindItemsToDelete = vi
                .spyOn(insuranceController, "findItemsToDelete")
                .mockImplementation(vi.fn());
            const mockRemoveItemsFromInsurance = vi
                .spyOn(insuranceController, "removeItemsFromInsurance")
                .mockImplementation(vi.fn());
            const mockAdoptOrphanedItems = vi
                .spyOn(insuranceController.itemHelper, "adoptOrphanedItems")
                .mockImplementation(vi.fn());
            const mockSendMail = vi.spyOn(insuranceController, "sendMail").mockImplementation(vi.fn());
            const mockRemoveInsurancePackageFromProfile = vi
                .spyOn(insuranceController, "removeInsurancePackageFromProfile")
                .mockImplementation(vi.fn());

            vi.spyOn(insuranceController.insuranceService.saveServer, "getProfile").mockReturnValue({});

            // Execute the method.
            insuranceController.processInsuredItems(insuranceFixture, sessionId);

            // Verify that the processing methods were called once per insurance package.
            expect(mockFindItemsToDelete).toBeCalledTimes(packageCount);
            expect(mockRemoveItemsFromInsurance).toBeCalledTimes(packageCount);
            expect(mockAdoptOrphanedItems).toBeCalledTimes(packageCount * 2);
            expect(mockSendMail).toBeCalledTimes(packageCount);
            expect(mockRemoveInsurancePackageFromProfile).toBeCalledTimes(packageCount);
        });
    });

    describe("countAllInsuranceItems", () => {
        it("should return the total number of items in all insurance packages", () => {
            const insurance = [
                {
                    _id: "1",
                    upd: 1234567890,
                    items: [
                        { _id: "1", parentId: "1", slotId: "1" },
                        { _id: "2", parentId: "1", slotId: "2" },
                    ],
                },
                {
                    _id: "2",
                    upd: 1234567890,
                    items: [
                        { _id: "3", parentId: "2", slotId: "1" },
                        { _id: "4", parentId: "2", slotId: "2" },
                        {
                            _id: "5",
                            parentId: "2",
                            slotId: "3",
                        },
                    ],
                },
            ];
            const expectedCount = 5; // 2 items in the first package + 3 items in the second package.

            // Execute the method.
            const actualCount = insuranceController.countAllInsuranceItems(insurance);

            // Verify that the result is correct.
            expect(actualCount).toBe(expectedCount);
        });

        it("should return 0 if there are no insurance packages", () => {
            const insurance = [];
            const expectedCount = 0;

            // Execute the method.
            const actualCount = insuranceController.countAllInsuranceItems(insurance);

            // Verify that the result is correct.
            expect(actualCount).toBe(expectedCount);
        });

        it("should return 0 if there are no items in any of the insurance packages", () => {
            const insurance = [
                { _id: "1", upd: 1234567890, items: [] },
                { _id: "2", upd: 1234567890, items: [] },
            ];
            const expectedCount = 0;

            // Execute the method.
            const actualCount = insuranceController.countAllInsuranceItems(insurance);

            // Verify that the result is correct.
            expect(actualCount).toBe(expectedCount);
        });
    });

    describe("removeInsurancePackageFromProfile", () => {
        it("should remove the specified insurance package from the profile", () => {
            const sessionID = "session-id";
            const packageToRemove = {
                traderId: "54cb50c76803fa8b248b4571",
                systemData: { date: "01.11.2023", time: "11:18", location: "factory4_day" },
            };
            const profile = {
                insurance: [
                    {
                        traderId: "54cb50c76803fa8b248b4571",
                        systemData: { date: "01.11.2023", time: "11:18", location: "factory4_day" },
                    },
                    {
                        traderId: "54cb57776803fa99248b456e",
                        systemData: { date: "01.11.2023", time: "10:51", location: "factory4_day" },
                    },
                ],
            };

            // Mock the getProfile method to return the above profile.
            vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue(profile);

            // Execute the method.
            insuranceController.removeInsurancePackageFromProfile(sessionID, packageToRemove);

            // Verify that the specified insurance package was removed.
            expect(profile.insurance.length).toBe(1);
            expect(profile.insurance).toStrictEqual([
                {
                    traderId: "54cb57776803fa99248b456e",
                    systemData: { date: "01.11.2023", time: "10:51", location: "factory4_day" },
                },
            ]);
        });

        it("should log a message indicating that the package was removed", () => {
            const sessionID = "session-id";
            const packageToRemove = {
                traderId: "54cb50c76803fa8b248b4571",
                systemData: { date: "01.11.2023", time: "11:18", location: "factory4_day" },
            };
            const profile = {
                insurance: [
                    {
                        traderId: "54cb50c76803fa8b248b4571",
                        systemData: { date: "01.11.2023", time: "11:18", location: "factory4_day" },
                    },
                ],
            };

            // Mock the getProfile method to return the above profile.
            vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue(profile);

            // Spy on the logger.debug method.
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");

            // Execute the method.
            insuranceController.removeInsurancePackageFromProfile(sessionID, packageToRemove);

            // Verify that the log was written.
            expect(mockLoggerDebug).toBeCalledWith(
                `Removed processed insurance package. Remaining packages: ${profile.insurance.length}`,
            );
        });

        it("should not remove any packages if the specified package is not found", () => {
            const sessionID = "session-id";
            const packageToRemove = {
                traderId: "54cb50c76803fa8b248b4571",
                systemData: { date: "01.11.2023", time: "11:25", location: "factory4_day" },
            };
            const profile = {
                insurance: [
                    {
                        traderId: "54cb50c76803fa8b248b4571",
                        systemData: { date: "01.11.2023", time: "11:18", location: "factory4_day" },
                    },
                    {
                        traderId: "54cb57776803fa99248b456e",
                        systemData: { date: "01.11.2023", time: "10:51", location: "factory4_day" },
                    },
                ],
            };

            // Mock the getProfile method to return the above profile.
            vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue(profile);

            // Execute the method.
            insuranceController.removeInsurancePackageFromProfile(sessionID, packageToRemove);

            // Verify that the specified insurance package was removed.
            expect(profile.insurance.length).toBe(2);
        });
    });

    describe("findItemsToDelete", () => {
        it("should handle an empty insurance package", () => {
            const insurancePackage = insuranceFixture[0];
            insurancePackage.items = [];

            // Execute the method.
            const result = insuranceController.findItemsToDelete(
                insuranceController.hashUtil.generate(),
                insurancePackage,
            );

            // Verify that the result is correct.
            expect(result.size).toBe(0);
        });

        it("should handle regular items", () => {
            // Remove attachment items from the fixture.
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeAttachmentItems().get();
            const insured = insuranceFixture[0];
            const numberOfItems = insured.items.length;

            // Mock helper methods.
            const mockPopulateParentAttachmentsMap = vi.spyOn(insuranceController, "populateParentAttachmentsMap");
            const mockIsAttachmentAttached = vi.spyOn(insuranceController.itemHelper, "isAttachmentAttached");
            const mockProcessAttachments = vi
                .spyOn(insuranceController, "processAttachments")
                .mockImplementation(vi.fn());

            // Add all items to the toDelete set. Not realistic, but it's fine for this test.
            const mockProcessRegularItems = vi.fn((insured, toDelete) => {
                for (const item of insured.items) {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processRegularItems").mockImplementation(mockProcessRegularItems);

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insuranceController.hashUtil.generate(), insured);

            // Verify that the correct methods were called.
            expect(mockPopulateParentAttachmentsMap).toHaveBeenCalledTimes(1);
            expect(mockIsAttachmentAttached).toHaveBeenCalled();
            expect(mockProcessRegularItems).toHaveBeenCalledTimes(1);
            expect(mockProcessAttachments).not.toHaveBeenCalled();

            // Verify that the result is correct.
            expect(result.size).toBe(numberOfItems);
            expect(result).toEqual(new Set(insured.items.map((item) => item._id)));
        });

        it("should ignore orphaned attachments", () => {
            // Remove regular items from the fixture, creating orphaned attachments.
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeRegularItems().get();
            const insured = insuranceFixture[0];

            // Mock helper methods.
            const mockProcessRegularItems = vi.spyOn(insuranceController, "processRegularItems");
            const mockProcessAttachments = vi.spyOn(insuranceController, "processAttachments");

            // Since no parent attachments exist, the map should be empty.
            const mockPopulateParentAttachmentsMap = vi.fn(() => {
                return new Map<string, IItem[]>();
            });
            vi.spyOn(insuranceController, "populateParentAttachmentsMap").mockImplementation(
                mockPopulateParentAttachmentsMap,
            );

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insuranceController.hashUtil.generate(), insured);

            // Verify that the correct methods were called.
            expect(mockPopulateParentAttachmentsMap).toHaveBeenCalled();
            expect(mockProcessRegularItems).not.toHaveBeenCalled();
            expect(mockProcessAttachments).not.toHaveBeenCalled();

            // Verify that the result is correct.
            expect(result.size).toBe(0);
            expect(result).toEqual(new Set());
        });

        it("should handle a mix of regular items and attachments", () => {
            const insured = insuranceFixture[0];
            const numberOfItems = insured.items.length;

            // Mock helper methods.
            const mockPopulateParentAttachmentsMap = vi.spyOn(insuranceController, "populateParentAttachmentsMap");

            // Add all items to the toDelete set. Not realistic, but it's fine for this test.
            const mockProcessRegularItems = vi.fn((insured, toDelete) => {
                for (const item of insured.items) {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processRegularItems").mockImplementation(mockProcessRegularItems);
            const mockProcessAttachments = vi.fn((parentAttachmentsMap, itemsMap, traderId, toDelete) => {
                for (const item of insured.items) {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processAttachments").mockImplementation(mockProcessAttachments);

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insuranceController.hashUtil.generate(), insured);

            // Verify that the correct methods were called.
            expect(mockPopulateParentAttachmentsMap).toHaveBeenCalled();
            expect(mockProcessRegularItems).toHaveBeenCalled();
            expect(mockProcessAttachments).toHaveBeenCalled();

            // Verify that the result is correct.
            expect(result.size).toBe(numberOfItems);
            expect(result).toEqual(new Set(insured.items.map((item) => item._id)));
        });

        it("should return an empty set if no items are to be deleted", () => {
            const insured = insuranceFixture[0];

            // Mock helper methods.
            const mockPopulateParentAttachmentsMap = vi.spyOn(insuranceController, "populateParentAttachmentsMap");

            // Don't add any items to the toDelete set.
            const mockProcessRegularItems = vi
                .spyOn(insuranceController, "processRegularItems")
                .mockImplementation(vi.fn());
            const mockProcessAttachments = vi
                .spyOn(insuranceController, "processAttachments")
                .mockImplementation(vi.fn());

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insuranceController.hashUtil.generate(), insured);

            // Verify that the correct methods were called.
            expect(mockPopulateParentAttachmentsMap).toHaveBeenCalled();
            expect(mockProcessRegularItems).toHaveBeenCalled();
            expect(mockProcessAttachments).toHaveBeenCalled();

            // Verify that the result is correct.
            expect(result.size).toBe(0);
            expect(result).toEqual(new Set());
        });

        it("should log the number of items to be deleted", () => {
            const insured = insuranceFixture[0];
            const numberOfItems = insured.items.length;

            // Mock helper methods.
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");

            // Add all items to the toDelete set. Not realistic, but it's fine for this test.
            const mockProcessRegularItems = vi.fn((insured, toDelete) => {
                for (const item of insured.items) {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processRegularItems").mockImplementation(mockProcessRegularItems);
            const mockProcessAttachments = vi.fn((parentAttachmentsMap, itemsMap, traderId, toDelete) => {
                for (const item of insured.items) {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processAttachments").mockImplementation(mockProcessAttachments);

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insuranceController.hashUtil.generate(), insured);

            // Verify that the result is the correct size, and the size is logged.
            expect(result.size).toBe(numberOfItems);
            expect(mockLoggerDebug).toBeCalledWith(`Marked ${numberOfItems} items for deletion from insurance.`);
        });
    });

    describe("populateParentAttachmentsMap", () => {
        it("should correctly map gun to all of its attachments", () => {
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);

            // Execute the method.
            const result = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Verify that the map is populated correctly.
            expect(result.size).toBe(9); // There are 9 base-level items in this insurance package.

            const gun = result.get("35111c9b72a87b6b7d95ad35");
            expect(gun.length).toBe(31); // This gun has 31 attachments.

            // The attachments should be mapped to the gun properly...
            const validAttachmentTemplates = [
                "7c42d3dce0ddbc4806bce48b",
                "10b97872c5f4e0e1949a0369",
                "a6cd9986dde4cabddcd2dce2",
                "b65635b515712f990fdcc201",
                "0e11045873efe3625695c1ae",
                "94c4161abe8bf654fb986063",
                "9b284ccfd0d535acec1ff58b",
                "d730caa83a11fd01250a7261",
                "24291c7bcf91e362adb6d68b",
                "0d98fd0769cce8e473bbe540",
                "11b174510f039e8217fbd202",
                "c435230e530574b1d7c32300",
                "15666fe6fd2d95206612e418",
                "a54de8b9014eee71fdf1d01d",
                "c34555bc95a9a7a23150a36f",
                "91cae4ae30d1366b87158238",
                "48f23df4509164cf397b9ab5",
                "a55f05f689978ac65c7da654",
                "8ae4ea81a2d6074162d87a9c",
                "312cc0f6687963305457235e",
                "e1e5aaf474b7282a52ac9a14",
                "bb9a34648e08f005db5d7484",
                "dd9ac99d3ea4c9656221bcc9",
                "b22748de8da5f3c1362dd8e0",
                "e3cc1be8954c4889f94b435a",
                "e73f05be5a306168e847da82",
                "847cf35ec92d8af8e4814ea8",
                "bb4b7a4475fea0f0135305f6",
                "d0ac8e688a0bb17668589909",
                "5dbcf8cbbb3f8ef669836320",
                "f996645c809968f8033593a6",
            ];
            for (const value of validAttachmentTemplates) {
                // Verify that each template is present in the array of attachments.
                expect(gun.some((item) => item._id === value)).toBe(true);
            }
        });

        it("should correctly map helmet to all of its attachments", () => {
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);

            // Execute the method.
            const result = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Verify that the map is populated correctly.
            expect(result.size).toBe(9); // There are 9 base-level items in this insurance package.

            const helmet = result.get("b2405216e5730f3511884a10");
            expect(helmet.length).toBe(4); // This helmet has 2 valid attachments.

            // The attachments should be mapped to the helmet properly...
            const validAttachmentTemplates = [
                "7a0675280dbbad69ce592d74",
                "c0c182942f54d3c183f0e179",
                "f7066fdfeefb29eca1d2dbeb",
                "ee0ec86e9608abe773175e3a",
            ];
            for (const value of validAttachmentTemplates) {
                // Verify that each template is present in the array of attachments.
                expect(helmet.some((item) => item._id === value)).toBe(true);
            }
        });

        it("should correctly map gun to all of its attachments when gun is within a container", () => {
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);

            // Execute the method.
            const result = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Verify that the map is populated correctly.
            expect(result.size).toBe(9); // There are 9 base-level items in this insurance package.

            const gun = result.get("26598f88d49198c4a0a9391c");
            expect(insured.items.find((item) => item._id === "26598f88d49198c4a0a9391c").slotId).toBe("main");
            expect(gun.length).toBe(3);
        });

        it("should not map items that do not have a main-parent", () => {
            // Remove regular items from the fixture.
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeRegularItems().get();
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);

            // Suppress warnings.
            const mockLoggerWarning = vi.spyOn(insuranceController.logger, "warning").mockImplementation(vi.fn());

            // Execute the method.
            const result = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Verify that the map is populated correctly.
            expect(result.size).toBe(0);
        });

        it("should log a warning when an item does not have a main-parent", () => {
            // Remove regular items from the fixture.
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeRegularItems().get();
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);

            // Suppress warnings.
            const mockLoggerWarning = vi.spyOn(insuranceController.logger, "warning").mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Verify that the warning was logged.
            expect(mockLoggerWarning).toHaveBeenCalled();
        });
    });

    describe("removeNonModdableAttachments", () => {
        it("should return a Map where each parent item ID is mapped to only moddable attachments", () => {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Execute the method.
            const result = insuranceController.removeNonModdableAttachments(parentAttachmentsMap, itemsMap);

            // Verify that the map is populated correctly.
            for (const [parentId, attachments] of result) {
                for (const attachment of attachments) {
                    // Verify that each attachment is moddable.
                    const attachmentParentItem = itemsMap.get(parentId);
                    expect(insuranceController.itemHelper.isRaidModdable(attachment, attachmentParentItem)).toBe(true);
                }
            }
        });

        it("should remove parents that do not have any moddable attachments", () => {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Mock isRaidModdable to return false for all attachments.
            vi.spyOn(insuranceController.itemHelper, "isRaidModdable").mockReturnValue(false);

            // Execute the method.
            const result = insuranceController.removeNonModdableAttachments(parentAttachmentsMap, itemsMap);

            // Verify that the map is now empty.
            expect(result.size).toBe(0);
        });
    });

    describe("processRegularItems", () => {
        it("should process regular items and their non-attachment children", () => {
            // Remove attachment items from the fixture.
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeAttachmentItems().get();

            const insured = insuranceFixture[0];
            const numberOfItems = insured.items.length;
            const toDelete = new Set<string>();
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Mock helper methods.
            const mockIsAttachmentAttached = vi.spyOn(insuranceController.itemHelper, "isAttachmentAttached");
            const mockFindAndReturnChildrenAsItems = vi.spyOn(
                insuranceController.itemHelper,
                "findAndReturnChildrenAsItems",
            );

            // Mock rollForDelete to return true for all items. Not realistic, but it's fine for this test.
            const mockRollForDelete = vi.spyOn(insuranceController, "rollForDelete").mockReturnValue(true);

            // Execute the method.
            insuranceController.processRegularItems(insured, toDelete, parentAttachmentsMap);

            // Verify that the correct methods were called.
            expect(mockIsAttachmentAttached).toHaveBeenCalledTimes(numberOfItems);
            expect(mockFindAndReturnChildrenAsItems).not.toHaveBeenCalled();
            expect(mockRollForDelete).toHaveBeenCalledTimes(numberOfItems);

            // Verify that all items were added to the toDelete set.
            expect(toDelete).toEqual(new Set(insured.items.map((item) => item._id)));
        });

        it("should not roll attached attachments", () => {
            const insured = insuranceFixture[0];
            const toDelete = new Set<string>();
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Mock isAttachmentAttached to return true for all items.
            vi.spyOn(insuranceController.itemHelper, "isAttachmentAttached").mockReturnValue(true);

            // Mock rollForDelete to return true for all items.
            const mockRollForDelete = vi.spyOn(insuranceController, "rollForDelete").mockReturnValue(true);

            // Execute the method.
            insuranceController.processRegularItems(insured, toDelete, parentAttachmentsMap);

            // Verify that a roll was not made for any items.
            expect(mockRollForDelete).not.toHaveBeenCalled();

            // Verify that no items were added to the toDelete set.
            expect(toDelete).toEqual(new Set());
        });

        it("should mark attachments for deletion when parent is marked for deletion", () => {
            const insured = insuranceFixture[0];
            const toDelete = new Set<string>();
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Mock rollForDelete to return true for all base-parent items.
            const mockRollForDelete = vi.fn((traderId, insuredItem) => {
                return !insuranceController.itemHelper.isAttachmentAttached(insuredItem);
            });
            vi.spyOn(insuranceController, "rollForDelete").mockImplementation(mockRollForDelete);

            // Execute the method.
            insuranceController.processRegularItems(insured, toDelete, parentAttachmentsMap);

            // Verify that all items were added to the toDelete set.
            expect(toDelete).toEqual(new Set(insured.items.map((item) => item._id)));
        });
    });

    describe("processAttachments", () => {
        it("should iterate over each parent item", () => {
            const insured = insuranceFixture[0];
            const toDelete = new Set<string>();
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Mock helper methods.
            const mockProcessAttachmentByParent = vi.spyOn(insuranceController, "processAttachmentByParent");

            // Execute the method.
            insuranceController.processAttachments(parentAttachmentsMap, itemsMap, insured.traderId, toDelete);

            // Verify
            expect(mockProcessAttachmentByParent).toHaveBeenCalledTimes(parentAttachmentsMap.size);
        });

        it("should log the name of each parent item", () => {
            const insured = insuranceFixture[0];
            const toDelete = new Set<string>();
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );

            // Mock helper methods.
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug").mockImplementation(vi.fn());

            // Mock processAttachmentByParent to prevent it from being called.
            vi.spyOn(insuranceController, "processAttachmentByParent").mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.processAttachments(parentAttachmentsMap, itemsMap, insured.traderId, toDelete);

            // Verify that the name of each parent item is logged.
            for (const [parentId] of parentAttachmentsMap) {
                const parentItem = itemsMap.get(parentId);
                if (parentItem) {
                    const expectedMessage = `Processing attachments of parent "${insuranceController.itemHelper.getItemName(
                        parentItem._tpl,
                    )}":`;
                    expect(mockLoggerDebug).toHaveBeenCalledWith(expectedMessage);
                }
            }
        });
    });

    describe("processAttachmentByParent", () => {
        it("should handle weighing and counting of attachments by calling helper methods", () => {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );
            const attachments = parentAttachmentsMap.entries().next().value;
            const toDelete = new Set<string>();

            // Mock helper methods.
            const weightAttachmentsByPrice = vi.spyOn(insuranceController, "weightAttachmentsByPrice");
            const getAttachmentCountToRemove = vi
                .spyOn(insuranceController, "getAttachmentCountToRemove")
                .mockReturnValue(4);
            const logAttachmentsBeingRemoved = vi.spyOn(insuranceController, "logAttachmentsBeingRemoved");

            // Execute the method.
            insuranceController.processAttachmentByParent(attachments, insured.traderId, toDelete);

            // Verify that helper methods are called.
            expect(weightAttachmentsByPrice).toHaveBeenCalledWith(attachments);
            expect(getAttachmentCountToRemove).toHaveBeenCalled();
            expect(logAttachmentsBeingRemoved).toHaveBeenCalled();
        });
    });

    describe("getAttachmentCountToRemove", () => {
        it("should handle returning a count of attachments that should be removed that is below the total attachment count", () => {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );
            const attachments = parentAttachmentsMap.entries().next().value;
            const attachmentCount = attachments.length;

            const result = insuranceController.getAttachmentCountToRemove(attachments, insured.traderId);

            expect(result).lessThanOrEqual(attachmentCount);
        });

        it("should handle returning 0 when chanceNoAttachmentsTakenPercent is 100%", () => {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );
            const attachments = parentAttachmentsMap.entries().next().value;
            insuranceController.insuranceConfig.chanceNoAttachmentsTakenPercent = 100;

            const result = insuranceController.getAttachmentCountToRemove(attachments, insured.traderId);

            expect(result).toBe(0);
        });

        it("should handle returning 0 when all attachments are below configured threshold price", () => {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );
            const attachments = parentAttachmentsMap.values().next().value;
            insuranceController.insuranceConfig.minAttachmentRoublePriceToBeTaken = 2;
            vi.spyOn(insuranceController.ragfairPriceService, "getDynamicItemPrice").mockReturnValue(1);

            const weightedAttachments = insuranceController.weightAttachmentsByPrice(attachments);
            const result = insuranceController.getAttachmentCountToRemove(weightedAttachments, insured.traderId);

            expect(result).toBe(0);
        });
    });

    describe("weightAttachmentsByPrice", () => {
        it("Should create a dictionary of 2 items with weights of 1 for each", () => {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.itemHelper.generateItemsMap(insured.items);
            const parentAttachmentsMap = insuranceController.populateParentAttachmentsMap(
                insuranceController.hashUtil.generate(),
                insured,
                itemsMap,
            );
            const attachments = parentAttachmentsMap.values().next().value;

            vi.spyOn(insuranceController.ragfairPriceService, "getDynamicItemPrice").mockReturnValue(1);

            const result = insuranceController.weightAttachmentsByPrice(attachments);
            expect(Object.keys(result).length).toBe(2);
            expect(Object.values(result)).toStrictEqual([1, 1]);
        });
    });

    describe("removeItemsFromInsurance", () => {
        it("should remove items from insurance based on the toDelete set", () => {
            const insured = insuranceFixture[0];

            const toDelete = new Set<string>();
            const numberToDelete = 2;
            for (let i = 0; i < numberToDelete; i++) {
                toDelete.add(insured.items[i]._id);
            }

            // Execute the method.
            insuranceController.removeItemsFromInsurance(insured, toDelete);

            // Ensure that the items in the toDelete set are not present in the insured items array.
            for (const toDeleteId of toDelete) {
                expect(insured.items.some((item) => item._id === toDeleteId)).toBe(false);
            }
        });

        it("should not remove any items if toDelete set is empty", () => {
            const insured = insuranceFixture[0];
            const originalCount = insured.items.length;
            const toDelete = new Set<string>();

            // Execute the method.
            insuranceController.removeItemsFromInsurance(insured, toDelete);

            // Ensure that no items were removed.
            expect(insured.items.length).toBe(originalCount);
        });

        it("should leave the insurance items empty if all are to be deleted", () => {
            const insured = insuranceFixture[0];
            const originalCount = insured.items.length;
            const toDelete = new Set<string>();
            for (const item of insured.items) {
                toDelete.add(item._id);
            }

            // All of the items should be added to the toDelete set.
            expect(originalCount).toBe(toDelete.size);

            // Execute the method.
            insuranceController.removeItemsFromInsurance(insured, toDelete);

            // Ensure that all items were removed.
            expect(insured.items.length).toBe(0);
        });
    });

    describe("sendMail", () => {
        it("should send insurance failed message when no items are present", () => {
            const insurance = insuranceFixture[0];
            insurance.items = []; // Empty the items array
            const sessionID = "session-id";
            const insuranceFailedTpl = "failed-message-template";

            // Mock the randomUtil to return a static failed template string.
            const mockGetArrayValue = vi
                .spyOn(insuranceController.randomUtil, "getArrayValue")
                .mockReturnValue(insuranceFailedTpl);

            // Don't actually send the message.
            const sendMessageSpy = vi
                .spyOn(insuranceController.mailSendService, "sendLocalisedNpcMessageToPlayer")
                .mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.sendMail(sessionID, insurance);

            // Verify that the randomUtil.getArrayValue method was called.
            expect(mockGetArrayValue).toBeCalled();

            // Verify that the insurance failed message was sent.
            expect(sendMessageSpy).toHaveBeenCalledWith(
                sessionID,
                insuranceController.traderHelper.getTraderById(insurance.traderId),
                MessageType.INSURANCE_RETURN,
                insuranceFailedTpl,
                insurance.items,
                insurance.maxStorageTime,
                insurance.systemData,
            );
        });

        it("should not send insurance failed message when items are present", () => {
            const insurance = insuranceFixture[0];
            const sessionID = "session-id";
            const insuranceFailedTpl = "failed-message-template";

            // Mock the randomUtil to return a static failed template string.
            const mockGetArrayValue = vi
                .spyOn(insuranceController.randomUtil, "getArrayValue")
                .mockReturnValue(insuranceFailedTpl);

            // Don't actually send the message.
            const sendMessageSpy = vi
                .spyOn(insuranceController.mailSendService, "sendLocalisedNpcMessageToPlayer")
                .mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.sendMail(sessionID, insurance);

            // Verify that the randomUtil.getArrayValue method was not called.
            expect(mockGetArrayValue).not.toBeCalled();

            // Verify that the insurance failed message was not sent.
            expect(sendMessageSpy).toHaveBeenCalledWith(
                sessionID,
                insuranceController.traderHelper.getTraderById(insurance.traderId),
                MessageType.INSURANCE_RETURN,
                insurance.messageTemplateId,
                insurance.items,
                insurance.maxStorageTime,
                insurance.systemData,
            );
        });
    });

    describe("rollForDelete", () => {
        it("should return true when random roll is equal to trader return chance", () => {
            vi.spyOn(insuranceController.randomUtil, "getInt").mockReturnValue(8500); // Our "random" roll.
            const traderId = "54cb57776803fa99248b456e"; // Therapist (85% return chance)
            insuranceController.insuranceConfig = {
                returnChancePercent: {
                    [traderId]: 85, // Force 85% return chance
                },
            };

            // Execute the method.
            const result = insuranceController.rollForDelete(traderId);

            // Verify that the result is true.
            expect(result).toBe(true);
        });

        it("should return true when random roll is greater than trader return chance", () => {
            vi.spyOn(insuranceController.randomUtil, "getInt").mockReturnValue(8501); // Our "random" roll.
            const traderId = "54cb57776803fa99248b456e"; // Therapist (85% return chance)
            insuranceController.insuranceConfig = {
                returnChancePercent: {
                    [traderId]: 85, // Force 85% return chance
                },
            };

            // Execute the method.
            const result = insuranceController.rollForDelete(traderId);

            // Verify that the result is true.
            expect(result).toBe(true);
        });

        it("should return false when random roll is less than trader return chance", () => {
            vi.spyOn(insuranceController.randomUtil, "getInt").mockReturnValue(8499); // Our "random" roll.
            const traderId = "54cb57776803fa99248b456e"; // Therapist (85% return chance)
            insuranceController.insuranceConfig = {
                returnChancePercent: {
                    [traderId]: 85, // Force 85% return chance
                },
            };

            // Execute the method.
            const result = insuranceController.rollForDelete(traderId);

            // Verify that the result is false.
            expect(result).toBe(false);
        });

        it("should log error if trader can not be found", () => {
            const traderId = "invalid-trader-id";

            const loggerErrorSpy = vi.spyOn(insuranceController.logger, "error");

            // Execute the method.
            insuranceController.rollForDelete(traderId);

            // Verify that the logger.error method was called.
            expect(loggerErrorSpy).toHaveBeenCalled();
        });

        it("should return null if trader can not be found", () => {
            const traderId = "invalid-trader-id";

            // Execute the method.
            const result = insuranceController.rollForDelete(traderId);

            // Verify that the result is null.
            expect(result).toBe(undefined);
        });
    });

    describe("insure", () => {
        let pmcData: any;
        let body: any;
        let sessionId: string;
        let insuranceController: any;
        let mockGetRoublePriceToInsureItemWithTrader: any;
        let mockPayMoney: any;
        let mockGetOutput: any;

        beforeEach(() => {
            insuranceController = container.resolve<InsuranceController>("InsuranceController");

            // Setup shared test data.
            pmcData = {
                Inventory: {
                    items: [
                        { _id: "item1", otherProps: "value1" },
                        { _id: "item2", otherProps: "value2" },
                    ],
                },
                InsuredItems: [],
            };
            body = { items: ["item1", "item2"], tid: "someTraderId" };
            sessionId = "session-id";

            // Setup shared mocks.
            mockGetRoublePriceToInsureItemWithTrader = vi
                .spyOn(insuranceController.insuranceService, "getRoublePriceToInsureItemWithTrader")
                .mockReturnValue(100);
            mockPayMoney = vi.spyOn(insuranceController.paymentService, "payMoney").mockReturnValue({
                warnings: [],
                otherProperty: "property-value",
            });
            mockGetOutput = vi.spyOn(insuranceController.eventOutputHolder, "getOutput").mockReturnValue({
                warnings: [],
                otherProperty: "property-value",
            });
        });

        it("should create a hash of inventory items by ID", () => {
            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Since the inventoryItemsHash is internal to the function, we cannot check it directly. However, we can
            // infer its correctness by ensuring the payMoney function is called with the right "scheme_items" property.
            expect(mockPayMoney).toHaveBeenCalledWith(
                pmcData,
                {
                    scheme_items: [
                        { id: "5449016a4bdc2d6f028b456f", count: 100 },
                        {
                            id: "5449016a4bdc2d6f028b456f",
                            count: 100,
                        },
                    ],
                    tid: "someTraderId",
                    Action: "SptInsure",
                    type: "",
                    item_id: "",
                    count: 0,
                    scheme_id: 0,
                },
                sessionId,
                { warnings: [], otherProperty: "property-value" },
            );
        });

        it("should calculate the insurance premium for each item to insure", () => {
            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Verify that getRoublePriceToInsureItemWithTrader is called with each item from the pmcData.Inventory.items array.
            for (const item of pmcData.Inventory.items) {
                expect(mockGetRoublePriceToInsureItemWithTrader).toHaveBeenCalledWith(pmcData, item, body.tid);
            }

            // Verify that getRoublePriceToInsureItemWithTrader was called the correct number of times.
            expect(mockGetRoublePriceToInsureItemWithTrader).toHaveBeenCalledTimes(body.items.length);
        });

        it("should call the payment service with the correct parameters", () => {
            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Define the expected payment options structure based on the setup data.
            const expectedPaymentOptions = {
                scheme_items: [
                    { id: "5449016a4bdc2d6f028b456f", count: 100 },
                    {
                        id: "5449016a4bdc2d6f028b456f",
                        count: 100,
                    },
                ],
                tid: body.tid,
                Action: "SptInsure",
                type: "",
                item_id: "",
                count: 0,
                scheme_id: 0,
            };

            // Verify that the paymentService's payMoney method was called once with the expected parameters.
            expect(mockPayMoney).toHaveBeenCalledWith(pmcData, expectedPaymentOptions, sessionId, expect.any(Object));

            // Verify that the output passed to payMoney is the one obtained from getOutput.
            expect(mockPayMoney).toHaveBeenCalledWith(
                pmcData,
                expectedPaymentOptions,
                sessionId,
                mockGetOutput.mock.results[0].value,
            );
        });

        it("should add items to InsuredItems after successful payment", () => {
            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Verify that the InsuredItems array has been populated with the correct items.
            const insuredItemIds = pmcData.InsuredItems.map((insuredItem) => insuredItem.itemId);
            expect(insuredItemIds).toContain("item1");
            expect(insuredItemIds).toContain("item2");

            // Verify that the number of InsuredItems matches the number of items intended to be insured.
            expect(pmcData.InsuredItems.length).toBe(body.items.length);
        });

        it("should update output with warnings if payment fails", () => {
            // Override the payMoney mock to simulate a payment failure with a warning.
            const expectedPayMoneyReturn = {
                warnings: [{ index: 0, errmsg: "You broke.", code: 500 }],
                otherProperty: "property-value",
            };
            mockPayMoney.mockImplementation((pmcData, request, sessionID, output) => {
                output.warnings = expectedPayMoneyReturn.warnings;
            });

            // Execute the method.
            const response = insuranceController.insure(pmcData, body, sessionId);

            // Verify that the response contains the warnings from the payment failure
            expect(response.warnings).toStrictEqual(expectedPayMoneyReturn.warnings);

            // Verify that other properties from the response are still present.
            expect(response).toHaveProperty("otherProperty", "property-value");
        });

        it("should not add items to InsuredItems if payment fails", () => {
            // Override the payMoney mock to simulate a payment failure with a warning.
            const expectedPayMoneyReturn = {
                warnings: [{ index: 0, errmsg: "You broke.", code: 500 }],
                otherProperty: "property-value",
            };
            mockPayMoney.mockImplementation((pmcData, request, sessionID, output) => {
                output.warnings = expectedPayMoneyReturn.warnings;
            });

            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Verify that the InsuredItems array has not been populated.
            expect(pmcData.InsuredItems).toHaveLength(0);
        });
    });

    describe("cost", () => {
        let sessionId: string;

        beforeEach(() => {
            insuranceController = container.resolve<InsuranceController>("InsuranceController");

            sessionId = "session-id";

            vi.spyOn(insuranceController.profileHelper, "getPmcProfile").mockReturnValue({
                Inventory: {
                    items: [
                        { _id: "itemId1", _tpl: "itemTpl1", otherProperty: "property-value1" },
                        {
                            _id: "itemId2",
                            _tpl: "itemTpl2",
                            otherProperty: "property-value2",
                        },
                        { _id: "itemId3", _tpl: "itemTpl3", otherProperty: "property-value3" },
                    ],
                },
            });
        });

        it("should return an empty object if no traders and items are specified", () => {
            const request = { traders: [], items: [] };
            const expected = {};

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });

        it("should return an empty object if no items are specified", () => {
            const request = { traders: ["prapor"], items: [] };
            const expected = { prapor: {} };

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });

        it("should return an empty object if no trader is specified but items are", () => {
            const request = { traders: [], items: ["itemId1", "itemId2"] };
            const expected = {};

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });

        it("should return the expected cost for each item and trader", () => {
            const request = { traders: ["prapor", "therapist"], items: ["itemId1", "itemId2", "itemId3"] };
            const expected = {
                prapor: { itemTpl1: 100, itemTpl2: 200, itemTpl3: 300 },
                therapist: { itemTpl1: 150, itemTpl2: 250, itemTpl3: 350 },
            };

            // Mock the InsuranceService.getRoublePriceToInsureItemWithTrader method to return the expected values.
            vi.spyOn(insuranceController.insuranceService, "getRoublePriceToInsureItemWithTrader")
                .mockReturnValueOnce(100)
                .mockReturnValueOnce(200)
                .mockReturnValueOnce(300)
                .mockReturnValueOnce(150)
                .mockReturnValueOnce(250)
                .mockReturnValueOnce(350);

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });

        it("should skip items that are not in the player's inventory", () => {
            const request = {
                traders: ["prapor"],
                items: [
                    "itemId1",
                    "itemId2",
                    "itemId4", // Doesn't exist in the player's inventory.
                ],
            };
            const expected = { prapor: { itemTpl1: 100, itemTpl2: 200 } };

            // Mock the InsuranceService.getRoublePriceToInsureItemWithTrader method to return the expected values.
            vi.spyOn(insuranceController.insuranceService, "getRoublePriceToInsureItemWithTrader")
                .mockReturnValueOnce(100)
                .mockReturnValueOnce(200);

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });
    });
});
