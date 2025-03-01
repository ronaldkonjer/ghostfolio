import { CacheService } from '@ghostfolio/api/app/cache/cache.service';
import { DataGatheringService } from '@ghostfolio/api/services/data-gathering.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data.service';
import { PrismaService } from '@ghostfolio/api/services/prisma.service';
import { OrderWithAccount } from '@ghostfolio/common/types';
import { Injectable } from '@nestjs/common';
import { DataSource, Order, Prisma, Type as TypeOfOrder } from '@prisma/client';
import Big from 'big.js';
import { endOfToday, isAfter } from 'date-fns';

import { Activity } from './interfaces/activities.interface';

@Injectable()
export class OrderService {
  public constructor(
    private readonly cacheService: CacheService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly dataGatheringService: DataGatheringService,
    private readonly prismaService: PrismaService
  ) {}

  public async order(
    orderWhereUniqueInput: Prisma.OrderWhereUniqueInput
  ): Promise<Order | null> {
    return this.prismaService.order.findUnique({
      where: orderWhereUniqueInput
    });
  }

  public async orders(params: {
    include?: Prisma.OrderInclude;
    skip?: number;
    take?: number;
    cursor?: Prisma.OrderWhereUniqueInput;
    where?: Prisma.OrderWhereInput;
    orderBy?: Prisma.OrderOrderByWithRelationInput;
  }): Promise<OrderWithAccount[]> {
    const { include, skip, take, cursor, where, orderBy } = params;

    return this.prismaService.order.findMany({
      cursor,
      include,
      orderBy,
      skip,
      take,
      where
    });
  }

  public async createOrder(data: Prisma.OrderCreateInput): Promise<Order> {
    const isDraft = isAfter(data.date as Date, endOfToday());

    // Convert the symbol to uppercase to avoid case-sensitive duplicates
    const symbol = data.symbol.toUpperCase();

    if (!isDraft) {
      // Gather symbol data of order in the background, if not draft
      this.dataGatheringService.gatherSymbols([
        {
          symbol,
          dataSource: data.dataSource,
          date: <Date>data.date
        }
      ]);
    }

    this.dataGatheringService.gatherProfileData([
      { symbol, dataSource: data.dataSource }
    ]);

    await this.cacheService.flush();

    return this.prismaService.order.create({
      data: {
        ...data,
        isDraft,
        symbol
      }
    });
  }

  public async deleteOrder(
    where: Prisma.OrderWhereUniqueInput
  ): Promise<Order> {
    return this.prismaService.order.delete({
      where
    });
  }

  public async getOrders({
    includeDrafts = false,
    types,
    userCurrency,
    userId
  }: {
    includeDrafts?: boolean;
    types?: TypeOfOrder[];
    userCurrency: string;
    userId: string;
  }): Promise<Activity[]> {
    const where: Prisma.OrderWhereInput = { userId };

    if (includeDrafts === false) {
      where.isDraft = false;
    }

    if (types) {
      where.OR = types.map((type) => {
        return {
          type: {
            equals: type
          }
        };
      });
    }

    return (
      await this.orders({
        where,
        include: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          Account: {
            include: {
              Platform: true
            }
          },
          // eslint-disable-next-line @typescript-eslint/naming-convention
          SymbolProfile: true
        },
        orderBy: { date: 'asc' }
      })
    ).map((order) => {
      const value = new Big(order.quantity).mul(order.unitPrice).toNumber();

      return {
        ...order,
        value,
        feeInBaseCurrency: this.exchangeRateDataService.toCurrency(
          order.fee,
          order.currency,
          userCurrency
        ),
        valueInBaseCurrency: this.exchangeRateDataService.toCurrency(
          value,
          order.currency,
          userCurrency
        )
      };
    });
  }

  public async updateOrder(params: {
    where: Prisma.OrderWhereUniqueInput;
    data: Prisma.OrderUpdateInput;
  }): Promise<Order> {
    const { data, where } = params;

    const isDraft = isAfter(data.date as Date, endOfToday());

    if (!isDraft) {
      // Gather symbol data of order in the background, if not draft
      this.dataGatheringService.gatherSymbols([
        {
          dataSource: <DataSource>data.dataSource,
          date: <Date>data.date,
          symbol: <string>data.symbol
        }
      ]);
    }

    await this.cacheService.flush();

    return this.prismaService.order.update({
      data: {
        ...data,
        isDraft
      },
      where
    });
  }
}
