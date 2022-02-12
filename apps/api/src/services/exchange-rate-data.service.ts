import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration.service';
import { baseCurrency, PROPERTY_CURRENCIES, FX_START_DATE } from '@ghostfolio/common/config';
import { Constants } from '@ghostfolio/common/constants';
import {
  getNextDay,
  getToday,
  getUtc,
  getYesterday,
  isValidDate
} from '@ghostfolio/common/helper';
import { Injectable, Logger } from '@nestjs/common';
import { differenceInDays, format, parseISO } from 'date-fns';
import { isNumber, uniq } from 'lodash';
import { type } from 'os';

import { DataProviderService } from './data-provider/data-provider.service';
import {
  IDataExchangeRateItem,
  IDataGatheringItem
} from './interfaces/interfaces';
import { PrismaService } from './prisma.service';
import { PropertyService } from './property/property.service';

@Injectable()
export class ExchangeRateDataService {
  private static readonly MAX_DIFF_DAYS = 7;
  private currencies: string[] = [];
  private currencyPairs: IDataGatheringItem[] = [];
  private exchangeRates: IDataExchangeRateItem[] = [];
  private missingExchangeRatesSymbolDatePairs: [string, string][] = [];

  public constructor(
    private readonly dataProviderService: DataProviderService,
    private readonly orderService: OrderService,
    private readonly prismaService: PrismaService,
    private readonly propertyService: PropertyService
  ) {
    this.initialize();
  }

  public getCurrencies() {
    return this.currencies?.length > 0 ? this.currencies : [baseCurrency];
  }

  public getCurrencyPairs() {
    return this.currencyPairs;
  }

  public async initialize() {
    this.currencies = await this.prepareCurrencies();
    this.currencyPairs = [];
    this.exchangeRates = [];
    this.missingExchangeRatesSymbolDatePairs = [];

    for (const {
      currency1,
      currency2,
      dataSource
    } of this.prepareCurrencyPairs(this.currencies)) {
      this.currencyPairs.push({
        dataSource,
        symbol: `${currency1}${currency2}`
      });
    }

    await this.loadCurrencies();
  }

  public async loadCurrencies() {
    const startDate = getUtc( FX_START_DATE );
    const fromDate = this.orderService.getFirstOrderAfterDate(startDate);
    await this.loadCurrenciesForRange(fromDate, getToday());
  }

  public async loadCurrenciesForRange(fromDate, toDate) {
    const result = await this.dataProviderService.getHistorical(
      this.currencyPairs,
      'day',
      fromDate,
      toDate
    );

    let resultCount = 0;
    Object.values(result).forEach((exchangeRate) => {
      resultCount += Object.values(exchangeRate).length;
    });


    if (Object.keys(result).length !== this.currencyPairs.length) {
      // Load currencies directly from data provider as a fallback
      // if historical data is not fully available
      const historicalData = await this.dataProviderService.get(
        this.currencyPairs.map(({ dataSource, symbol }) => {
          return { dataSource, symbol };
        })
      );

      Object.keys(historicalData).forEach((key) => {
        result[key] = {
          [format(getYesterday(), Constants.DATE_FORMAT)]: {
            marketPrice: historicalData[key].marketPrice
          }
        };
      });
    }

    const resultExtended = result;

    // Calculate the opposite direction
    Object.keys(result).forEach((pair) => {
      const [currency1, currency2] = pair.match(/.{1,3}/g);
      resultExtended[`${currency2}${currency1}`] = {};
      Object.keys(result[pair]).forEach((date) => {
        let newObject = {
          [date]: {
            marketPrice: 1 / result[pair][date].marketPrice
          }
        };
        Object.assign(resultExtended[`${currency2}${currency1}`], newObject);
      });
    });

    Object.keys(resultExtended).forEach((symbol) => {
      const [currency1, currency2] = symbol.match(/.{1,3}/g);
      Object.keys(result[symbol]).forEach((date) => {
        if (result[symbol][date].marketPrice) {
          this.exchangeRates.push({
            dateString: date,
            symbol: symbol,
            currency1,
            currency2,
            factor: result[symbol][date].marketPrice
          });
        } else {
          this.missingExchangeRatesSymbolDatePairs.push([symbol, date]);
        }
      });
    });

    // Not found, calculate indirectly via USD
    this.missingExchangeRatesSymbolDatePairs.forEach((pair) => {
      const symbol = pair[0];
      const date = pair[1];
      const [currency1, currency2] = symbol.match(/.{1,3}/g);

      const factor =
        resultExtended[`${currency1}${'USD'}`]?.[date]?.marketPrice *
        resultExtended[`${'USD'}${currency2}`]?.[date]?.marketPrice;

      this.exchangeRates.push({
        dateString: date,
        symbol: symbol,
        currency1,
        currency2,
        factor: factor
      });

      this.exchangeRates.push({
        dateString: date,
        symbol: `${currency2}${currency1}`,
        currency1: currency2,
        currency2: currency1,
        factor: 1 / factor
      });
    });
  }

  public toCurrency(
    aValue: number,
    aFromCurrency: string,
    aToCurrency: string
  ) {
    if (this.exchangeRates.length === 0) {
      // Reinitialize if data is not loaded correctly
      Logger.log('Reinitialize if data is not loaded correctly');
      this.initialize();
    }

    return this.toCurrencyInPast(
      aValue,
      aFromCurrency,
      aToCurrency,
      getToday()
    );
  }

  public toCurrencyInPast(
    aValue: number,
    aFromCurrency: string,
    aToCurrency: string,
    aDate: Date,
    diffDaysCounter?: number
  ) {
    if (!diffDaysCounter) {
      diffDaysCounter = 0;
    }
    // if date-symbol not in this.exchange rates fetch it and add it to exchangeRates then return it from exchange
    // rates. so we only cache what we import and there is no need to preload all available dates at the other hand if
    // we import past items changes are that we need the exchange rate more often in the import.

    const date: string = isValidDate(aDate)
      ? format(aDate, Constants.DATE_FORMAT)
      : format(parseISO(<string>(<unknown>aDate)), Constants.DATE_FORMAT);
    const symbol = `${aFromCurrency}${aToCurrency}`;
    let factor = 1;

    if (aFromCurrency !== aToCurrency) {
      const exRateForSymbolAndDate: IDataExchangeRateItem =
        this.exchangeRates.find(
          (exRate) => exRate.symbol === symbol && exRate.dateString === date
        );
      const exRateForFromCurrencyToUSD: IDataExchangeRateItem =
        this.exchangeRates.find(
          (exRate) =>
            exRate.currency1 === aFromCurrency && exRate.currency2 === 'USD'
        );
      const exRateForUSDToToCurrency: IDataExchangeRateItem =
        this.exchangeRates.find(
          (exRate) =>
            exRate.currency1 === 'USD' && exRate.currency2 === aToCurrency
        );

      if (exRateForSymbolAndDate) {
        factor = exRateForSymbolAndDate.factor;
      } else if (exRateForFromCurrencyToUSD && exRateForUSDToToCurrency) {
        // Calculate indirectly via USD
        const factor1 = exRateForFromCurrencyToUSD.factor;
        const factor2 = exRateForUSDToToCurrency.factor;

        factor = factor1 * factor2;

        this.exchangeRates.push({
          dateString: date,
          symbol: symbol,
          currency1: aFromCurrency,
          currency2: aToCurrency,
          factor: factor
        });
      } else if (diffDaysCounter < ExchangeRateDataService.MAX_DIFF_DAYS) {
        // cap it off at 7 days.
        if (getUtc(date) < getToday()) {
          // console.log(this.exchangeRates);
          Logger.warn(
            `No exchange rate has been found for ${symbol} - ${date}, try with next day`
          );
          diffDaysCounter++;
          return this.toCurrencyInPast(
            aValue,
            aFromCurrency,
            aToCurrency,
            getNextDay(date),
            diffDaysCounter
          );
        }
      }
    }

    if (isNumber(factor) && !isNaN(factor)) {
      return factor * aValue;
    }

    // Fallback with error, if currencies are not available
    Logger.error(
      `No exchange rate has been found for ${symbol} from ${date} to ${ExchangeRateDataService.MAX_DIFF_DAYS} days`
    );
    return aValue;
  }

  private async prepareCurrencies(): Promise<string[]> {
    let currencies: string[] = [];

    (
      await this.prismaService.account.findMany({
        distinct: ['currency'],
        orderBy: [{ currency: 'asc' }],
        select: { currency: true },
        where: {
          currency: {
            not: null
          }
        }
      })
    ).forEach((account) => {
      currencies.push(account.currency);
    });

    (
      await this.prismaService.settings.findMany({
        distinct: ['currency'],
        orderBy: [{ currency: 'asc' }],
        select: { currency: true },
        where: {
          currency: {
            not: null
          }
        }
      })
    ).forEach((userSettings) => {
      currencies.push(userSettings.currency);
    });

    (
      await this.prismaService.symbolProfile.findMany({
        distinct: ['currency'],
        orderBy: [{ currency: 'asc' }],
        select: { currency: true },
        where: {
          currency: {
            not: null
          }
        }
      })
    ).forEach((symbolProfile) => {
      currencies.push(symbolProfile.currency);
    });

    const customCurrencies = (await this.propertyService.getByKey(
      PROPERTY_CURRENCIES
    )) as string[];

    if (customCurrencies?.length > 0) {
      currencies = currencies.concat(customCurrencies);
    }

    return uniq(currencies).sort();
  }

  private prepareCurrencyPairs(aCurrencies: string[]) {
    return aCurrencies
      .filter((currency) => {
        return currency !== baseCurrency;
      })
      .map((currency) => {
        return {
          currency1: baseCurrency,
          currency2: currency,
          dataSource: this.dataProviderService.getPrimaryDataSource(),
          symbol: `${baseCurrency}${currency}`
        };
      });
  }
}
