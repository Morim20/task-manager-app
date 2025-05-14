import { Component, Inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { Task } from '../../models/task.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { TaskService } from '../../services/task.service';
import { v4 as uuidv4 } from 'uuid';
import { TaskFormDialogComponent } from '../task-form-dialog/task-form-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../models/category.model';
import { RecurringTaskDeleteDialogComponent } from '../recurring-task-delete-dialog/recurring-task-delete-dialog.component';
import { format } from 'date-fns';

@Component({
  selector: 'app-task-detail-dialog',
  template: `
    <div class="task-detail-dialog-wrapper">
      <div class="dialog-header">
        <h2 mat-dialog-title>{{ data.task.title }}</h2>
        <div class="action-buttons">
          <button mat-icon-button class="small-icon-button" matTooltip="編集" (click)="onEdit()">
            <mat-icon class="small-icon">edit</mat-icon>
          </button>
          <button mat-icon-button class="small-icon-button" matTooltip="複製" (click)="onDuplicate()">
            <mat-icon class="small-icon">content_copy</mat-icon>
          </button>
          <button mat-icon-button class="small-icon-button" matTooltip="削除" color="warn" (click)="onDelete()">
            <mat-icon class="small-icon">delete</mat-icon>
          </button>
        </div>
      </div>
      <mat-dialog-content class="content-wrapper">
        <div class="task-info">
          <p *ngIf="data.task.description">
            <strong>説明：</strong><br>
            {{ data.task.description }}
          </p>
          
          <p>
            <strong>日付：</strong><br>
            {{ data.task.dueDate | date:'yyyy年M月d日' }}
          </p>

          <p *ngIf="data.task.startTime && data.task.endTime">
            <strong>時間：</strong><br>
            {{ data.task.startTime }} - {{ data.task.endTime }}
          </p>
          
          <p *ngIf="data.task.dueTime && !data.task.startTime">
            <strong>期限時刻：</strong><br>
            {{ data.task.dueTime }}
          </p>

          <p *ngIf="!data.task.startTime && !data.task.endTime && !data.task.dueTime">
            <strong>時間：</strong><br>
            終日
          </p>

          <p *ngIf="data.task.repeat?.enabled">
            <strong>繰り返し：</strong><br>
            {{ getRepeatText() }}
          </p>

          <p *ngIf="data.task.noTask">
            <strong>タイプ：</strong><br>
            予定枠
          </p>
        </div>
        <div>
          <strong>カテゴリー:</strong>
          <ng-container *ngIf="categories.length > 0; else loading">
            {{ getCategoryName(data.task.categoryId) }}
          </ng-container>
          <ng-template #loading>ロード中...</ng-template>
        </div>
        <div><strong>締め切り日:</strong> {{ data.task.dueDate | date:'yyyy/MM/dd' }}</div>
        <div *ngIf="data.task.targetCompletionDate"><strong>目標完了日:</strong> {{ data.task.targetCompletionDate | date:'yyyy/MM/dd' }}</div>
        <div *ngIf="data.task.noTask !== undefined"><strong>ノータスク:</strong> {{ data.task.noTask ? 'ON' : 'OFF' }}</div>
        <div><strong>ラベル:</strong> <span *ngFor="let label of data.task.labels">{{ label.name }} </span></div>
        <div><strong>リンク:</strong> <a *ngFor="let link of data.task.relatedLinks" [href]="link" target="_blank">{{ link }}</a></div>
        <div class="detail-row">
          <div class="detail-label">通知</div>
          <div class="detail-value">
            <span *ngIf="data.task.notification?.enabled">
              {{ getNotificationTimingText(data.task.notification) }}
            </span>
            <span *ngIf="!data.task.notification?.enabled">OFF</span>
          </div>
        </div>
        <div *ngIf="data.task.subTasks && data.task.subTasks.length">
          <strong>サブタスク:</strong>
          <ul>
            <li *ngFor="let sub of data.task.subTasks">{{ sub.title }} <span *ngIf="sub.completed">(完了)</span></li>
          </ul>
        </div>
        <div><strong>メモ:</strong> {{ data.task.memo }}</div>
      </mat-dialog-content>
      <div class="form-footer">
        <button mat-stroked-button color="primary" (click)="dialogRef.close()">閉じる</button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    :host ::ng-deep .mat-mdc-dialog-container {
      overflow: visible !important;
      max-width: none !important;
      width: auto !important;
      padding: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    :host ::ng-deep .mdc-dialog__surface {
      overflow: visible !important;
      background: none !important;
      box-shadow: none !important;
    }

    .task-detail-dialog-wrapper {
      border: 3px solid #1976d2;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 4px 24px rgba(0,0,0,0.25);
      box-sizing: border-box;
      width: 500px;
      max-width: 98vw;
      min-height: 400px;
      max-height: 80vh;
      margin: 0;
      padding: 24px 24px 8px 24px;
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .dialog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }

    h2[mat-dialog-title] {
      margin: 0;
      padding: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: #1976d2;
      word-wrap: break-word;
      word-break: break-all;
      flex: 1;
      min-width: 0;
      line-height: 1.4;
    }

    .action-buttons {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .content-wrapper {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 16px 0 80px 0; /* フッターの高さ＋余白 */
      min-height: 0;
      border: none !important;
      box-shadow: none !important;
      margin-bottom: 0 !important;
      padding-bottom: 80px !important;
    }

    mat-dialog-content {
      border: none !important;
      box-shadow: none !important;
      margin-bottom: 0 !important;
      padding-bottom: 0 !important;
    }

    mat-divider, .mat-divider {
      display: none !important;
      border: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    .form-footer {
      position: sticky;
      bottom: 0;
      left: 0;
      width: 100%;
      min-height: 56px;
      padding: 12px 4px;
      background: #fff;
      /* border-top: 1.5px solid #e0e0e0; */
      /* box-shadow: 0 -2px 10px rgba(0,0,0,0.08); */
      z-index: 10;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
    }
    .form-footer button {
      min-width: 64px;
      min-height: 36px;
      font-size: 0.98rem;
      margin-left: 8px;
    }

    .small-icon-button {
      width: 32px !important;
      height: 32px !important;
      line-height: 32px !important;
      padding: 0 !important;
    }

    .small-icon {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
      line-height: 18px !important;
    }

    .detail-row {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }

    .detail-label {
      font-weight: 600;
      min-width: 80px;
      color: #666;
    }

    .detail-value {
      flex: 1;
      text-align: left;
      color: #444;
    }

    .notification-minutes {
      font-size: 0.8rem;
      color: #666;
    }
  `],
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule
  ]
})
export class TaskDetailDialogComponent {
  categories: Category[] = [];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { task: Task, date?: Date, fromCalendar?: boolean },
    public dialogRef: MatDialogRef<TaskDetailDialogComponent>,
    private taskSvc: TaskService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private categorySvc: CategoryService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.categorySvc.getCategories().subscribe({
      next: categories => {
        this.ngZone.run(() => {
          this.categories = categories;
          this.cdr.detectChanges();
        });
      },
      error: err => {
        console.error('カテゴリ取得エラー:', err);
      }
    });
  }

  getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return '未設定';
    if (!this.categories || this.categories.length === 0) return '[カテゴリ未取得]';
    const category = this.categories.find(cat => cat.id === categoryId);
    return category ? category.name : '未設定';
  }

  getRepeatText(): string {
    const repeat = this.data.task.repeat;
    if (!repeat) return '';

    switch (repeat.frequency) {
      case '毎日':
        return '毎日';
      case '毎週':
        return `毎週${repeat.daysOfWeek?.map(d => ['日', '月', '火', '水', '木', '金', '土'][d]).join('・') || ''}曜日`;
      case '毎月':
        return `毎月${repeat.dayOfMonth}日`;
      case '毎年':
        return `毎年${repeat.month != null ? repeat.month + 1 : ''}月${repeat.dayOfMonth}日`;
      default:
        return '';
    }
  }

  onEdit() {
    this.dialogRef.close();
    setTimeout(() => {
      this.dialog.open(TaskFormDialogComponent, {
        width: '500px',
        maxHeight: '80vh',
        panelClass: ['task-form-dialog', 'mat-elevation-z8'],
        autoFocus: true,
        disableClose: true,
        position: { top: '50px' },
        data: { id: this.data.task.id, task: this.data.task }
      }).afterClosed().subscribe((result: Task | undefined) => {
        if (result) {
          this.taskSvc.updateTask(result).then(() => {
            this.snackBar.open('タスクを更新しました', '閉じる', { duration: 3000 });
          });
        }
      });
    }, 200);
  }

  onDuplicate() {
    const duplicatedTask = { ...this.data.task, id: uuidv4() };
    this.taskSvc.addTask(duplicatedTask).then(() => {
      this.snackBar.open('タスクを複製しました', '閉じる', { duration: 3000 });
      this.dialogRef.close();
    });
  }

  onDelete() {
    console.log('onDelete: data.date =', this.data.date, 'task.dueDate =', this.data.task.dueDate);
    if (this.data.fromCalendar && this.data.task.repeat?.enabled) {
      const dialogRef = this.dialog.open(RecurringTaskDeleteDialogComponent, {
        data: { task: this.data.task, date: this.data.date }
      });
      dialogRef.afterClosed().subscribe(option => {
        if (!option) return;
        if (option === 'single') {
          // 例外日として追加
          let dateObj: Date | undefined = undefined;
          if (this.data.date instanceof Date) {
            dateObj = this.data.date;
          } else if (this.data.task.dueDate) {
            dateObj = new Date(this.data.task.dueDate);
          } else {
            dateObj = new Date(); // fallback: 今日
          }
          if (dateObj) {
            const dateStr = format(dateObj, 'yyyy-MM-dd');
            this.taskSvc.addExDate(this.data.task.id, dateStr).then(() => {
              this.snackBar.open('この予定だけ削除しました', '閉じる', { duration: 3000 });
              this.dialogRef.close();
            });
          } else {
            this.snackBar.open('日付情報がありません。', '閉じる', { duration: 3000 });
          }
        }
        else if (option === 'future') {
          let dateObj: Date | undefined = undefined;
          if (this.data.date instanceof Date) {
            dateObj = this.data.date;
          } else if (this.data.task.dueDate) {
            dateObj = new Date(this.data.task.dueDate);
          } else {
            dateObj = new Date(); // fallback: 今日
          }
          if (dateObj) {
            const dateStr = format(dateObj, 'yyyy-MM-dd');
            this.taskSvc.cutRepeatEndDate(this.data.task.id, dateStr).then(() => {
              this.snackBar.open('これ以降の予定を削除しました', '閉じる', { duration: 3000 });
              this.dialogRef.close();
            });
          } else {
            this.snackBar.open('日付情報がありません。', '閉じる', { duration: 3000 });
          }
        } else if (option === 'all') {
          this.taskSvc.deleteTask(this.data.task.id).then(() => {
            this.snackBar.open('すべての予定を削除しました', '閉じる', { duration: 3000 });
            this.dialogRef.close();
          });
        }
      });
    } else {
      if (confirm('本当に削除しますか？')) {
        this.taskSvc.deleteTask(this.data.task.id).then(() => {
          this.snackBar.open('タスクを削除しました', '閉じる', { duration: 3000 });
          this.dialogRef.close();
        });
      }
    }
  }

  getNotificationTimingText(notification: any): string {
    if (!notification) return '';
    if (notification.timing === 'カスタム') {
      return `カスタム（${notification.customMinutes ?? '?'}分前）`;
    }
    return notification.timing;
  }
} 