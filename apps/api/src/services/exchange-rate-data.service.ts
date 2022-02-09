import { baseCurrency, PROPERTY_CURRENCIES } from '@ghostfolio/common/config';
import { getNextDay, getToday, getUtc,  isValidDate } from '@ghostfolio/common/helper';
import { Injectable, Logger } from '@nestjs/common';
import { differenceInDays, format, parseISO } from 'date-fns';
import { isNumber, uniq } from 'lodash';

import { DataProviderService } from './data-provider/data-provider.service';
import { IDataExchangeRateItem, IDataGatheringItem } from './interfaces/interfaces';
import { PrismaService } from './prisma.service';
import { PropertyService } from './property/property.service';
import { Constants } from '@ghostfolio/common/constants';

@Injectable()
export class ExchangeRateDataService {
  static readonly MAX_DIFF_DAYS = 7;

  private currencies: string[] = [];
  private currencyPairs: IDataGatheringItem[] = [];
  private exchangeRates: IDataExchangeRateItem[] = [];
  private missingExchangeRatesSymbolDatePairs: [string, string][] = []

  public constructor(
    private readonly dataProviderService: DataProviderService,
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
    const fromDate = getUtc("2017-01-01");
    await this.loadCurrencies(fromDate);
  }

  public async loadCurrencies(fromDate) {
    await this.loadCurrenciesForRange(fromDate, getToday())
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
    console.log(resultCount);

    const datesInRange = differenceInDays(
      toDate,
      fromDate,
    );

    // console.log(datesInRange);
    // console.log(this.currencyPairs.length);
    // console.log(datesInRange * this.currencyPairs.length);
    // console.log(resultCount);
    //   // this check only works with one date like yesterday
    // if (Object.keys(result).length !== this.currencyPairs.length) {
    // if(datesInRange * this.currencyPairs.length !== resultCount) {
    //   console.log("we do not have all currencies factors yet");
    //   //     // Load currencies directly from data provider as a fallback
    // //     // if historical data is not fully available
    //   const historicalData = await this.dataProviderService.get(
    //     this.currencyPairs.map(({ dataSource, symbol }) => {
    //       return { dataSource, symbol };
    //     })
    //   );
    //
    //   // console.log(historicalData)
    //   Object.keys(historicalData).forEach((key) => {
    //     result[key] = {
    //       [format(getYesterday(), Constants.DATE_FORMAT)]: {
    //         marketPrice: historicalData[key].marketPrice
    //       }
    //     };
    //   });
    // // console.log(historicalData);
    // }

    const resultExtended = result;


    // Calculate the opposite direction
    Object.keys(result).forEach((pair) => {
      const [currency1, currency2] = pair.match(/.{1,3}/g);
      resultExtended[`${currency2}${currency1}`] = {}
      Object.keys(result[pair]).forEach((date) => {
        let newObject = {
          [date]: {
            marketPrice: 1 / result[pair][date].marketPrice
          }
        }
        Object.assign(resultExtended[`${currency2}${currency1}`], newObject);
      });
    });



      // Object.keys(result).forEach((pair) => {
      //   const [currency1, currency2] = pair.match(/.{1,3}/g);
      //   // const exchangeRateItems: IDataExchangeRateItem[] = []
      //   Object.keys(result[pair]).forEach((date) => {
      //     // Calculate the opposite direction
      //     console.log(date)
      //     resultExtended[`${currency2}${currency1}`] = {
      //       [date]: {
      //         marketPrice: 1 / result[pair][date].marketPrice
      //       }
      //     };



          //   exchangeRateItems.push({
          //     dateString: date,
          //     symbol: pair,
          //     currency1,
          //     currency2,
          //     factor: result[pair][date].marketPrice
          //   })

          // resultExtended[`${currency2}${currency1}`]

        // });

        // });


        // Calculate the opposite direction
        // resultExtended[`${currency2}${currency1}`] = {
        //   [date]: {
        //     marketPrice: 1 / result[pair][date].marketPrice
        //   }
        //  };
      // });

      // console.log(resultExtended);
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
            })
          } else {
            this.missingExchangeRatesSymbolDatePairs.push([symbol, date])
          }
        });
      });
      console.log(this.exchangeRates);

      // Not found, calculate indirectly via USD
      this.missingExchangeRatesSymbolDatePairs.forEach(pair => {
        const symbol = pair[0];
        const date = pair[1];
        const [currency1, currency2] = symbol.match(/.{1,3}/g);

        const factor = resultExtended[`${currency1}${'USD'}`]?.[date]?.marketPrice *
        resultExtended[`${'USD'}${currency2}`]?.[date]?.marketPrice

        this.exchangeRates.push({
          dateString: date,
          symbol: symbol,
          currency1,
          currency2,
          factor: factor
        })

        this.exchangeRates.push({
          dateString: date,
          symbol: `${currency2}${currency1}`,
          currency1: currency2,
          currency2: currency1,
          factor: 1 / factor
        })
      })
      // if (!this.exchangeRates[symbol].find()) {
      //     // Not found, calculate indirectly via USD
      //     this.exchangeRates[symbol] = {
      //       [date]: resultExtended[`${currency1}${'USD'}`]?.[date]?.marketPrice *
      //       resultExtended[`${'USD'}${currency2}`]?.[date]?.marketPrice
      //     }
      //
      //     // Calculate the opposite direction
      //     this.exchangeRates[`${currency2}${currency1}`] = {
      //       [date]: 1 / this.exchangeRates[symbol][date]
      //     }
      //   }
      // });
    // });


  }

  public toCurrency(
    aValue: number,
    aFromCurrency: string,
    aToCurrency: string
  ) {

    // const hasNaN = this.exchangeRates
    //
    //   Object.values(this.exchangeRates).some((exchangeDateRate) => {
    //   return Object.values(exchangeDateRate).some((exchangeRate) => {
    //     return isNaN(<number><unknown>exchangeRate);
    //   })
    // });

    if(this.exchangeRates.length === 0) {
      // Reinitialize if data is not loaded correctly
      Logger.log("Reinitialize if data is not loaded correctly");
      this.initialize();
    }

    return this.toCurrencyInPast(
      aValue,
      aFromCurrency,
      aToCurrency,
      getToday(),
      0
    );
  }

  public toCurrencyInPast(
    aValue: number,
    aFromCurrency: string,
    aToCurrency: string,
    aDate: Date,
    diffDaysCounter: number
  ) {
    // if date-symbol not in this.exchange rates fetch it and add it to exchangeRates then return it from exchange rates.
    // so we only cache what we import and there is no need to preload all available dates at the other hand if we import past
    // items changes are that we need the exchange rate more often in the import.

    let date: string
    if(isValidDate(aDate)) {
      date = format(aDate, Constants.DATE_FORMAT);
    } else {
      date = format(parseISO(<string>(<unknown>aDate)), Constants.DATE_FORMAT);
    }
    let factor = 1;

    if (aFromCurrency !== aToCurrency) {
      if (this.exchangeRates[`${aFromCurrency}${aToCurrency}`] && this.exchangeRates[`${aFromCurrency}${aToCurrency}`][date]) {
        factor = this.exchangeRates[`${aFromCurrency}${aToCurrency}`][date];
      } else if (this.exchangeRates[`${aFromCurrency}USD`] && this.exchangeRates[`USD${aToCurrency}`] && this.exchangeRates[`${aFromCurrency}USD`][date] && this.exchangeRates[`USD${aToCurrency}`][date]){
        // Calculate indirectly via USD
        const factor1 = this.exchangeRates[`${aFromCurrency}USD`][date];
        const factor2 = this.exchangeRates[`USD${aToCurrency}`][date];

        factor = factor1 * factor2;

        this.exchangeRates[`${aFromCurrency}${aToCurrency}`][date] = factor;
      }
      else if(diffDaysCounter < ExchangeRateDataService.MAX_DIFF_DAYS){
        // this will be a bit more complex.
        // logic should be for date if date not found find closest to this date in future
        // cap it off at 7 days.
        if(getUtc(date) < getToday()) {
          // console.log(this.exchangeRates);
          Logger.warn(
            `No exchange rate has been found for ${aFromCurrency}${aToCurrency} ${date}, try with next day`
          );
          diffDaysCounter++
          return this.toCurrencyInPast(aValue, aFromCurrency, aToCurrency, getNextDay(date), diffDaysCounter);
        }
        // } else {
        //   Logger.warn(
        //     `No exchange rate has been found for ${aFromCurrency}${aToCurrency} ${date}, try with previous day`
        //   );
        //   return this.toCurrencyInPast(aValue, aFromCurrency, aToCurrency, getPreviousDay(date), diffDaysCounter++);
        // }
      }
    }

    if (isNumber(factor) && !isNaN(factor)) {
      return factor * aValue;
    }

    // Fallback with error, if currencies are not available
    Logger.error(
      `No exchange rate has been found for ${aFromCurrency}${aToCurrency}`
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
