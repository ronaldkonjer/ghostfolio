import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterModule } from '@angular/router';
import { GfPositionDetailDialogModule } from '@ghostfolio/client/components/position/position-detail-dialog/position-detail-dialog.module';
import { GfSymbolModule } from '@ghostfolio/client/pipes/symbol/symbol.module';
import { GfNoTransactionsInfoModule } from '@ghostfolio/ui/no-transactions-info';
import { GfValueModule } from '@ghostfolio/ui/value';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import { GfSymbolIconModule } from '../symbol-icon/symbol-icon.module';
import { PositionsTableComponent } from './positions-table.component';

@NgModule({
  declarations: [PositionsTableComponent],
  exports: [PositionsTableComponent],
  imports: [
    CommonModule,
    GfNoTransactionsInfoModule,
    GfPositionDetailDialogModule,
    GfSymbolIconModule,
    GfSymbolModule,
    GfValueModule,
    MatButtonModule,
    MatDialogModule,
    MatInputModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
    NgxSkeletonLoaderModule,
    RouterModule
  ],
  providers: [],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class GfPositionsTableModule {}
