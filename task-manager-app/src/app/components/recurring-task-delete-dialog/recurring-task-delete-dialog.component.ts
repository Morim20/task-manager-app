import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-recurring-task-delete-dialog',
  template: `
    <h2 mat-dialog-title>定期的な予定の削除</h2>
    <mat-dialog-content>
      <mat-radio-group [(ngModel)]="option">
        <mat-radio-button value="single">この予定</mat-radio-button><br>
        <mat-radio-button value="future">これ以降のすべての予定</mat-radio-button><br>
        <mat-radio-button value="all">すべての予定</mat-radio-button>
      </mat-radio-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">キャンセル</button>
      <button mat-raised-button color="primary" (click)="onOk()">OK</button>
    </mat-dialog-actions>
  `,
  standalone: true,
  imports: [
    FormsModule,
    MatRadioModule,
    MatButtonModule,
    MatDialogModule
  ]
})
export class RecurringTaskDeleteDialogComponent {
  option: 'single' | 'future' | 'all' = 'single';
  constructor(
    public dialogRef: MatDialogRef<RecurringTaskDeleteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}
  onCancel() { this.dialogRef.close(); }
  onOk() { this.dialogRef.close(this.option); }
} 