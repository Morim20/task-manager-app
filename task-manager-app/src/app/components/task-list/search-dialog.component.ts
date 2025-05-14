import { Component, Output, EventEmitter } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-search-dialog',
  template: `
    <div style="padding:24px; min-width:260px;">
      <h3 style="margin-top:0; color:#1976d2;">タスク検索</h3>
      <input [(ngModel)]="keyword" (keyup.enter)="onSearch()" placeholder="キーワードで検索" style="width:100%; padding:8px; margin-bottom:12px;">
      <div style="text-align:right;">
        <button mat-button (click)="onClose()">閉じる</button>
        <button mat-raised-button color="primary" (click)="onSearch()">検索</button>
      </div>
    </div>
  `,
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatInputModule, MatDialogModule]
})
export class SearchDialogComponent {
  keyword: string = '';
  constructor(private dialogRef: MatDialogRef<SearchDialogComponent>) {}

  onSearch() {
    this.dialogRef.close(this.keyword);
  }
  onClose() {
    this.dialogRef.close();
  }
} 