import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data.service';
import { MarketDataService } from '@ghostfolio/api/services/market-data.service';
import { resetHours } from '@ghostfolio/common/helper';
import { Injectable } from '@nestjs/common';
import { isBefore, isToday } from 'date-fns';
import { flatten } from 'lodash';

import { GetValueObject } from './interfaces/get-value-object.interface';
import { GetValuesParams } from './interfaces/get-values-params.interface';

@Injectable()
export class CurrentRateService {
  public constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly marketDataService: MarketDataService
  ) {}

  public async getValues({
    currencies,
    dataGatheringItems,
    dateQuery,
    userCurrency
  }: GetValuesParams): Promise<GetValueObject[]> {
    const includeToday =
      (!dateQuery.lt || isBefore(new Date(), dateQuery.lt)) &&
      (!dateQuery.gte || isBefore(dateQuery.gte, new Date())) &&
      (!dateQuery.in || this.containsToday(dateQuery.in));

    const promises: Promise<
      {
        date: Date;
        marketPrice: number;
        symbol: string;
      }[]
    >[] = [];

    if (includeToday) {
      const today = resetHours(new Date());
      promises.push(
        this.dataProviderService
          .get(dataGatheringItems)
          .then((dataResultProvider) => {
            const result = [];
            for (const dataGatheringItem of dataGatheringItems) {
              result.push({
                date: today,
                marketPrice: this.exchangeRateDataService.toCurrency(
                  dataResultProvider?.[dataGatheringItem.symbol]?.marketPrice ??
                    0,
                  dataResultProvider?.[dataGatheringItem.symbol]?.currency,
                  userCurrency
                ),
                symbol: dataGatheringItem.symbol
              });
            }
            return result;
          })
      );
    }

    const symbols = dataGatheringItems.map((dataGatheringItem) => {
      return dataGatheringItem.symbol;
    });

    promises.push(
      this.marketDataService
        .getRange({
          dateQuery,
          symbols
        })
        .then((data) => {
          return data.map((marketDataItem) => {
            return {
              date: marketDataItem.date,
              marketPrice: this.exchangeRateDataService.toCurrency(
                marketDataItem.marketPrice,
                currencies[marketDataItem.symbol],
                userCurrency
              ),
              symbol: marketDataItem.symbol
            };
          });
        })
    );

    return flatten(await Promise.all(promises));
  }

  private containsToday(dates: Date[]): boolean {
    for (const date of dates) {
      if (isToday(date)) {
        return true;
      }
    }
    return false;
  }
}
