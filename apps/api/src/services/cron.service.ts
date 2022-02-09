import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DataGatheringService } from './data-gathering.service';
import { ExchangeRateDataService } from './exchange-rate-data.service';
import { getUtc } from '@ghostfolio/common/helper';

@Injectable()
export class CronService {
  public constructor(
    private readonly dataGatheringService: DataGatheringService,
    private readonly exchangeRateDataService: ExchangeRateDataService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  public async runEveryMinute() {
    await this.dataGatheringService.gather7Days();
  }

  @Cron(CronExpression.EVERY_12_HOURS)
  public async runEveryTwelveHours() {
    //TODO: create better solution
    const fromDate = getUtc("2017-01-01");
    await this.exchangeRateDataService.loadCurrencies(fromDate);
  }

  @Cron(CronExpression.EVERY_WEEKEND)
  public async runEveryWeekend() {
    await this.dataGatheringService.gatherProfileData();
  }
}
