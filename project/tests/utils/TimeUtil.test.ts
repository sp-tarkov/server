import "reflect-metadata";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("TimeUtil", () => {
    let timeUtil: TimeUtil;
    let mockedCurrentDate: Date;

    beforeEach(() => {
        timeUtil = container.resolve<TimeUtil>("TimeUtil");

        mockedCurrentDate = new Date("2023-01-01T00:00:00Z");
        vi.useFakeTimers();
        vi.setSystemTime(mockedCurrentDate);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe("pad", () => {
        it("should pad a number with a leading zero if it is less than 10", () => {
            const paddedNumber = (timeUtil as any).pad(1);
            expect(paddedNumber).toBe("01");
        });

        it("should not pad a number larger than 10", () => {
            const paddedNumber = (timeUtil as any).pad(69);
            expect(paddedNumber).toBe("69");
        });

        it("should not pad a number in the hundreds", () => {
            const paddedNumber = (timeUtil as any).pad(420);
            expect(paddedNumber).toBe("420");
        });
    });

    describe("formatTime", () => {
        it('should format the time part of a date as "HH-MM-SS"', () => {
            const date = new Date("2023-01-01T12:34:56Z");
            const formattedTime = timeUtil.formatTime(date);
            expect(formattedTime).toBe("12-34-56");
        });
    });

    describe("formatDate", () => {
        it('should format the date part of a date as "YYYY-MM-DD"', () => {
            const date = new Date("2023-01-01T12:34:56Z");
            const formattedDate = timeUtil.formatDate(date);
            expect(formattedDate).toBe("2023-01-01");
        });
    });

    describe("getDate", () => {
        it("should get the current date as a formatted UTC string", () => {
            const currentDate = timeUtil.getDate();
            expect(currentDate).toBe("2023-01-01");
        });
    });

    describe("getTime", () => {
        it("should get the current time as a formatted UTC string", () => {
            const currentTime = timeUtil.getTime();
            expect(currentTime).toBe("00-00-00"); // The mocked date is at midnight UTC.
        });
    });

    describe("getTimestamp", () => {
        it("should get the current timestamp in seconds in UTC", () => {
            const timestamp = timeUtil.getTimestamp();
            expect(timestamp).toBe(Math.floor(mockedCurrentDate.getTime() / 1000));
        });
    });

    describe("getTimeMailFormat", () => {
        it("should get the current time in UTC in a format suitable for mail in EFT", () => {
            const timeMailFormat = timeUtil.getTimeMailFormat();
            expect(timeMailFormat).toBe("00:00"); // The mocked date is at midnight UTC.
        });
    });

    describe("getDateMailFormat", () => {
        it("should get the current date in UTC in a format suitable for emails in EFT", () => {
            const dateMailFormat = timeUtil.getDateMailFormat();
            expect(dateMailFormat).toBe("01.01.2023");
        });
    });

    describe("getHoursAsSeconds", () => {
        it("should convert a number of hours into seconds", () => {
            const hours = 5;
            const seconds = timeUtil.getHoursAsSeconds(hours);
            expect(seconds).toBe(5 * 3600);
        });
    });
});
