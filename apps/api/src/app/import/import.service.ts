import { OrderService } from '@ghostfolio/api/app/order/order.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { Injectable, Logger } from '@nestjs/common';
import { Order } from '@prisma/client';
import { isSameDay, parseISO } from 'date-fns';
import { IDataProviderResponse } from '@ghostfolio/api/services/interfaces/interfaces';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data.service';
import { OrderWithAccount } from '@ghostfolio/common/types';

@Injectable()
export class ImportService {
  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly dataProviderService: DataProviderService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly orderService: OrderService
  ) {}

  public async import({
    orders,
    userId
  }: {
    orders: Partial<Order>[];
    userId: string;
  }): Promise<void> {
    for (const order of orders) {
      order.dataSource =
        order.dataSource ?? this.dataProviderService.getPrimaryDataSource();
    }

    const existingOrders = await this.orderService.orders({
      orderBy: { date: 'desc' },
      where: { userId }
    });

    await this.validateOrders({ existingOrders, orders, userId });

    for (let {
      accountId,
      currency,
      dataSource,
      date,
      fee,
      quantity,
      symbol,
      type,
      unitPrice
    } of orders) {
      // if imported currency is not equal to SymbolProfile currency
      const result = await this.dataProviderService.get([
        { dataSource, symbol }
      ]);

      if (result[symbol].currency !== currency) {
        unitPrice = this.foreignExchange(
          unitPrice,
          result,
          symbol,
          currency,
          date
        );
        fee = this.foreignExchange(fee, result, symbol, currency, date);
        currency = result[symbol].currency;
      }

      const duplicateOrder = this.findDuplicateOrder(
        existingOrders,
        currency,
        dataSource,
        date,
        fee,
        quantity,
        symbol,
        type,
        unitPrice
      );

      if (duplicateOrder) {
        continue;
      } else {
        await this.orderService.createOrder({
          accountId,
          currency,
          dataSource,
          fee,
          quantity,
          symbol,
          type,
          unitPrice,
          userId,
          date: parseISO(<string>(<unknown>date)),
          SymbolProfile: {
            connectOrCreate: {
              create: {
                dataSource,
                symbol
              },
              where: {
                dataSource_symbol: {
                  dataSource,
                  symbol
                }
              }
            }
          },
          User: { connect: { id: userId } }
        });
      }
    }
  }

  private async validateOrders({
    existingOrders,
    orders,
    userId
  }: {
    existingOrders: Order[];
    orders: Partial<Order>[];
    userId: string;
  }) {
    if (
      orders?.length > this.configurationService.get('MAX_ORDERS_TO_IMPORT')
    ) {
      throw new Error(
        `Too many transactions (${this.configurationService.get(
          'MAX_ORDERS_TO_IMPORT'
        )} at most)`
      );
    }

    for (const [
      index,
      { currency, dataSource, date, fee, quantity, symbol, type, unitPrice }
    ] of orders.entries()) {
      const duplicateOrder = this.findDuplicateOrder(
        existingOrders,
        currency,
        dataSource,
        date,
        fee,
        quantity,
        symbol,
        type,
        unitPrice
      );

      if (duplicateOrder) {
        Logger.warn(
          `orders.${index} is a duplicate transaction, order: ` +
            JSON.stringify(orders[index])
        );
        // throw new (`orders.${index} is a duplicate transaction`);
      }

      const result = await this.dataProviderService.get([
        { dataSource, symbol }
      ]);

      if (result[symbol] === undefined) {
        throw new Error(
          `orders.${index}.symbol ("${symbol}") is not valid for the specified data source ("${dataSource}")`
        );
      }

      if (result[symbol].currency !== currency) {
        Logger.warn(
          `orders.${index}.currency ("${currency}") does not match with "${result[symbol].currency}" order: ` +
            JSON.stringify(orders[index])
        );
      }
    }
  }

  private findDuplicateOrder(
    existingOrders: OrderWithAccount[],
    currency,
    dataSource,
    date,
    fee,
    quantity,
    symbol,
    type,
    unitPrice
  ) {
    const duplicateOrder = existingOrders.find((order) => {
      return (
        order.currency === currency &&
        order.dataSource === dataSource &&
        isSameDay(order.date, parseISO(<string>(<unknown>date))) &&
        order.fee === fee &&
        order.quantity === quantity &&
        order.symbol === symbol &&
        order.type === type &&
        order.unitPrice === unitPrice
      );
    });
    return duplicateOrder;
  }

  private foreignExchange(
    value,
    result: { [result: string]: IDataProviderResponse },
    symbol,
    currency,
    date
  ) {
    return result[symbol].currency !== currency
      ? this.exchangeRateDataService.toCurrencyInPast(
          value,
          currency,
          result[symbol].currency,
          date
        )
      : value;
  }
}
