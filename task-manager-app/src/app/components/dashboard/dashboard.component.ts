// ダッシュボード
// src/app/components/dashboard/dashboard.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { RouterModule, Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TaskService } from '../../services/task.service';
import { CategoryService } from '../../services/category.service';
import { Task } from '../../models/task.model';
import { TaskFormComponent } from '../task-form/task-form.component';
import { TaskDetailDialogComponent } from '../task-detail-dialog/task-detail-dialog.component';
import { v4 as uuidv4 } from 'uuid';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from '../../services/notification.service';
import { Category } from '../../models/category.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatListModule,
    MatDialogModule,
    RouterModule
  ]
})
export class DashboardComponent implements OnInit, OnDestroy {
  tasks: Task[] = [];
  todaysTasks: Task[] = [];
  upcomingTasks: Task[] = [];
  groupedTodaysTasks: { category: string, tasks: Task[] }[] = [];
  groupedUpcomingTasks: { category: string, tasks: Task[] }[] = [];
  isDashboardPage = true;
  categories: Category[] = [];

  constructor(
    private taskSvc: TaskService,
    private categorySvc: CategoryService,
    private dialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private notificationSvc: NotificationService
  ) {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        // effort-logページかどうか判定
        this.isDashboardPage = this.router.url === '/' || this.router.url === '';
      }
    });
  }

  ngOnInit() {
    // カテゴリーを取得
    this.categorySvc.getCategories().subscribe(categories => {
      this.categories = categories;
      // タスクを取得して更新
      this.taskSvc.getTasks().subscribe((tasks: Task[]) => {
        // categoryIdが未設定のタスクを補正
        const migratedTasks = tasks.map(task => {
          if (!task.categoryId && task.category) {
            const found = categories.find(cat => cat.name === task.category);
            if (found) {
              // 必要ならDBにも保存し直す
              const updatedTask = { ...task, categoryId: found.id };
              this.taskSvc.updateTask(updatedTask);
              return updatedTask;
            }
          }
          return task;
        });
        this.tasks = migratedTasks;
        this.updateTaskLists();
      });
    });
  }

  onAdd() {
    const dialogRef = this.dialog.open(TaskFormComponent, {
      width: '600px',
      maxWidth: '95vw',
      height: 'auto',
      maxHeight: '90vh',
      panelClass: ['mat-elevation-z8'],
      autoFocus: true,
      disableClose: false,
      position: { top: '50px' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateTaskLists();
      }
    });
  }

  private updateTaskLists() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 2. 今日のタスクを厳密に抽出
    this.todaysTasks = this.tasks.filter(task => {
      if (task.completed) return false;
      if (task.dueDate) {
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === today.getTime();
      }
      return false;
    }).sort((a, b) => this.taskTimeSort(a, b));

    // 3. 今後のタスクも同様に
    this.upcomingTasks = this.tasks.filter(task => {
      if (task.completed) return false;
      if (task.dueDate) {
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() > today.getTime();
      }
      return false;
    }).sort((a, b) => this.taskTimeSort(a, b));

    // 4. グループ化・繰り返しタスクリストも同様に
    this.groupedTodaysTasks = this.groupTasksByCategory(this.todaysTasks);
    this.groupedUpcomingTasks = this.groupTasksByCategory(this.upcomingTasks);
  }

  private groupTasksByCategory(tasks: Task[]): { category: string; tasks: Task[] }[] {
    // カテゴリーIDでグループ化
    const grouped: { [key: string]: Task[] } = {};
    tasks.forEach(task => {
      const categoryId = task.categoryId || '';
      if (!grouped[categoryId]) grouped[categoryId] = [];
      grouped[categoryId].push(task);
    });

    // カテゴリー名で昇順ソート
    const sortedGroups = Object.entries(grouped).sort(([idA], [idB]) => {
      const nameA = this.getCategoryName(idA);
      const nameB = this.getCategoryName(idB);
      return nameA.localeCompare(nameB, 'ja');
    });

    // 各グループ内は時系列でソート
    return sortedGroups.map(([categoryId, tasks]) => ({
      category: categoryId,
      tasks: tasks.sort((a, b) => this.taskTimeSort(a, b))
    }));
  }

  // タスクの時系列ソート関数
  private taskTimeSort(a: Task, b: Task): number {
    // 日付指定がないものは常に一番下
    const aHasDate = !!a.dueDate;
    const bHasDate = !!b.dueDate;
    if (!aHasDate && bHasDate) return 1;
    if (aHasDate && !bHasDate) return -1;
    if (!aHasDate && !bHasDate) return a.title.localeCompare(b.title);

    // 終日タスクを次に
    const aIsAllDay = !a.startTime || a.startTime.trim() === '';
    const bIsAllDay = !b.startTime || b.startTime.trim() === '';
    if (aIsAllDay && !bIsAllDay) return -1;
    if (!aIsAllDay && bIsAllDay) return 1;
    if (aIsAllDay && bIsAllDay) return a.title.localeCompare(b.title);

    // 時間指定のあるタスクを時系列でソート
    const aTime = this.parseTimeToMinutes(a.startTime) ?? this.parseTimeToMinutes(a.dueTime) ?? this.parseTimeToMinutes(a.endTime);
    const bTime = this.parseTimeToMinutes(b.startTime) ?? this.parseTimeToMinutes(b.dueTime) ?? this.parseTimeToMinutes(b.endTime);
    if (aTime !== bTime) return aTime - bTime;

    // 同じ時刻の場合、startTimeがない（dueTimeのみ）の方を上に
    const aHasStart = !!(a.startTime && a.startTime.trim() !== '');
    const bHasStart = !!(b.startTime && b.startTime.trim() !== '');
    if (aHasStart !== bHasStart) return aHasStart ? 1 : -1;

    // さらに同じならタイトル順
    return a.title.localeCompare(b.title);
  }

  // 時刻文字列を分単位に変換（24時間表記、AM/PM、午前/午後対応）
  private parseTimeToMinutes(timeStr?: string): number {
    if (!timeStr) return 24 * 60;
    const match24 = timeStr.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (match24) {
      return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
    }
    const matchAmPm = timeStr.match(/^([01]?\d):([0-5]\d)\s*(AM|PM)$/i);
    if (matchAmPm) {
      let hour = parseInt(matchAmPm[1], 10);
      const min = parseInt(matchAmPm[2], 10);
      const isPM = matchAmPm[3].toUpperCase() === 'PM';
      if (hour === 12) hour = isPM ? 12 : 0;
      else if (isPM) hour += 12;
      return hour * 60 + min;
    }
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

  onTaskClick(task: Task) {
    this.dialog.open(TaskDetailDialogComponent, {
      data: { task },
      width: '500px'
    });
  }

  onEdit(task: Task) {
    const dialogRef = this.dialog.open(TaskFormComponent, {
      width: '600px',
      maxWidth: '95vw',
      height: 'auto',
      maxHeight: '90vh',
      panelClass: ['mat-elevation-z8'],
      autoFocus: true,
      disableClose: false,
      position: { top: '50px' },
      data: { id: task.id }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.notificationSvc.cancelNotification(task.id);

        // 元のtaskとresultをマージして保存
        const updatedTask = { ...task, ...result };

        this.taskSvc.updateTask(updatedTask).then(() => {
          if (updatedTask.notification?.enabled && updatedTask.dueDate && updatedTask.dueTime) {
            this.notificationSvc.scheduleNotification(updatedTask, updatedTask.notification);
          }
          this.snackBar.open('タスクを更新しました', '閉じる', { duration: 3000 });
          this.updateTaskLists();
        });
      }
    });
  }

  onDuplicate(task: Task) {
    const duplicatedTask = { ...task, id: uuidv4() };
    this.taskSvc.addTask(duplicatedTask).then(() => {
      this.snackBar.open('タスクを複製しました', '閉じる', { duration: 3000 });
      this.updateTaskLists();
    });
  }

  onDelete(id: string) {
    // カレンダー以外では繰り返しタスクも親タスクごと削除
    this.taskSvc.deleteTask(id).then(() => {
      this.snackBar.open('タスクを削除しました', '閉じる', { duration: 3000 });
      this.updateTaskLists();
    });
  }

  openNewTaskDialog() {
    const dialogRef = this.dialog.open(TaskFormComponent, {
      width: '600px',
      maxWidth: '95vw',
      height: 'auto',
      maxHeight: '90vh',
      panelClass: ['mat-elevation-z8'],
      autoFocus: true,
      disableClose: false,
      position: { top: '50px' },
      data: {
        type: 'todo'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.taskSvc.addTask(result).then(() => {
          this.snackBar.open('タスクを追加しました', '閉じる', { duration: 3000 });
          this.updateTaskLists();
        });
      }
    });
  }

  getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return '未分類';
    const category = this.categories.find(cat => cat.id === categoryId);
    return category ? category.name : '';
  }

  ngOnDestroy() {
    if (this.dialog) {
      this.dialog.closeAll();
    }
  }
}