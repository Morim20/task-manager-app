import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-status-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule
  ],
  template: `
    <h2 mat-dialog-title>新しいステータスを追加</h2>
    <mat-dialog-content>
      <mat-form-field appearance="fill" class="full-width">
        <mat-label>ステータス名</mat-label>
        <input matInput [(ngModel)]="statusName" placeholder="例: レビュー中">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">キャンセル</button>
      <button mat-raised-button color="primary" (click)="onSubmit()" [disabled]="!statusName">
        追加
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width {
      width: 100%;
      min-width: 300px;
    }
    mat-dialog-content {
      padding-top: 20px;
    }
  `]
})
export class StatusFormDialogComponent {
  statusName: string = '';

  constructor(
    private dialogRef: MatDialogRef<StatusFormDialogComponent>
  ) {}

  onSubmit() {
    if (this.statusName.trim()) {
      this.dialogRef.close(this.statusName);
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
} 