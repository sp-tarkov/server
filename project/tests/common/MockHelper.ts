import { QuestHelper } from "@spt-aki/helpers/QuestHelper";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import * as TypeMoq from "typemoq";

import { ImageRouter } from "@spt-aki/routers/ImageRouter";
import { ItemEventRouter } from "@spt-aki/routers/ItemEventRouter";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { PaymentService } from "@spt-aki/services/PaymentService";
import { VFS } from "@spt-aki/utils/VFS";

export class MockHelper {
    public getMockImageRouter(): TypeMoq.IMock<ImageRouter> {
        return TypeMoq.Mock.ofType(ImageRouter);
    }

    public getMockVFS(): TypeMoq.IMock<VFS> {
        //vfsMock.setup(x => x.getFiles(TypeMoq.It.isAnyString())).returns(() => []);
        return TypeMoq.Mock.ofType(VFS);
    }

    public getMockConfigServer(): TypeMoq.IMock<ConfigServer> {
        return TypeMoq.Mock.ofType(TestConfigServer);
    }

    public getItemEventRouter(): TypeMoq.IMock<ItemEventRouter> {
        return TypeMoq.Mock.ofType(ItemEventRouter);
    }

    public getQuestHelper(): TypeMoq.IMock<QuestHelper> {
        return TypeMoq.Mock.ofType(QuestHelper);
    }

    public getTraderHelper(): TypeMoq.IMock<TraderHelper> {
        return TypeMoq.Mock.ofType(TraderHelper);
    }

    public getPaymentServiceMock(): TypeMoq.IMock<PaymentService> {
        return TypeMoq.Mock.ofType(PaymentService);
    }
}

export class TestConfigServer extends ConfigServer {
    public override initialize(): void {
        return;
    }
}
