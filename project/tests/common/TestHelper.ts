import { BotHelper } from "@spt-aki/helpers/BotHelper";
import { HandbookHelper } from "@spt-aki/helpers/HandbookHelper";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ItemBaseClassService } from "@spt-aki/services/ItemBaseClassService";
import { LocaleService } from "@spt-aki/services/LocaleService";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { AsyncQueue } from "@spt-aki/utils/AsyncQueue";
import { DatabaseImporter } from "@spt-aki/utils/DatabaseImporter";
import { EncodingUtil } from "@spt-aki/utils/EncodingUtil";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { ImporterUtil } from "@spt-aki/utils/ImporterUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { MathUtil } from "@spt-aki/utils/MathUtil";
import { ObjectId } from "@spt-aki/utils/ObjectId";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";
import { UUidGenerator } from "@spt-aki/utils/UUidGenerator";
import { VFS } from "@spt-aki/utils/VFS";
import { MockHelper } from "./MockHelper";
import WinstonLogger from "./__mocks__/WinstonLogger";

export class TestHelper 
{
    logger: ILogger;
    asyncQueue: AsyncQueue;
    uuidGenerator: UUidGenerator;
    timeUtil: TimeUtil;
    vfs: VFS;
    hashUtil: HashUtil;
    jsonUtil: JsonUtil;
    randomUtil: RandomUtil;
    encodingUtil: EncodingUtil;
    importerUtil: ImporterUtil;
    configServer: ConfigServer;
    objectId: ObjectId;
    mathUtil: MathUtil;
    databaseServer: DatabaseServer;
    itemHelper: ItemHelper;
    localeService: LocaleService;
    localisationService: LocalisationService;
    handbookHelper: HandbookHelper;
    itemBaseClassService: ItemBaseClassService;
    botHelper: BotHelper;

    public static async fetchTestHelper() 
    {
        const initTestHelper = new TestHelper();
        const mockHelper = new MockHelper();

        const dbImporter = new DatabaseImporter(
            initTestHelper.logger,
            initTestHelper.vfs,
            initTestHelper.jsonUtil,
            initTestHelper.localisationService,
            initTestHelper.databaseServer,
            mockHelper.getMockImageRouter().object,
            initTestHelper.encodingUtil,
            initTestHelper.hashUtil,
            initTestHelper.importerUtil
        );
        await dbImporter.onLoad();
        return initTestHelper;
    }

    constructor() 
    {

        this.logger = new WinstonLogger();
        this.asyncQueue = new AsyncQueue();
        this.uuidGenerator = new UUidGenerator();
        this.timeUtil = new TimeUtil();
        this.vfs = new VFS(this.asyncQueue, this.uuidGenerator);
        this.hashUtil = new HashUtil(this.timeUtil);
        this.jsonUtil = new JsonUtil(this.vfs, this.hashUtil, this.logger);
        this.randomUtil = new RandomUtil(this.jsonUtil, this.logger);
        this.configServer = new ConfigServer(this.logger, this.vfs, this.jsonUtil);
        this.objectId = new ObjectId(this.timeUtil);
        this.mathUtil = new MathUtil();

        this.databaseServer = new DatabaseServer();
        this.localeService = new LocaleService(this.logger, this.databaseServer, this.configServer);
        this.localisationService = new LocalisationService(this.logger, this.localeService);

        this.encodingUtil = new EncodingUtil();
        this.importerUtil = new ImporterUtil(this.vfs, this.jsonUtil);

        this.handbookHelper = new HandbookHelper(this.databaseServer);
        this.itemBaseClassService = new ItemBaseClassService(this.logger, this.localisationService, this.databaseServer);
        this.itemHelper = new ItemHelper(this.logger, this.hashUtil, this.jsonUtil, this.randomUtil, this.objectId, this.mathUtil, this.databaseServer, this.handbookHelper, this.itemBaseClassService, this.localisationService, this.localeService);
        this.botHelper = new BotHelper(this.logger, this.jsonUtil, this.databaseServer, this.randomUtil, this.localisationService, this.configServer);
    }

    public getTestLogger(): ILogger
    {
        return this.logger;
    }

    public getTestUuidGenerator(): UUidGenerator
    {
        return this.uuidGenerator;
    }


    public getTestVFS(): VFS
    {
        return this.vfs;
    }

    public getTestHashUtil(): HashUtil
    {
        return new HashUtil(this.timeUtil);
    }

    public getTestJsonUtil(): JsonUtil
    {
        return this.jsonUtil;
    }

    public getTestRandomUtil(): RandomUtil
    {
        return this.randomUtil;
    }

    public getTestConfigServer(): ConfigServer
    {
        return this.configServer;
    }

    public getTestItemHelper(): ItemHelper
    {
        return this.itemHelper;
    }

    public getTestDatabaseServer(): DatabaseServer
    {
        return this.databaseServer;
    }

    public getTestLocalisationService(): LocalisationService
    {
        return this.localisationService;
    }

    public getTestBotHelper(): BotHelper
    {
        return this.botHelper;
    }

    public getTestMathUtil(): MathUtil
    {
        return this.mathUtil;
    }
}