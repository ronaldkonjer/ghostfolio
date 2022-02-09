import * as currencies from '@dinero.js/currencies';
import { DataSource } from '@prisma/client';
import { addDays, getDate, getMonth, getYear, parse, subDays } from 'date-fns';

import { ghostfolioScraperApiSymbolPrefix } from './config';
import { Constants } from '@ghostfolio/common/constants';

export function capitalize(aString: string) {
  return aString.charAt(0).toUpperCase() + aString.slice(1).toLowerCase();
}

export function decodeDataSource(encodedDataSource: string) {
  return Buffer.from(encodedDataSource, 'hex').toString();
}

export function downloadAsFile(
  aContent: unknown,
  aFileName: string,
  aContentType: string
) {
  const a = document.createElement('a');
  const file = new Blob([JSON.stringify(aContent, undefined, '  ')], {
    type: aContentType
  });
  a.href = URL.createObjectURL(file);
  a.download = aFileName;
  a.click();
}

export function encodeDataSource(aDataSource: DataSource) {
  return Buffer.from(aDataSource, 'utf-8').toString('hex');
}

export function getBackgroundColor() {
  return getCssVariable(
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? '--dark-background'
      : '--light-background'
  );
}

export function getCssVariable(aCssVariable: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(
    aCssVariable
  );
}

export function getTextColor() {
  const cssVariable = getCssVariable(
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? '--light-primary-text'
      : '--dark-primary-text'
  );

  const [r, g, b] = cssVariable.split(',');

  return `${r}, ${g}, ${b}`;
}

export function getToday() {
  const year = getYear(new Date());
  const month = getMonth(new Date());
  const day = getDate(new Date());

  return new Date(Date.UTC(year, month, day));
}

export function getUtc(aDateString: string) {
  const [yearString, monthString, dayString] = aDateString.split('-');

  return new Date(
    Date.UTC(
      parseInt(yearString, 10),
      parseInt(monthString, 10) - 1,
      parseInt(dayString, 10)
    )
  );
}

export function getYesterday() {
  const year = getYear(new Date());
  const month = getMonth(new Date());
  const day = getDate(new Date());

  return subDays(new Date(Date.UTC(year, month, day)), 1);
}

export function getNextDay(aDateString: string) {
  console.log(aDateString);
  return addDays(getUtc(aDateString), 1);
}

export function getPreviousDay(aDateString: string) {
  return subDays(getUtc(aDateString), 1);
}

export function parseDate(aDateString: string) {
  return parse(aDateString, Constants.DATE_FORMAT, new Date());
}

// parse a date in yyyy-mm-dd format
// export function parseDDMMYYYYDateFormat(aDateString: string, separator: string): Date {
//     const parts: string[] = aDateString.split(separator);
//     if(parts.length > 1)
//       return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10)-1, 10, parseInt(parts[0], 10));
//     else {
//       throw new Error();
//     }
// }

export function isValidDate(value: any): value is Date {
  return value instanceof Date && !isNaN(value as any);
}

// Returns an array of dates between the two dates
export function getDateInRange (startDate: Date, endDate: Date) {
  const dates: Date[] = []
  let currentDate: Date = startDate

  const addDays = function (days) {
    const date: Date = new Date(this.valueOf())
    date.setDate(date.getDate() + days)
    return date
  }
  while (currentDate <= endDate) {
    dates.push(currentDate)
    currentDate = addDays.call(currentDate, 1)
  }
  return dates
}


export function groupBy<T, K extends keyof T>(
  key: K,
  arr: T[]
): Map<T[K], T[]> {
  const map = new Map<T[K], T[]>();
  arr.forEach((t) => {
    if (!map.has(t[key])) {
      map.set(t[key], []);
    }
    map.get(t[key])!.push(t);
  });
  return map;
}

export function isCurrency(aSymbol = '') {
  return currencies[aSymbol];
}

export function isGhostfolioScraperApiSymbol(aSymbol = '') {
  return aSymbol.startsWith(ghostfolioScraperApiSymbolPrefix);
}

export function resetHours(aDate: Date) {
  const year = getYear(aDate);
  const month = getMonth(aDate);
  const day = getDate(aDate);

  return new Date(Date.UTC(year, month, day));
}

export function resolveFearAndGreedIndex(aValue: number) {
  if (aValue <= 25) {
    return { emoji: '🥵', text: 'Extreme Fear' };
  } else if (aValue <= 45) {
    return { emoji: '😨', text: 'Fear' };
  } else if (aValue <= 55) {
    return { emoji: '😐', text: 'Neutral' };
  } else if (aValue < 75) {
    return { emoji: '😜', text: 'Greed' };
  } else {
    return { emoji: '🤪', text: 'Extreme Greed' };
  }
}

export function prettifySymbol(aSymbol: string): string {
  return aSymbol?.replace(ghostfolioScraperApiSymbolPrefix, '');
}



