/* eslint-disable @typescript-eslint/naming-convention */
import "reflect-metadata";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InsuranceController } from "@spt-aki/controllers/InsuranceController";
import { ProfileInsuranceFactory } from "@tests/__factories__/ProfileInsurance.factory";

import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { Insurance } from "@spt-aki/models/eft/profile/IAkiProfile";
import { MessageType } from "@spt-aki/models/enums/MessageType";

describe("InsuranceController", () =>
{
    let insuranceController: any; // Using "any" to access private/protected methods without type errors.
    let insuranceFixture: Insurance[];

    beforeEach(() =>
    {
        insuranceController = container.resolve<InsuranceController>("InsuranceController");
        insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().get();
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
    });

    describe("processReturn", () =>
    {
        it("should process return for all profiles", () =>
        {
            const session1 = "session1";
            const session2 = "session2";
            const profiles = { [session1]: {}, [session2]: {} };
            const getProfilesSpy = vi.spyOn(insuranceController.saveServer, "getProfiles").mockReturnValue(profiles);
            const processReturnByProfileSpy = vi.spyOn(insuranceController, "processReturnByProfile").mockReturnValue(
                vi.fn(),
            );

            // Execute the method.
            insuranceController.processReturn();

            // Should make a call to get all of the profiles.
            expect(getProfilesSpy).toHaveBeenCalledTimes(1);

            // Should process each returned profile.
            expect(processReturnByProfileSpy).toHaveBeenCalledTimes(2);
            expect(processReturnByProfileSpy).toHaveBeenCalledWith(session1);
            expect(processReturnByProfileSpy).toHaveBeenCalledWith(session2);
        });

        it("should not attempt to process profiles if no profiles exist", () =>
        {
            const processReturnByProfileSpy = vi.spyOn(insuranceController, "processReturnByProfile")
                .mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.processReturn();

            // Should not process any profiles.
            expect(processReturnByProfileSpy).not.toHaveBeenCalled();
        });
    });

    describe("processReturnByProfile", () =>
    {
        it("should process insurance for a profile", () =>
        {
            const sessionId = "session-id";

            // Mock internal methods.
            const mockFilterInsuredItems = vi.spyOn(insuranceController, "filterInsuredItems").mockReturnValue(
                insuranceFixture,
            );
            const mockProcessInsuredItems = vi.spyOn(insuranceController, "processInsuredItems").mockImplementation(
                vi.fn(),
            );

            insuranceController.processReturnByProfile(sessionId);

            // Verify that the correct methods were called.
            expect(mockFilterInsuredItems).toBeCalledTimes(1);
            expect(mockProcessInsuredItems).toHaveBeenNthCalledWith(1, insuranceFixture, sessionId);
        });

        it("should skip processing if there are no insurance packages found within the profile", () =>
        {
            const sessionId = "session-id";

            // Mock internal methods.
            const mockFilterInsuredItems = vi.spyOn(insuranceController, "filterInsuredItems").mockReturnValue([]); // Return an empty array.
            const mockProcessInsuredItems = vi.spyOn(insuranceController, "processInsuredItems").mockImplementation(
                vi.fn(),
            );

            insuranceController.processReturnByProfile(sessionId);

            // Verify that the correct methods were called.
            expect(mockFilterInsuredItems).toBeCalledTimes(1);
            expect(mockProcessInsuredItems).not.toHaveBeenCalled();
        });
    });

    describe("filterInsuredItems", () =>
    {
        it("should return all insurance packages if no time is specified", () =>
        {
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
            expect(mockLoggerDebug).toBeCalledWith(
                `Found ${insuranceFixture.length} insurance packages in profile ${sessionID}`,
            );
            expect(insuredFiltered.length).toBe(insuranceFixture.length);
        });

        it("should filter out insurance packages with scheduledTime values in the future", () =>
        {
            const sessionID = "session-id";
            const insured = JSON.parse(JSON.stringify(insuranceFixture));

            // Set the scheduledTime to 2 hours in the future so it should be skipped over.
            insured[0].scheduledTime = Math.floor((Date.now() / 1000) + (2 * 60 * 60));

            // Mock getProfile to return the fixture.
            const mockGetProfile = vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue({
                insurance: insured,
            });
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");

            // Execute the method.
            const insuredFiltered = insuranceController.filterInsuredItems(sessionID);

            // Verify that the correct methods were called.
            expect(mockGetProfile).toBeCalledTimes(1);
            expect(mockLoggerDebug).toBeCalledWith(
                `Found ${insuranceFixture.length} insurance packages in profile ${sessionID}`,
            );
            expect(insuredFiltered.length).toBe(insuranceFixture.length - 1); // Should be 1 less than the original fixture.
        });

        it("should return an empty array if no insurance packages match the criteria", () =>
        {
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
                Math.floor((Date.now() / 1000) - (2 * 60 * 60)),
            );

            // Verify that the correct methods were called.
            expect(mockGetProfile).toBeCalledTimes(1);
            expect(mockLoggerDebug).toBeCalledWith(
                `Found ${insuranceFixture.length} insurance packages in profile ${sessionID}`,
            );

            // Verify that the returned array is empty.
            expect(insuredFiltered.length).toBe(0);
        });
    });

    describe("processInsuredItems", () =>
    {
        it("should log information about the insurance package", () =>
        {
            const sessionId = "session-id";

            // Spy on the logger.debug method.
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");
            vi.spyOn(insuranceController, "findItemsToDelete").mockImplementation(vi.fn());
            vi.spyOn(insuranceController, "removeItemsFromInsurance").mockImplementation(vi.fn());
            vi.spyOn(insuranceController, "adoptOrphanedItems").mockImplementation(vi.fn());
            vi.spyOn(insuranceController, "sendMail").mockImplementation(vi.fn());
            vi.spyOn(insuranceController, "removeInsurancePackageFromProfile").mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.processInsuredItems(insuranceFixture, sessionId);

            // Verify that the log was written.
            expect(mockLoggerDebug).toBeCalledWith(
                `Processing ${insuranceFixture.length} insurance packages, which includes a total of ${
                    insuranceController.countAllInsuranceItems(insuranceFixture)
                } items, in profile ${sessionId}`,
            );
        });

        it("should call processing methods once per insurance package", () =>
        {
            const sessionId = "session-id";
            const packageCount = insuranceFixture.length;

            // Spy on the processing methods.
            const mockFindItemsToDelete = vi.spyOn(insuranceController, "findItemsToDelete").mockImplementation(
                vi.fn(),
            );
            const mockRemoveItemsFromInsurance = vi.spyOn(insuranceController, "removeItemsFromInsurance")
                .mockImplementation(vi.fn());
            const mockAdoptOrphanedItems = vi.spyOn(insuranceController, "adoptOrphanedItems").mockImplementation(
                vi.fn(),
            );
            const mockSendMail = vi.spyOn(insuranceController, "sendMail").mockImplementation(vi.fn());
            const mockRemoveInsurancePackageFromProfile = vi.spyOn(
                insuranceController,
                "removeInsurancePackageFromProfile",
            ).mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.processInsuredItems(insuranceFixture, sessionId);

            // Verify that the processing methods were called once per insurance package.
            expect(mockFindItemsToDelete).toBeCalledTimes(packageCount);
            expect(mockRemoveItemsFromInsurance).toBeCalledTimes(packageCount);
            expect(mockAdoptOrphanedItems).toBeCalledTimes(packageCount);
            expect(mockSendMail).toBeCalledTimes(packageCount);
            expect(mockRemoveInsurancePackageFromProfile).toBeCalledTimes(packageCount);
        });
    });

    describe("countAllInsuranceItems", () =>
    {
        it("should return the total number of items in all insurance packages", () =>
        {
            const insurance = [{
                _id: "1",
                upd: 1234567890,
                items: [{ _id: "1", parentId: "1", slotId: "1" }, { _id: "2", parentId: "1", slotId: "2" }],
            }, {
                _id: "2",
                upd: 1234567890,
                items: [{ _id: "3", parentId: "2", slotId: "1" }, { _id: "4", parentId: "2", slotId: "2" }, {
                    _id: "5",
                    parentId: "2",
                    slotId: "3",
                }],
            }];
            const expectedCount = 5; // 2 items in the first package + 3 items in the second package.

            // Execute the method.
            const actualCount = insuranceController.countAllInsuranceItems(insurance);

            // Verify that the result is correct.
            expect(actualCount).toBe(expectedCount);
        });

        it("should return 0 if there are no insurance packages", () =>
        {
            const insurance = [];
            const expectedCount = 0;

            // Execute the method.
            const actualCount = insuranceController.countAllInsuranceItems(insurance);

            // Verify that the result is correct.
            expect(actualCount).toBe(expectedCount);
        });

        it("should return 0 if there are no items in any of the insurance packages", () =>
        {
            const insurance = [{ _id: "1", upd: 1234567890, items: [] }, { _id: "2", upd: 1234567890, items: [] }];
            const expectedCount = 0;

            // Execute the method.
            const actualCount = insuranceController.countAllInsuranceItems(insurance);

            // Verify that the result is correct.
            expect(actualCount).toBe(expectedCount);
        });
    });

    describe("removeInsurancePackageFromProfile", () =>
    {
        it("should remove the specified insurance package from the profile", () =>
        {
            const sessionID = "session-id";
            const packageToRemove = { date: "01.11.2023", time: "10:51", location: "factory4_day" };
            const profile = {
                insurance: [{
                    messageContent: { systemData: { date: "01.11.2023", time: "11:18", location: "factory4_day" } },
                }, { // This one should be removed
                    messageContent: { systemData: { date: "01.11.2023", time: "10:51", location: "factory4_day" } },
                }],
            };

            // Mock the getProfile method to return the above profile.
            vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue(profile);

            // Execute the method.
            insuranceController.removeInsurancePackageFromProfile(sessionID, packageToRemove);

            // Verify that the specified insurance package was removed.
            expect(profile.insurance.length).toBe(1);
            expect(profile.insurance[0].messageContent.systemData).toStrictEqual({
                date: "01.11.2023",
                time: "11:18",
                location: "factory4_day",
            });
        });

        it("should log a message indicating that the package was removed", () =>
        {
            const sessionID = "session-id";
            const packageToRemove = { date: "01.11.2023", time: "10:51", location: "factory4_day" };
            const profile = {
                insurance: [{
                    messageContent: { systemData: { date: "01.11.2023", time: "10:51", location: "factory4_day" } },
                }],
            };

            // Mock the getProfile method to return the above profile.
            vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue(profile);

            // Spy on the logger.debug method.
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");

            // Execute the method.
            insuranceController.removeInsurancePackageFromProfile(sessionID, packageToRemove);

            // Verify that the log was written.
            expect(mockLoggerDebug).toBeCalledWith(
                `Removed insurance package with date: ${packageToRemove.date}, time: ${packageToRemove.time}, and location: ${packageToRemove.location} from profile ${sessionID}. Remaining packages: ${profile.insurance.length}`,
            );
        });

        it("should not remove any packages if the specified package is not found", () =>
        {
            const sessionID = "session-id";
            const packageToRemove = { date: "01.11.2023", time: "10:51", location: "factory4_day" };
            const profile = {
                insurance: [{
                    messageContent: { systemData: { date: "02.11.2023", time: "10:50", location: "factory4_night" } },
                }],
            };

            // Mock the getProfile method to return the above profile.
            vi.spyOn(insuranceController.saveServer, "getProfile").mockReturnValue(profile);

            // Execute the method.
            insuranceController.removeInsurancePackageFromProfile(sessionID, packageToRemove);

            // Verify that no packages were removed.
            expect(profile.insurance.length).toBe(1);
        });
    });

    describe("findItemsToDelete", () =>
    {
        it("should handle an empty insurance package", () =>
        {
            const insurancePackage = insuranceFixture[0];
            insurancePackage.items = [];

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insurancePackage);

            // Verify that the result is correct.
            expect(result.size).toBe(0);
        });

        it("should handle regular items", () =>
        {
            // Remove attachment items from the fixture.
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeAttachmentItems().get();
            const insured = insuranceFixture[0];
            const numberOfItems = insured.items.length;

            // Mock helper methods.
            const mockPopulateItemsMap = vi.spyOn(insuranceController, "populateItemsMap");
            const mockPopulateParentAttachmentsMap = vi.spyOn(insuranceController, "populateParentAttachmentsMap");
            const mockIsAttachmentAttached = vi.spyOn(insuranceController.itemHelper, "isAttachmentAttached");
            const mockProcessAttachments = vi.spyOn(insuranceController, "processAttachments").mockImplementation(
                vi.fn(),
            );

            // Add all items to the toDelete set. Not realistic, but it's fine for this test.
            const mockProcessRegularItems = vi.fn((insured, toDelete) =>
            {
                for (const item of insured.items)
                {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processRegularItems").mockImplementation(mockProcessRegularItems);

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insured);

            // Verify that the correct methods were called.
            expect(mockPopulateItemsMap).toHaveBeenCalledTimes(1);
            expect(mockPopulateParentAttachmentsMap).toHaveBeenCalledTimes(1);
            expect(mockIsAttachmentAttached).toHaveBeenCalledTimes(numberOfItems + 1); // Once for each item, plus once more
            expect(mockProcessRegularItems).toHaveBeenCalledTimes(1);
            expect(mockProcessAttachments).not.toHaveBeenCalled();

            // Verify that the result is correct.
            expect(result.size).toBe(numberOfItems);
            expect(result).toEqual(new Set(insured.items.map((item) => item._id)));
        });

        it("should ignore orphaned attachments", () =>
        {
            // Remove regular items from the fixture, creating orphaned attachments.
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeRegularItems().get();
            const insured = insuranceFixture[0];

            // Mock helper methods.
            const mockPopulateItemsMap = vi.spyOn(insuranceController, "populateItemsMap");
            const mockProcessRegularItems = vi.spyOn(insuranceController, "processRegularItems");
            const mockProcessAttachments = vi.spyOn(insuranceController, "processAttachments");

            // Since no parent attachments exist, the map should be empty.
            const mockPopulateParentAttachmentsMap = vi.fn(() =>
            {
                return new Map<string, Item[]>();
            });
            vi.spyOn(insuranceController, "populateParentAttachmentsMap").mockImplementation(
                mockPopulateParentAttachmentsMap,
            );

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insured);

            // Verify that the correct methods were called.
            expect(mockPopulateItemsMap).toHaveBeenCalled();
            expect(mockPopulateParentAttachmentsMap).toHaveBeenCalled();
            expect(mockProcessRegularItems).not.toHaveBeenCalled();
            expect(mockProcessAttachments).not.toHaveBeenCalled();

            // Verify that the result is correct.
            expect(result.size).toBe(0);
            expect(result).toEqual(new Set());
        });

        it("should handle a mix of regular items and attachments", () =>
        {
            const insured = insuranceFixture[0];
            const numberOfItems = insured.items.length;

            // Mock helper methods.
            const mockPopulateItemsMap = vi.spyOn(insuranceController, "populateItemsMap");
            const mockPopulateParentAttachmentsMap = vi.spyOn(insuranceController, "populateParentAttachmentsMap");

            // Add all items to the toDelete set. Not realistic, but it's fine for this test.
            const mockProcessRegularItems = vi.fn((insured, toDelete) =>
            {
                for (const item of insured.items)
                {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processRegularItems").mockImplementation(mockProcessRegularItems);
            const mockProcessAttachments = vi.fn((parentAttachmentsMap, itemsMap, traderId, toDelete) =>
            {
                for (const item of insured.items)
                {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processAttachments").mockImplementation(mockProcessAttachments);

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insured);

            // Verify that the correct methods were called.
            expect(mockPopulateItemsMap).toHaveBeenCalled();
            expect(mockPopulateParentAttachmentsMap).toHaveBeenCalled();
            expect(mockProcessRegularItems).toHaveBeenCalled();
            expect(mockProcessAttachments).toHaveBeenCalled();

            // Verify that the result is correct.
            expect(result.size).toBe(numberOfItems);
            expect(result).toEqual(new Set(insured.items.map((item) => item._id)));
        });

        it("should return an empty set if no items are to be deleted", () =>
        {
            const insured = insuranceFixture[0];

            // Mock helper methods.
            const mockPopulateItemsMap = vi.spyOn(insuranceController, "populateItemsMap");
            const mockPopulateParentAttachmentsMap = vi.spyOn(insuranceController, "populateParentAttachmentsMap");

            // Don't add any items to the toDelete set.
            const mockProcessRegularItems = vi.spyOn(insuranceController, "processRegularItems").mockImplementation(
                vi.fn(),
            );
            const mockProcessAttachments = vi.spyOn(insuranceController, "processAttachments").mockImplementation(
                vi.fn(),
            );

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insured);

            // Verify that the correct methods were called.
            expect(mockPopulateItemsMap).toHaveBeenCalled();
            expect(mockPopulateParentAttachmentsMap).toHaveBeenCalled();
            expect(mockProcessRegularItems).toHaveBeenCalled();
            expect(mockProcessAttachments).toHaveBeenCalled();

            // Verify that the result is correct.
            expect(result.size).toBe(0);
            expect(result).toEqual(new Set());
        });

        it("should log the number of items to be deleted", () =>
        {
            const insured = insuranceFixture[0];
            const numberOfItems = insured.items.length;

            // Mock helper methods.
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");

            // Add all items to the toDelete set. Not realistic, but it's fine for this test.
            const mockProcessRegularItems = vi.fn((insured, toDelete) =>
            {
                for (const item of insured.items)
                {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processRegularItems").mockImplementation(mockProcessRegularItems);
            const mockProcessAttachments = vi.fn((parentAttachmentsMap, itemsMap, traderId, toDelete) =>
            {
                for (const item of insured.items)
                {
                    toDelete.add(item._id);
                }
            });
            vi.spyOn(insuranceController, "processAttachments").mockImplementation(mockProcessAttachments);

            // Execute the method.
            const result = insuranceController.findItemsToDelete(insured);

            // Verify that the result is the correct size, and the size is logged.
            expect(result.size).toBe(numberOfItems);
            expect(mockLoggerDebug).toBeCalledWith(`Marked ${numberOfItems} items for deletion from insurance.`);
        });
    });

    describe("populateParentAttachmentsMap", () =>
    {
        it("should correctly map gun to all of its attachments", () =>
        {
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.populateItemsMap(insured);

            // Execute the method.
            const result = insuranceController.populateParentAttachmentsMap(insured, itemsMap);

            // Verify that the map is populated correctly.
            expect(result.size).toBe(6); // There are 6 base-level items in this insurance package.

            const gun = result.get("911a0f04d5d9c7e239807ae0");
            expect(gun.length).toBe(7); // This AK has 7 attachments.

            // The attachments should be mapped to the AK properly...
            const validAttachmentTemplates = [
                "677c209ebb45445ebb42c405",
                "4bd10f89836fd9f86aedcac1",
                "8b1327270791b142ac341b03",
                "da8cde1b3024c336f6e06152",
                "bc041c0011d76f714b898400",
                "9f8d7880a6e0a47a211ec5d3",
                "db2ef9442178910eba985b51",
            ];
            for (const value of validAttachmentTemplates)
            {
                // Verify that each template is present in the array of attachments.
                expect(gun.some((item) => item._id === value)).toBe(true);
            }
        });

        it("should ignore gun accessories that cannot be modified in-raid", () =>
        {
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.populateItemsMap(insured);

            // Execute the method.
            const result = insuranceController.populateParentAttachmentsMap(insured, itemsMap);

            // Verify that the map is populated correctly.
            expect(result.size).toBe(6); // There are 6 base-level items in this insurance package.

            const gun = result.get("911a0f04d5d9c7e239807ae0");
            expect(gun.length).toBe(7); // This AK has 7 valid attachments.

            // These are attachments for the AK, but they are not raid moddable, so they should not be mapped.
            const invalidAttachmentTemplates = [
                "1e0b177df108c0c117028812",
                "c9278dd8251e99578bf7a274",
                "402b4086535a50ef7d9cef88",
                "566335b3df586f34b47f5e35",
            ];
            for (const value of invalidAttachmentTemplates)
            {
                // Verify that each template is not present in the array of attachments.
                expect(gun.every((item) => item._id !== value)).toBe(true);
            }
        });

        it("should correctly map helmet to all of its attachments", () =>
        {
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.populateItemsMap(insured);

            // Execute the method.
            const result = insuranceController.populateParentAttachmentsMap(insured, itemsMap);

            // Verify that the map is populated correctly.
            expect(result.size).toBe(6); // There are 6 base-level items in this insurance package.

            const gun = result.get("3679078e05f5b14466d6a730");
            expect(gun.length).toBe(5); // This LShZ-2DTM has 5 valid attachments.

            // The attachments should be mapped to the AK properly...
            const validAttachmentTemplates = [
                "a2b0c716162c5e31ec28c55a",
                "dc565f750342cb2d19eeda06",
                "e9ff62601669d9e2ea9c2fbb",
                "ac134d7cf6c9d8e25edd0015",
                "22274b895ecc80d51c3cba1c",
            ];
            for (const value of validAttachmentTemplates)
            {
                // Verify that each template is present in the array of attachments.
                expect(gun.some((item) => item._id === value)).toBe(true);
            }
        });

        it("should correctly map gun to all of its attachments when gun is within a container", () =>
        {
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.populateItemsMap(insured);

            // Execute the method.
            const result = insuranceController.populateParentAttachmentsMap(insured, itemsMap);

            // Verify that the map is populated correctly.
            expect(result.size).toBe(6); // There are 6 base-level items in this insurance package.

            const gun = result.get("351180f3248d45c71cb2ebdc");
            expect(insured.items.find((item) => item._id === "351180f3248d45c71cb2ebdc").slotId).toBe("main");
            expect(gun.length).toBe(14); // This AS VAL has 14 valid attachments.
        });

        it("should not map items that do not have a main-parent", () =>
        {
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeRegularItems().get();
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.populateItemsMap(insured);

            // Execute the method.
            const result = insuranceController.populateParentAttachmentsMap(insured, itemsMap);

            // Verify that the map is populated correctly.
            expect(result.size).toBe(0);
        });

        it("should log a warning when an item does not have a main-parent", () =>
        {
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeRegularItems().get();
            const insured = insuranceFixture[0];

            // Generate the items map.
            const itemsMap = insuranceController.populateItemsMap(insured);

            // Suppress warnings.
            const mockLoggerWarning = vi.spyOn(insuranceController.logger, "warning").mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.populateParentAttachmentsMap(insured, itemsMap);

            // Verify that the warning was logged.
            expect(mockLoggerWarning).toHaveBeenCalled();
        });
    });

    describe("processRegularItems", () =>
    {
        it("should process regular items and their non-attachment children", () =>
        {
            insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeAttachmentItems().get();
            const insured = insuranceFixture[0];
            const numberOfItems = insured.items.length;
            const toDelete = new Set<string>();

            // Mock helper methods.
            const mockIsAttachmentAttached = vi.spyOn(insuranceController.itemHelper, "isAttachmentAttached");
            const mockFindAndReturnChildrenAsItems = vi.spyOn(
                insuranceController.itemHelper,
                "findAndReturnChildrenAsItems",
            );

            // Mock rollForDelete to return true for all items. Not realistic, but it's fine for this test.
            const mockRollForDelete = vi.spyOn(insuranceController, "rollForDelete").mockReturnValue(true);

            // Execute the method.
            insuranceController.processRegularItems(insured, toDelete);

            // Verify that the correct methods were called.
            expect(mockIsAttachmentAttached).toHaveBeenCalled();
            expect(mockFindAndReturnChildrenAsItems).toHaveBeenCalled();
            expect(mockRollForDelete).toHaveBeenCalledTimes(numberOfItems);

            // Verify that all items were added to the toDelete set.
            expect(toDelete).toEqual(new Set(insured.items.map((item) => item._id)));
        });

        it("should not roll attached attachments", () =>
        {
            const insured = insuranceFixture[0];
            const toDelete = new Set<string>();

            // Mock isAttachmentAttached to return true for all items.
            vi.spyOn(insuranceController.itemHelper, "isAttachmentAttached").mockReturnValue(true);

            // Mock rollForDelete to return true for all items.
            const mockRollForDelete = vi.spyOn(insuranceController, "rollForDelete").mockReturnValue(true);

            // Execute the method.
            insuranceController.processRegularItems(insured, toDelete);

            // Verify that a roll was not made for any items.
            expect(mockRollForDelete).not.toHaveBeenCalled();

            // Verify that no items were added to the toDelete set.
            expect(toDelete).toEqual(new Set());
        });

        it("should mark attachments for deletion when parent is marked for deletion", () =>
        {
            const itemHelper = container.resolve<ItemHelper>("ItemHelper");

            const insured = insuranceFixture[0];
            const toDelete = new Set<string>();

            // Mock rollForDelete to return true for all base-parent items.
            const mockRollForDelete = vi.fn((traderId, insuredItem) =>
            {
                return !itemHelper.isAttachmentAttached(insuredItem);
            });
            vi.spyOn(insuranceController, "rollForDelete").mockImplementation(mockRollForDelete);

            // Execute the method.
            insuranceController.processRegularItems(insured, toDelete);

            // Verify that all items were added to the toDelete set.
            expect(toDelete).toEqual(new Set(insured.items.map((item) => item._id)));
        });
    });

    describe("processAttachments", () =>
    {
        it("should iterate over each parent item", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const toDelete = new Set<string>();

            // Mock helper methods.
            const mockProcessAttachmentByParent = vi.spyOn(insuranceController, "processAttachmentByParent");

            // Execute the method.
            insuranceController.processAttachments(parentToAttachmentMap, itemsMap, insured.traderId, toDelete);

            // Verify
            expect(mockProcessAttachmentByParent).toHaveBeenCalledTimes(parentToAttachmentMap.size);
        });

        it("should log the name of each parent item", () =>
        {
            const itemHelper = container.resolve<ItemHelper>("ItemHelper");

            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const toDelete = new Set<string>();

            // Mock helper methods.
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug");

            // Execute the method.
            insuranceController.processAttachments(parentToAttachmentMap, itemsMap, insured.traderId, toDelete);

            // Verify that the name of each parent item is logged.
            for (const [parentId] of parentToAttachmentMap)
            {
                const parentItem = itemsMap.get(parentId);
                if (parentItem)
                {
                    const expectedMessage = `Processing attachments for parent item: ${
                        itemHelper.getItemName(parentItem._tpl)
                    }`;
                    expect(mockLoggerDebug).toHaveBeenCalledWith(expectedMessage);
                }
            }
        });
    });

    describe("processAttachmentByParent", () =>
    {
        it("should handle sorting, rolling, and deleting attachments by calling helper methods", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const attachments = parentToAttachmentMap.entries().next().value;
            const toDelete = new Set<string>();

            // Mock helper methods.
            const mockSortAttachmentsByPrice = vi.spyOn(insuranceController, "sortAttachmentsByPrice");
            const mockCountSuccessfulRolls = vi.spyOn(insuranceController, "countSuccessfulRolls").mockReturnValue(4);
            const mockAttachmentDeletionByValue = vi.spyOn(insuranceController, "attachmentDeletionByValue");

            // Execute the method.
            insuranceController.processAttachmentByParent(attachments, insured.traderId, toDelete);

            // Verify that helper methods are called.
            expect(mockSortAttachmentsByPrice).toHaveBeenCalledWith(attachments);
            expect(mockCountSuccessfulRolls).toHaveBeenCalled();
            expect(mockAttachmentDeletionByValue).toHaveBeenCalled();
        });

        it("should log attachment details and number of successful rolls", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const attachments = parentToAttachmentMap.values().next().value;
            const toDelete = new Set<string>();
            const successfulRolls = 4;

            // Mock helper methods.
            const mockLogAttachmentsDetails = vi.spyOn(insuranceController, "logAttachmentsDetails");
            vi.spyOn(insuranceController, "countSuccessfulRolls").mockReturnValue(successfulRolls);
            const mockLoggerDebug = vi.spyOn(insuranceController.logger, "debug").mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.processAttachmentByParent(attachments, insured.traderId, toDelete);

            // Verify that the logs were called/written.
            expect(mockLogAttachmentsDetails).toBeCalled();
            expect(mockLoggerDebug).toHaveBeenCalledWith(`Number of successful rolls: ${successfulRolls}`);
        });
    });

    describe("sortAttachmentsByPrice", () =>
    {
        it("should sort the attachments array by maxPrice in descending order", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const attachments = parentToAttachmentMap.values().next().value;

            // Execute the method.
            const sortedAttachments = insuranceController.sortAttachmentsByPrice(attachments);

            // Verify the length of the sorted attachments array
            expect(sortedAttachments.length).toBe(5);

            // Verify that the attachments are sorted by maxPrice in descending order
            for (let i = 1; i < sortedAttachments.length; i++)
            {
                expect(sortedAttachments[i - 1].maxPrice).toBeGreaterThanOrEqual(sortedAttachments[i].maxPrice);
            }
        });

        it("should place attachments with null maxPrice at the bottom of the sorted list", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const attachments = parentToAttachmentMap.values().next().value;

            // Set the maxPrice of the first two attachments to null.
            vi.spyOn(insuranceController.itemHelper, "getItemMaxPrice").mockReturnValueOnce(null).mockReturnValueOnce(
                null,
            );

            // Execute the method.
            const sortedAttachments = insuranceController.sortAttachmentsByPrice(attachments);

            // Verify that the attachments with null maxPrice are at the bottom of the list
            const nullPriceAttachments = sortedAttachments.slice(-2);
            for (const attachment of nullPriceAttachments)
            {
                expect(attachment.maxPrice).toBeNull();
            }

            // Verify that the rest of the attachments are sorted by maxPrice in descending order
            for (let i = 1; i < sortedAttachments.length - 2; i++)
            {
                expect(sortedAttachments[i - 1].maxPrice).toBeGreaterThanOrEqual(sortedAttachments[i].maxPrice);
            }
        });
    });

    describe("logAttachmentsDetails", () =>
    {
        it("should log details for each attachment", () =>
        {
            const attachments = [{ _id: "item1", name: "Item 1", maxPrice: 100 }, {
                _id: "item2",
                name: "Item 2",
                maxPrice: 200,
            }];

            // Mock the logger.debug function.
            const loggerDebugSpy = vi.spyOn(insuranceController.logger, "debug");

            // Execute the method.
            insuranceController.logAttachmentsDetails(attachments);

            // Verify that logger.debug was called correctly.
            expect(loggerDebugSpy).toHaveBeenCalledTimes(2);
            expect(loggerDebugSpy).toHaveBeenNthCalledWith(1, "Child Item - Name: Item 1, Max Price: 100");
            expect(loggerDebugSpy).toHaveBeenNthCalledWith(2, "Child Item - Name: Item 2, Max Price: 200");
        });

        it("should not log anything when there are no attachments", () =>
        {
            const attachments = [];

            // Mock the logger.debug function.
            const loggerDebugSpy = vi.spyOn(insuranceController.logger, "debug");

            // Execute the method.
            insuranceController.logAttachmentsDetails(attachments);

            // Verify that logger.debug was called correctly.
            expect(loggerDebugSpy).not.toHaveBeenCalled();
        });
    });

    describe("countSuccessfulRolls", () =>
    {
        it("should count the number of successful rolls based on the rollForDelete method", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const attachments = parentToAttachmentMap.values().next().value;

            // Mock rollForDelete to return true for the first two attachments.
            const mockRollForDelete = vi.spyOn(insuranceController, "rollForDelete").mockReturnValue(false)
                .mockReturnValueOnce(true).mockReturnValueOnce(true);

            // Execute the method.
            const result = insuranceController.countSuccessfulRolls(attachments, insured.traderId);

            // Verify that two successful rolls were counted.
            expect(mockRollForDelete).toHaveBeenCalledTimes(attachments.length);
            expect(result).toBe(2);
        });

        it("should count the number of successful rolls based on the rollForDelete method", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const attachments = parentToAttachmentMap.values().next().value;

            // Mock rollForDelete to return false.
            const mockRollForDelete = vi.spyOn(insuranceController, "rollForDelete").mockReturnValue(false);

            // Execute the method.
            const result = insuranceController.countSuccessfulRolls(attachments, insured.traderId);

            // Verify that zero successful rolls were counted.
            expect(mockRollForDelete).toHaveBeenCalledTimes(attachments.length);
            expect(result).toBe(0);
        });

        it("should return zero if there are no attachments", () =>
        {
            const insured = insuranceFixture[0];
            const attachments = [];

            // Spy on rollForDelete to ensure it is not called.
            const mockRollForDelete = vi.spyOn(insuranceController, "rollForDelete");

            // Execute the method.
            const result = insuranceController.countSuccessfulRolls(attachments, insured.traderId);

            // Verify that zero successful rolls were returned.
            expect(mockRollForDelete).not.toHaveBeenCalled();
            expect(result).toBe(0);
        });
    });

    describe("attachmentDeletionByValue", () =>
    {
        it("should add the correct number of attachments to the toDelete set", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const attachments = parentToAttachmentMap.values().next().value;

            const successfulRolls = 2;
            const toDelete = new Set<string>();

            // Execute the method.
            insuranceController.attachmentDeletionByValue(attachments, successfulRolls, toDelete);

            // Should add the first two valuable attachments to the toDelete set.
            expect(toDelete.size).toEqual(successfulRolls);
        });

        it("should not add any attachments to toDelete if successfulRolls is zero", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const attachments = parentToAttachmentMap.values().next().value;

            const successfulRolls = 0;
            const toDelete = new Set<string>();

            // Execute the method.
            insuranceController.attachmentDeletionByValue(attachments, successfulRolls, toDelete);

            // Should be empty.
            expect(toDelete.size).toEqual(successfulRolls);
        });

        it("should add all attachments to toDelete if successfulRolls is greater than the number of attachments", () =>
        {
            const insured = insuranceFixture[0];
            const itemsMap = insuranceController.populateItemsMap(insured);
            const parentToAttachmentMap = insuranceController.populateParentAttachmentsMap(insured, itemsMap);
            const attachments = parentToAttachmentMap.values().next().value;

            const successfulRolls = 999;
            const toDelete = new Set<string>();

            // Execute the method.
            insuranceController.attachmentDeletionByValue(attachments, successfulRolls, toDelete);

            // Should be empty.
            expect(toDelete.size).toBeLessThan(successfulRolls);
            expect(toDelete.size).toEqual(attachments.length);
        });
    });

    describe("removeItemsFromInsurance", () =>
    {
        it("should remove items from insurance based on the toDelete set", () =>
        {
            const insured = insuranceFixture[0];

            const toDelete = new Set<string>();
            const numberToDelete = 2;
            for (let i = 0; i < numberToDelete; i++)
            {
                toDelete.add(insured.items[i]._id);
            }

            // Execute the method.
            insuranceController.removeItemsFromInsurance(insured, toDelete);

            // Ensure that the items in the toDelete set are not present in the insured items array.
            for (const toDeleteId of toDelete)
            {
                expect(insured.items.some((item) => item._id === toDeleteId)).toBe(false);
            }
        });

        it("should not remove any items if toDelete set is empty", () =>
        {
            const insured = insuranceFixture[0];
            const originalCount = insured.items.length;
            const toDelete = new Set<string>();

            // Execute the method.
            insuranceController.removeItemsFromInsurance(insured, toDelete);

            // Ensure that no items were removed.
            expect(insured.items.length).toBe(originalCount);
        });

        it("should leave the insurance items empty if all are to be deleted", () =>
        {
            const insured = insuranceFixture[0];
            const originalCount = insured.items.length;
            const toDelete = new Set<string>();
            for (const item of insured.items)
            {
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

    describe("adoptOrphanedItems", () =>
    {
        it("should adopt orphaned items by resetting them as base-level items", () =>
        {
            // Get all of the items, so that we can dynamically find the hideout item.
            const insured = insuranceFixture[0];
            const hideoutParentId = insuranceController.fetchHideoutItemParent(insured.items);

            // Manually set one of the items to be orphaned.
            insured.items[0].parentId = "9999"; // Should not exist in the items array.
            insured.items[0].slotId = "main"; // Should not be "hideout".

            // Iterate over the items and find an individual orphaned item.
            const orphanedItem = insured.items.find((item) =>
                !insured.items.some((parent) => parent._id === item.parentId)
            );

            // Setup tests to verify that the orphaned item we added is in fact orphaned.
            expect(orphanedItem.parentId).toBe(insured.items[0].parentId);
            expect(orphanedItem.slotId).toBe(insured.items[0].slotId);

            // Execute the method.
            insuranceController.adoptOrphanedItems(insured);

            // Verify that the orphaned items have been adopted.
            expect(orphanedItem.parentId).toBe(hideoutParentId);
            expect(orphanedItem.slotId).toBe("hideout");
        });

        it("should not adopt items that are not orphaned", () =>
        {
            const unmodified = insuranceFixture[0];

            // Create a deep copy of the insured items array.
            const insured = JSON.parse(JSON.stringify(insuranceFixture[0]));

            // Execute the method.
            insuranceController.adoptOrphanedItems(insured);

            // Verify that the orphaned items have been adopted.
            expect(insured).toStrictEqual(unmodified);
        });

        it("should remove location data from adopted items", () =>
        {
            const insured = insuranceFixture[0];

            // Manually set one of the items to be orphaned.
            insured.items[0].parentId = "9999"; // Should not exist in the items array.
            insured.items[0].slotId = "main"; // Should not be "hideout".
            insured.items[0].location = { x: 1, y: 2, r: 3, isSearched: true }; // Should be removed.

            // Iterate over the items and find an individual orphaned item.
            const orphanedItem = insured.items.find((item) =>
                !insured.items.some((parent) => parent._id === item.parentId)
            );

            // Setup tests to verify that the orphaned item we added is in fact orphaned.
            expect(orphanedItem.parentId).toBe(insured.items[0].parentId);
            expect(orphanedItem.slotId).toBe(insured.items[0].slotId);

            // Execute the method.
            insuranceController.adoptOrphanedItems(insured);

            // Verify that the orphaned items have been adopted.
            expect(orphanedItem).not.toHaveProperty("location");
        });
    });

    describe("fetchHideoutItemParent", () =>
    {
        it("should return the parentId value of an item that has a slotId of 'hideout'", () =>
        {
            const insured = insuranceFixture[0];
            const hideoutParentId = insuranceController.fetchHideoutItemParent(insured.items);

            // Execute the method.
            const result = insuranceController.fetchHideoutItemParent(insured.items);

            // Verify that the hideout item parentId is returned.
            expect(result).toBe(hideoutParentId);
        });

        it("should return an empty string if no item with a slotId of 'hideout' could be found", () =>
        {
            // Fetch a bunch of orphaned items that don't have a hideout parent.
            const insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeRegularItems().get();
            const insured = insuranceFixture[0];

            // Execute the method.
            const result = insuranceController.fetchHideoutItemParent(insured.items);

            // Verify that the hideout item parentId is returned.
            expect(result).toBe("");
        });

        it("should log a warning if the base-level item does not exist", () =>
        {
            // Fetch a bunch of orphaned items that don't have a hideout parent.
            const insuranceFixture = new ProfileInsuranceFactory().adjustPackageDates().removeRegularItems().get();
            const insured = insuranceFixture[0];

            // Spy on the logger.
            const loggerWarningSpy = vi.spyOn(insuranceController.logger, "warning");

            // Execute the method.
            insuranceController.fetchHideoutItemParent(insured.items);

            // Verify that the hideout item parentId is returned.
            expect(loggerWarningSpy).toHaveBeenCalled();
        });
    });

    describe("sendMail", () =>
    {
        it("should send insurance failed message when no items are present", () =>
        {
            const traderHelper = container.resolve<TraderHelper>("TraderHelper");

            const insurance = insuranceFixture[0];
            insurance.items = []; // Empty the items array
            const sessionID = "session-id";
            const insuranceFailedTpl = "failed-message-template";

            // Mock the randomUtil to return a static failed template string.
            const mockGetArrayValue = vi.spyOn(insuranceController.randomUtil, "getArrayValue").mockReturnValue(
                insuranceFailedTpl,
            );

            // Don't actually send the message.
            const sendMessageSpy = vi.spyOn(insuranceController.mailSendService, "sendLocalisedNpcMessageToPlayer")
                .mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.sendMail(sessionID, insurance);

            // Verify that the randomUtil.getArrayValue method was called.
            expect(mockGetArrayValue).toBeCalled();

            // Verify that the insurance failed message was sent.
            expect(sendMessageSpy).toHaveBeenCalledWith(
                sessionID,
                traderHelper.getTraderById(insurance.traderId),
                MessageType.INSURANCE_RETURN,
                insuranceFailedTpl,
                insurance.items,
                insurance.messageContent.maxStorageTime,
                insurance.messageContent.systemData,
            );
        });

        it("should not send insurance failed message when items are present", () =>
        {
            const traderHelper = container.resolve<TraderHelper>("TraderHelper");

            const insurance = insuranceFixture[0];
            const sessionID = "session-id";
            const insuranceFailedTpl = "failed-message-template";

            // Mock the randomUtil to return a static failed template string.
            const mockGetArrayValue = vi.spyOn(insuranceController.randomUtil, "getArrayValue").mockReturnValue(
                insuranceFailedTpl,
            );

            // Don't actually send the message.
            const sendMessageSpy = vi.spyOn(insuranceController.mailSendService, "sendLocalisedNpcMessageToPlayer")
                .mockImplementation(vi.fn());

            // Execute the method.
            insuranceController.sendMail(sessionID, insurance);

            // Verify that the randomUtil.getArrayValue method was not called.
            expect(mockGetArrayValue).not.toBeCalled();

            // Verify that the insurance failed message was not sent.
            expect(sendMessageSpy).toHaveBeenCalledWith(
                sessionID,
                traderHelper.getTraderById(insurance.traderId),
                MessageType.INSURANCE_RETURN,
                insurance.messageContent.templateId,
                insurance.items,
                insurance.messageContent.maxStorageTime,
                insurance.messageContent.systemData,
            );
        });
    });

    describe("rollForDelete", () =>
    {
        it("should return true when random roll is equal to trader return chance", () =>
        {
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

        it("should return true when random roll is greater than trader return chance", () =>
        {
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

        it("should return false when random roll is less than trader return chance", () =>
        {
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

        it("should log error if trader can not be found", () =>
        {
            const traderId = "invalid-trader-id";

            const loggerErrorSpy = vi.spyOn(insuranceController.logger, "error");

            // Execute the method.
            insuranceController.rollForDelete(traderId);

            // Verify that the logger.error method was called.
            expect(loggerErrorSpy).toHaveBeenCalled();
        });

        it("should return null if trader can not be found", () =>
        {
            const traderId = "invalid-trader-id";

            // Execute the method.
            const result = insuranceController.rollForDelete(traderId);

            // Verify that the result is null.
            expect(result).toBe(null);
        });
    });

    describe("insure", () =>
    {
        let pmcData: any;
        let body: any;
        let sessionId: string;
        let insuranceController: any;
        let mockGetPremium: any;
        let mockPayMoney: any;
        let mockGetOutput: any;

        beforeEach(() =>
        {
            insuranceController = container.resolve<InsuranceController>("InsuranceController");

            // Setup shared test data.
            pmcData = {
                Inventory: { items: [{ _id: "item1", otherProps: "value1" }, { _id: "item2", otherProps: "value2" }] },
                InsuredItems: [],
            };
            body = { items: ["item1", "item2"], tid: "someTraderId" };
            sessionId = "session-id";

            // Setup shared mocks.
            mockGetPremium = vi.spyOn(insuranceController.insuranceService, "getPremium").mockReturnValue(100);
            mockPayMoney = vi.spyOn(insuranceController.paymentService, "payMoney").mockReturnValue({
                warnings: [],
                otherProperty: "property-value",
            });
            mockGetOutput = vi.spyOn(insuranceController.eventOutputHolder, "getOutput").mockReturnValue({
                warnings: [],
                otherProperty: "property-value",
            });
        });

        it("should create a hash of inventory items by ID", () =>
        {
            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Since the inventoryItemsHash is internal to the function, we cannot check it directly. However, we can
            // infer its correctness by ensuring the payMoney function is called with the right "scheme_items" property.
            expect(mockPayMoney).toHaveBeenCalledWith(
                pmcData,
                {
                    scheme_items: [{ id: "5449016a4bdc2d6f028b456f", count: 100 }, {
                        id: "5449016a4bdc2d6f028b456f",
                        count: 100,
                    }],
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

        it("should calculate the insurance premium for each item to insure", () =>
        {
            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Verify that getPremium is called with each item from the pmcData.Inventory.items array.
            for (const item of pmcData.Inventory.items)
            {
                expect(mockGetPremium).toHaveBeenCalledWith(pmcData, item, body.tid);
            }

            // Verify that getPremium was called the correct number of times.
            expect(mockGetPremium).toHaveBeenCalledTimes(body.items.length);
        });

        it("should call the payment service with the correct parameters", () =>
        {
            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Define the expected payment options structure based on the setup data.
            const expectedPaymentOptions = {
                scheme_items: [{ id: "5449016a4bdc2d6f028b456f", count: 100 }, {
                    id: "5449016a4bdc2d6f028b456f",
                    count: 100,
                }],
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

        it("should add items to InsuredItems after successful payment", () =>
        {
            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Verify that the InsuredItems array has been populated with the correct items.
            const insuredItemIds = pmcData.InsuredItems.map((insuredItem) => insuredItem.itemId);
            expect(insuredItemIds).toContain("item1");
            expect(insuredItemIds).toContain("item2");

            // Verify that the number of InsuredItems matches the number of items intended to be insured.
            expect(pmcData.InsuredItems.length).toBe(body.items.length);
        });

        it("should return the output with warnings if payment fails", () =>
        {
            // Override the payMoney mock to simulate a payment failure with a warning.
            const expectedPayMoneyReturn = {
                warnings: [{ index: 0, errmsg: "Not enough money to complete transaction", code: 500 }],
                otherProperty: "property-value",
            };
            mockPayMoney.mockReturnValue(expectedPayMoneyReturn);

            // Execute the method.
            const response = insuranceController.insure(pmcData, body, sessionId);

            // Verify that the response contains the warnings from the payment failure
            expect(response.warnings).toStrictEqual(expectedPayMoneyReturn.warnings);

            // Verify that other properties from the response are still present.
            expect(response).toHaveProperty("otherProperty", "property-value");
        });

        it("should not add items to InsuredItems if payment fails", () =>
        {
            // Override the payMoney mock to simulate a payment failure with a warning.
            const expectedPayMoneyReturn = {
                warnings: [{ index: 0, errmsg: "Not enough money to complete transaction", code: 500 }],
                otherProperty: "property-value",
            };
            mockPayMoney.mockReturnValue(expectedPayMoneyReturn);

            // Execute the method.
            insuranceController.insure(pmcData, body, sessionId);

            // Verify that the InsuredItems array has not been populated.
            expect(pmcData.InsuredItems).toHaveLength(0);
        });
    });

    describe("cost", () =>
    {
        let sessionId: string;

        beforeEach(() =>
        {
            insuranceController = container.resolve<InsuranceController>("InsuranceController");

            sessionId = "session-id";

            vi.spyOn(insuranceController.profileHelper, "getPmcProfile").mockReturnValue({
                Inventory: {
                    items: [{ _id: "itemId1", _tpl: "itemTpl1", otherProperty: "property-value1" }, {
                        _id: "itemId2",
                        _tpl: "itemTpl2",
                        otherProperty: "property-value2",
                    }, { _id: "itemId3", _tpl: "itemTpl3", otherProperty: "property-value3" }],
                },
            });
        });

        it("should return an empty object if no traders and items are specified", () =>
        {
            const request = { traders: [], items: [] };
            const expected = {};

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });

        it("should return an empty object if no items are specified", () =>
        {
            const request = { traders: ["prapor"], items: [] };
            const expected = { prapor: {} };

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });

        it("should return an empty object if no trader is specified but items are", () =>
        {
            const request = { traders: [], items: ["itemId1", "itemId2"] };
            const expected = {};

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });

        it("should return the expected cost for each item and trader", () =>
        {
            const request = { traders: ["prapor", "therapist"], items: ["itemId1", "itemId2", "itemId3"] };
            const expected = {
                prapor: { itemTpl1: 100, itemTpl2: 200, itemTpl3: 300 },
                therapist: { itemTpl1: 150, itemTpl2: 250, itemTpl3: 350 },
            };

            // Mock the InsuranceService.getPremium method to return the expected values.
            vi.spyOn(insuranceController.insuranceService, "getPremium").mockReturnValueOnce(100).mockReturnValueOnce(
                200,
            ).mockReturnValueOnce(300).mockReturnValueOnce(150).mockReturnValueOnce(250).mockReturnValueOnce(350);

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });

        it("should skip items that are not in the player's inventory", () =>
        {
            const request = {
                traders: ["prapor"],
                items: [
                    "itemId1",
                    "itemId2",
                    "itemId4", // Doesn't exist in the player's inventory.
                ],
            };
            const expected = { prapor: { itemTpl1: 100, itemTpl2: 200 } };

            // Mock the InsuranceService.getPremium method to return the expected values.
            vi.spyOn(insuranceController.insuranceService, "getPremium").mockReturnValueOnce(100).mockReturnValueOnce(
                200,
            );

            const result = insuranceController.cost(request, sessionId);

            expect(result).toEqual(expected);
        });
    });
});
