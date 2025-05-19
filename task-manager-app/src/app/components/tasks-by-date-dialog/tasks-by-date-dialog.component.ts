// カレンダーで選んだ日付のタスクをモーダル表示する画面のTypeScript

import { Component, Inject, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TaskService } from '../../services/task.service';
import { Router } from '@angular/router';
import { Task } from '../../models/task.model';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TaskFormComponent } from '../task-form/task-form.component';
import { v4 as uuidv4 } from 'uuid';
import { MatDividerModule } from '@angular/material/divider';

interface DialogData {
  date: Date;
  tasks: Task[];
}

@Component({
  selector: 'app-tasks-by-date-dialog',
  templateUrl: './tasks-by-date-dialog.component.html',
  styleUrls: ['./tasks-by-date-dialog.component.css'],
  imports: [
    CommonModule,
    MatDialogModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule
  ],
  standalone: true
})
export class TasksByDateDialogComponent implements OnDestroy {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private dialogRef: MatDialogRef<TasksByDateDialogComponent>,
    private router: Router,
    private svc: TaskService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  onEdit(id: string) {
    this.dialogRef.close();
    this.router.navigate(['/tasks', id, 'edit']);
  }

  onDelete(id: string) {
    // カレンダー以外では繰り返しタスクも親タスクごと削除
    if (confirm('本当に削除しますか？')) {
      this.svc.deleteTask(id).then(() => {
        this.snackBar.open('タスクを削除しました', '閉じる', { duration: 3000 });
        this.dialogRef.close('deleted');
      });
    }
  }

  onEditTask(task: Task) {
    const dialogRef = this.dialog.open(TaskFormComponent, {
      width: '600px',
      maxWidth: '95vw',
      height: 'auto',
      maxHeight: '90vh',
      panelClass: ['mat-elevation-z8'],
      autoFocus: true,
      disableClose: true,
      position: { top: '50px' },
      data: { id: task.id }
    });

    dialogRef.afterClosed().subscribe((result: Task | undefined) => {
      if (result) {
        // 元のtaskとresultをマージして保存
        const updatedTask = { ...task, ...result };
        this.svc.updateTask(updatedTask).then(() => {
          this.snackBar.open('タスクを更新しました', '閉じる', { duration: 3000 });
          this.dialogRef.close('updated');
        });
      }
    });
  }

  onDuplicate(task: Task) {
    const duplicatedTask = { ...task, id: uuidv4() };
    this.svc.addTask(duplicatedTask).then(() => {
      this.snackBar.open('タスクを複製しました', '閉じる', { duration: 3000 });
      this.dialogRef.close('duplicated');
    });
  }

  // 終日タスクを取得
  getAllDayTasks(): Task[] {
    return this.data.tasks
      .filter(task =>
        (!task.startTime || task.startTime.trim() === '') &&
        (!task.endTime || task.endTime.trim() === '') &&
        (!task.dueTime || task.dueTime.trim() === '')
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  // 時間指定タスクを取得
  getTimedTasks(): Task[] {
    return this.data.tasks
      .filter(task =>
        (task.startTime && task.startTime.trim() !== '') ||
        (task.endTime && task.endTime.trim() !== '') ||
        (task.dueTime && task.dueTime.trim() !== '')
      )
      .sort((a, b) => {
        const aTime = this.taskTimeToMinutes(a);
        const bTime = this.taskTimeToMinutes(b);
        if (aTime !== bTime) return aTime - bTime;

        // 同じ時刻の場合、startTimeがない（dueTimeのみ）の方を上に
        const aHasStart = !!(a.startTime && a.startTime.trim() !== '');
        const bHasStart = !!(b.startTime && b.startTime.trim() !== '');
        if (aHasStart !== bHasStart) return aHasStart ? 1 : -1;

        // さらに同じならタイトル順
        return a.title.localeCompare(b.title);
      });
  }

  // タスクの時刻を分単位で返すユーティリティ
  private taskTimeToMinutes(task: Task): number {
    if (task.startTime && task.startTime.trim() !== '') {
      return this.parseTimeToMinutes(task.startTime.trim());
    }
    if (task.dueTime && task.dueTime.trim() !== '') {
      return this.parseTimeToMinutes(task.dueTime.trim());
    }
    if (task.endTime && task.endTime.trim() !== '') {
      return this.parseTimeToMinutes(task.endTime.trim());
    }
    return 24 * 60; // 終日扱いは一番下
  }

  // 時刻文字列を分単位に変換（24時間表記、AM/PM、午前/午後対応）
  private parseTimeToMinutes(timeStr: string): number {
    if (!timeStr) return 24 * 60;
    // 24時間表記
    const match24 = timeStr.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (match24) {
      return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
    }
    // AM/PM表記
    const matchAmPm = timeStr.match(/^([01]?\d):([0-5]\d)\s*(AM|PM)$/i);
    if (matchAmPm) {
      let hour = parseInt(matchAmPm[1], 10);
      const min = parseInt(matchAmPm[2], 10);
      const isPM = matchAmPm[3].toUpperCase() === 'PM';
      if (hour === 12) hour = isPM ? 12 : 0;
      else if (isPM) hour += 12;
      return hour * 60 + min;
    }
    // 午前/午後表記
    const matchJp = timeStr.match(/^(午前|午後)?(\d{1,2}):(\d{2})$/);
    if (matchJp) {
      let hour = parseInt(matchJp[2], 10);
      const min = parseInt(matchJp[3], 10);
      if (matchJp[1] === '午後' && hour < 12) hour += 12;
      if (matchJp[1] === '午前' && hour === 12) hour = 0;
      return hour * 60 + min;
    }
    return 24 * 60;
  }

  ngOnDestroy() {
    if (this.dialog) {
      this.dialog.closeAll();
    }
  }
}
