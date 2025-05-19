import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Category } from '../../models/task.model';
import { Task } from '../../models/task.model';
import { CategoryService } from '../../services/category.service';
import { TaskService } from '../../services/task.service';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { BehaviorSubject, Subscription, Subject, takeUntil } from 'rxjs';
import { NgZone } from '@angular/core';
import { Category as CategoryModel } from '../../models/category.model';
import { MatDialog } from '@angular/material/dialog';
import { TaskDetailDialogComponent } from '../task-detail-dialog/task-detail-dialog.component';

@Component({
  selector: 'app-project-detail',
  templateUrl: './project-detail.component.html',
  styleUrls: ['./project-detail.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatProgressBarModule,
    MatListModule,
    MatChipsModule,
    MatButtonModule,
    RouterModule,
    MatIconModule,
    NgxChartsModule,
    MatCheckboxModule
  ]
})
export class ProjectDetailComponent implements OnInit, OnDestroy {
  category?: Category;
  categoryId: string | null = null;
  tasks: Task[] = [];
  memoValue: string = '';
  editMemoValue: string = '';
  isSavingMemo = false;
  isEditingMemo = false;
  editingTaskId: string | null = null;
  editTaskTitle: string = '';
  editTaskDueDate: Date | undefined = undefined;
  editTaskStatus: string = '';
  links: { label: string; url: string }[] = [];
  showLinkForm = false;
  newLinkLabel = '';
  newLinkUrl = '';
  categoryTasks: Task[] = [];
  pieChartData: any[] = [];
  barChartData: any[] = [];
  totalCompleted = 0;
  completedCount = 0;
  totalCount = 0;
  progressValue = 0;
  allCategories: CategoryModel[] = [];
  
  // トリガーで強制的に更新を行うためのSubject
  private refreshTrigger = new BehaviorSubject<boolean>(true);
  // コンポーネント破棄時に全てのサブスクリプション解除用
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private categorySvc: CategoryService,
    private taskSvc: TaskService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private dialog: MatDialog
  ) {
    this.categorySvc.getCategories().subscribe(categories => {
      this.allCategories = categories;
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || this.route.snapshot.paramMap.get('categoryId');
    this.categoryId = id;
    console.log('ページID:', id);
    
    if (id) {
      this.loadCategoryData(id);
      
      // 更新トリガーを監視
      this.refreshTrigger
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          if (this.categoryId) {
            this.loadCategoryData(this.categoryId);
          }
        });
    }
  }

  loadCategoryData(categoryId: string) {
    this.categorySvc.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe(categories => {
        const foundCategory = categories.find(c => c.id === categoryId);
        
        if (foundCategory) {
          this.category = foundCategory;
          this.memoValue = this.category.memo || '';
          if (!this.isEditingMemo) {
            this.editMemoValue = this.memoValue;
          }
          this.links = this.category.links ? [...this.category.links] : [];
          console.log('category:', this.category);
          
          this.loadTasksData();
        }
      });
  }

  loadTasksData() {
    this.taskSvc.getTasks()
      .pipe(takeUntil(this.destroy$))
      .subscribe(tasks => {
        // カテゴリーIDベースで抽出
        this.categoryTasks = tasks.filter(t => t.categoryId === this.category?.id);
        this.tasks = this.categoryTasks.filter(t => !t.completed).sort((a, b) => {
          // 日付順（dueDate→targetCompletionDateが近い順、どちらも無い場合は下）
          const aDate = a.dueDate ? new Date(a.dueDate) : null;
          const bDate = b.dueDate ? new Date(b.dueDate) : null;
          if (aDate && bDate) return aDate.getTime() - bDate.getTime();
          if (aDate) return -1;
          if (bDate) return 1;
          return a.title.localeCompare(b.title);
        });
        this.updateCharts();
        // 明示的に変更検知をトリガー
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy() {
    if (this.dialog) {
      this.dialog.closeAll();
    }
    // すべてのサブスクリプションをクリーンアップ
    this.destroy$.next();
    this.destroy$.complete();
  }

  updateCharts() {
    const completed = this.categoryTasks.filter(t => t.completed || t.status === '完了').length;
    const uncompleted = this.categoryTasks.length - completed;
    this.pieChartData = [
      { name: '完了', value: completed },
      { name: '未完了', value: uncompleted }
    ];
    this.totalCompleted = completed;
    this.completedCount = completed;
    this.totalCount = this.categoryTasks.length;
    this.progressValue = this.totalCount > 0 ? (completed / this.totalCount) * 100 : 0;

    // 完了日ごとの棒グラフ
    const doneMap: { [date: string]: number } = {};
    this.categoryTasks.forEach(t => {
      if (t.completed || t.status === '完了') {
        const date = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '';
        if (date) doneMap[date] = (doneMap[date] || 0) + 1;
      }
    });
    this.barChartData = Object.keys(doneMap).sort().map(date => ({
      name: date,
      value: doneMap[date]
    }));
  }

  startEditMemo() {
    this.isEditingMemo = true;
    this.editMemoValue = this.memoValue;
    // 編集開始時に変更検知をトリガー
    this.cdr.detectChanges();
  }

  cancelEditMemo() {
    this.isEditingMemo = false;
    this.editMemoValue = this.memoValue;
    // キャンセル時に変更検知をトリガー
    this.cdr.detectChanges();
  }

  saveMemo() {
    if (!this.category) return;

    // フォーム送信をクリックした時点での値を保持
    const newMemoValue = this.editMemoValue;
    this.isSavingMemo = true;
    this.cdr.detectChanges(); // 即時にローディング状態を反映

    this.ngZone.run(() => {
      // まず、編集状態をfalseに設定（UIを即時更新）
      this.isEditingMemo = false;
      this.memoValue = newMemoValue;
      this.cdr.detectChanges();

      // サーバー側の更新処理を実行
      const updated = { ...this.category!, memo: newMemoValue, updatedAt: new Date().toISOString() };
      this.categorySvc.update(updated)
        .then(() => {
          // 保存成功後、カテゴリデータを再読み込み
          if (this.categoryId) {
            this.loadCategoryData(this.categoryId);
          }
        })
        .catch((err: any) => {
          console.error('メモの保存に失敗:', err);
          alert('メモの保存に失敗しました: ' + err);
          // エラー時は編集状態に戻す
          this.isEditingMemo = true;
          this.cdr.detectChanges();
        })
        .finally(() => {
          this.isSavingMemo = false;
          this.cdr.detectChanges();
        });
    });
  }

  startEditTask(task: Task) {
    this.dialog.open(TaskDetailDialogComponent, {
      width: '500px',
      maxHeight: '80vh',
      panelClass: ['task-detail-dialog', 'mat-elevation-z8'],
      autoFocus: true,
      disableClose: false,
      position: { top: '50px' },
      data: { task }
    });
  }

  cancelEditTask() {
    this.editingTaskId = null;
    this.editTaskTitle = '';
    this.editTaskDueDate = undefined;
    this.editTaskStatus = '';
    // キャンセル時に変更検知をトリガー
    this.cdr.detectChanges();
  }

  async saveEditTask(task: Task) {
    const updated: Task = {
      ...task,
      ...{
        title: this.editTaskTitle,
        dueDate: this.editTaskDueDate,
        status: this.editTaskStatus,
        updatedAt: new Date().toISOString()
      }
    };
    try {
      await this.taskSvc.updateTask(updated);
      this.cancelEditTask();
      // データを再読み込み
      this.loadTasksData();
    } catch (e) {
      console.error('タスクの更新に失敗しました:', e);
      alert('タスクの更新に失敗しました: ' + e);
    }
  }

  async completeTask(task: Task) {
    try {
      const updated: Task = { ...task, completed: !task.completed, status: !task.completed ? '完了' : '未着手', updatedAt: new Date().toISOString() };
      await this.taskSvc.updateTask(updated);
      // データを再読み込み
      this.loadTasksData();
    } catch (e) {
      console.error('タスクの完了処理に失敗しました:', e);
      alert('タスクの完了処理に失敗しました: ' + e);
    }
  }

  async addLink() {
    if (this.newLinkLabel && this.newLinkUrl && this.category) {
      try {
        this.links.push({ label: this.newLinkLabel, url: this.newLinkUrl });
        const updatedCategory = { 
          ...this.category, 
          links: [...this.links],
          updatedAt: new Date().toISOString()
        };
        await this.categorySvc.update(updatedCategory);
        
        // 入力フィールドをリセット
        this.newLinkLabel = '';
        this.newLinkUrl = '';
        this.showLinkForm = false;
        
        // データを再読み込み
        this.refreshTrigger.next(true);
      } catch (e) {
        console.error('リンクの追加に失敗しました:', e);
        alert('リンクの追加に失敗しました: ' + e);
      }
    }
  }

  cancelAddLink() {
    this.showLinkForm = false;
    this.newLinkLabel = '';
    this.newLinkUrl = '';
    // キャンセル時に変更検知をトリガー
    this.cdr.detectChanges();
  }

  getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return '';
    const category = this.allCategories.find(cat => cat.id === categoryId);
    return category ? category.name : '';
  }

  async deleteTask(id: string) {
    if (confirm('本当に削除しますか？')) {
      await this.taskSvc.deleteTask(id);
      this.loadTasksData();
    }
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
} 