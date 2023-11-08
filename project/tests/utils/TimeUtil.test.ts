import "reflect-metadata";

import { beforeEach, describe, expect, it } from "@jest/globals";

import { TimeUtil } from "@spt-aki/utils/TimeUtil";

describe("test text", () => {
    let timeUtil: TimeUtil;
    beforeEach(() => {
        timeUtil = new TimeUtil();
    });

    it("BotHelper type check", () => {
        expect(timeUtil).toBeInstanceOf(TimeUtil);
    });

    it("formatTime()", () => {
        expect(timeUtil.formatTime(new Date(2020, 1, 1, 15, 24, 0))).toBe("15-24-00");
    });

    it("formatDate()", () => {
        expect(timeUtil.formatDate(new Date(2020, 4, 13))).toBe("2020-05-13");
    });

    it("getDate()", () => {
        const currentDate = timeUtil.formatDate(new Date());
        expect(timeUtil.getDate()).toBe(currentDate);
    });

    it("getTime()", () => {
        const currentTime = timeUtil.formatTime(new Date());
        expect(timeUtil.getTime()).toBe(currentTime);
    });

    it("getHoursAsSeconds() one hour", () => {
        expect(timeUtil.getHoursAsSeconds(1)).toBe(3600);
    });

    it("getHoursAsSeconds() three hours", () => {
        expect(timeUtil.getHoursAsSeconds(3)).toBe(10800);
    });

    it("getTimestamp()", () => {
        const currentTimestampSecondsFloored = Math.floor(new Date().getTime() / 1000);
        expect(timeUtil.getTimestamp()).toBe(currentTimestampSecondsFloored);
    });

    it("getTimeMailFormat()", () => {
        const currentTime = new Date();
        const currentTimeMinutes = currentTime.getMinutes().toString().padStart(2, "0");
        const currentTimeHours = currentTime.getHours().toString().padStart(2, "0");
        expect(timeUtil.getTimeMailFormat()).toBe(`${currentTimeHours}:${currentTimeMinutes}`);
    });

    it("getDateMailFormat()", () => {
        const currentTime = new Date();
        const currentDay = currentTime.getDate().toString().padStart(2, "0");
        const currentMonth = (currentTime.getMonth() + 1).toString().padStart(2, "0");
        const currentYear = currentTime.getFullYear();
        expect(timeUtil.getDateMailFormat()).toBe(`${currentDay}.${currentMonth}.${currentYear}`);
    });
});
