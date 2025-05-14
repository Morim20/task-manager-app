//タスク一覧画面

import { Component, OnInit, OnDestroy, ChangeDetectorRef, AfterViewChecked } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { TaskService } from '../../services/task.service';
import { CategoryService } from '../../services/category.service';
import { Task, Category } from '../../models/task.model';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TaskFormDialogComponent } from '../task-form-dialog/task-form-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { v4 as uuidv4 } from 'uuid';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem, CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { StatusFormDialogComponent } from '../status-form-dialog/status-form-dialog.component';
import { FormsModule } from '@angular/forms';
import { Inject, Component as DialogComponent } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { TaskDetailDialogComponent } from '../task-detail-dialog/task-detail-dialog.component';
import { StatusService } from '../../services/status.service';
import { StatusMaster } from '../../models/status.model';

interface SubTaskInput {
  [key: string]: string;
}

interface SubTaskInputElements {
  [key: string]: HTMLInputElement | null;
}

@Component({
  selector: 'app-task-list',
  templateUrl: './task-list.component.html',
  styleUrls: ['./task-list.component.scss'],
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatButtonToggleModule,
    MatTooltipModule,
    DragDropModule,
    FormsModule,
    MatDialogModule
  ],
  standalone: true
})
export class TaskListComponent implements OnInit, OnDestroy, AfterViewChecked {
  tasks: Task[] = [];
  filteredTasks: Task[] = [];
  categories: Category[] = [];
  selectedCategory: string = '';
  selectedCategoryId: string = '';
  viewMode: 'list' | 'kanban' = 'list';
  statuses: StatusMaster[] = [];
  private subscriptions = new Subscription();
  subTaskInput: { [key: string]: string } = {};
  subTaskInputElements: { [key: string]: HTMLInputElement | null } = {};
  subTaskInputRefs: { [key: string]: HTMLInputElement | null } = {};
  showSubTaskInput: { [taskId: string]: boolean } = {};
  expandedTask: { [taskId: string]: boolean } = {};
  editingSubTask: { [taskId: string]: { [subTaskId: string]: boolean } } = {};
  editedSubTaskText: { [taskId: string]: { [subTaskId: string]: string } } = {};
  subTaskInputKey: { [taskId: string]: number } = {};  // 入力欄の再生成用キー
  activeSubTaskInputId: string | null = null;
  private focusTimeout: any = null;
  // 独自削除確認パネル用の状態
  showStatusDeleteBox = false;
  statusToDelete: string | null = null;

  constructor(
    private svc: TaskService,
    private categorySvc: CategoryService,
    private statusService: StatusService,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {
    // キーボードイベントを監視
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent) {
    // キーイベントをシンプルに処理する
    // サブタスク入力欄がアクティブな時は何もしない
    // 特定のキーボードショートカットを処理するなら、ここで実装
  }

  ngOnInit() {
    console.log('TaskListComponent初期化');
    
    // キーボードイベントのリスナーを追加
    document.addEventListener('keydown', this.handleKeyDown.bind(this));

    // ユーザーがログイン中の場合のみデータを読み込む
    this.subscriptions.add(
      this.svc.getTasks().subscribe(tasks => {
        // archived未定義をfalseに補正
        tasks.forEach(task => {
          if (typeof task.archived !== 'boolean') task.archived = false;
        });
        console.log('タスクを読み込みました:', tasks.length);
        console.log('タスクの初期順序:', tasks.map(t => `${t.title}(順序:${t.order ?? 'undefined'})`));
        
        // カテゴリーの読み込みを先に行う
        this.categorySvc.getCategories().subscribe((categories: Category[]) => {
          // カテゴリーを順序で並べ替え
          this.categories = categories.sort((a: Category, b: Category) => (a.order || 0) - (b.order || 0));
          console.log('カテゴリー読み込み完了:', this.categories.map(c => `${c.name} (ID: ${c.id})`));
          
          // タスクのカテゴリーIDを更新
          this.updateTasksCategoryIds(tasks).then(updatedTasks => {
            // 壊れたタスクデータを検出して修復
            this.repairTasksWithUndefinedOrder(updatedTasks).then(repairedTasks => {
              // タスクを保存
              this.tasks = repairedTasks;
              
              // デフォルトのカテゴリーを選択
              if (!this.selectedCategory) {
                this.selectCategory('すべて');
              } else {
                // すでに選択されているカテゴリーに基づいてフィルタリング
                this.filteredTasks = this.filterTasks(this.tasks);
                console.log('初期化時のフィルタリング後順序:', this.filteredTasks.map(t => `${t.title}(順序:${t.order ?? 'undefined'})`));
              }
            });
          });
        });
      })
    );
    
    // スクロール可能状態の監視を設定
    this.checkScrollable();
    window.addEventListener('resize', this.checkScrollable.bind(this));
    
    // タッチデバイス用のドラッグ初期化を設定
    this.initializeTouchDragSupport();

    // カテゴリー選択時や初期化時にstatusesを購読
    this.categorySvc.getCategories().subscribe(categories => {
      this.categories = categories;
      if (this.selectedCategoryId) {
        this.statusService.initializeStatuses(this.selectedCategoryId);
        this.statusService.getStatuses().subscribe(statuses => {
          this.statuses = statuses; // StatusMaster[]のまま
          this.cdr.detectChanges();
        });
      }
    });
  }

  // タスクのカテゴリーIDを更新する
  private async updateTasksCategoryIds(tasks: Task[]): Promise<Task[]> {
    console.log('タスクのカテゴリーID更新開始');
    const updatedTasks: Task[] = [];
    
    for (const task of tasks) {
      let needsUpdate = false;
      const updatedTask = { ...task };
      
      // categoryIdが未設定の場合、categoryから設定を試みる
      if (!updatedTask.categoryId && updatedTask.category) {
        const matchingCategory = this.categories.find(c => c.name === updatedTask.category);
        if (matchingCategory) {
          updatedTask.categoryId = matchingCategory.id;
          needsUpdate = true;
          console.log(`タスク「${task.title}」のカテゴリーIDを更新: ${matchingCategory.id}`);
        }
      }
      
      if (needsUpdate) {
        try {
          await this.svc.updateTask(updatedTask);
          console.log(`タスク「${task.title}」の更新が完了しました`);
        } catch (error) {
          console.error(`タスク「${task.title}」の更新に失敗:`, error);
        }
      }
      
      updatedTasks.push(updatedTask);
    }
    
    console.log('タスクのカテゴリーID更新完了');
    return updatedTasks;
  }

  private updateTasksAfterCategoryChange() {
    console.log('カテゴリー変更後のタスク更新');
    console.log('選択されたカテゴリー:', this.selectedCategory);
    console.log('選択されたカテゴリーID:', this.selectedCategoryId);
    
    // タスクのカテゴリーIDを再確認
    this.updateTasksCategoryIds(this.tasks).then(updatedTasks => {
      this.tasks = updatedTasks;
      this.filteredTasks = this.filterTasks(this.tasks);
      console.log('フィルタリング後のタスク数:', this.filteredTasks.length);
      
      // デバッグ出力
      console.log('更新後のタスク一覧:', this.filteredTasks.map(t => ({
        title: t.title,
        categoryId: t.categoryId,
        categoryName: this.getCategoryName(t.categoryId)
      })));
    });
  }

  // 順序が未定義のタスクを修復する
  private async repairTasksWithUndefinedOrder(tasks: Task[]): Promise<Task[]> {
    // undefined orderを持つタスクを検出
    const undefinedOrderTasks = tasks.filter(t => t.order === undefined);
    
    if (undefinedOrderTasks.length === 0) {
      // 修復の必要なし
      return tasks;
    }
    
    console.warn(`${undefinedOrderTasks.length}個のタスクで順序が未定義です。修復します...`);
    console.warn('修復対象:', undefinedOrderTasks.map(t => `${t.title} (ID: ${t.id})`));
    
    // 現在の最大順序を取得
    let maxOrder = Math.max(...tasks.filter(t => t.order !== undefined).map(t => t.order || 0));
    if (maxOrder === -Infinity) maxOrder = 0;
    
    // 修復用のプロミス配列
    const repairPromises = undefinedOrderTasks.map(async (task, index) => {
      try {
        // 新しい順序を割り当て
        const newOrder = maxOrder + index + 1;
        
        // タスクを更新
        const updatedTask: Task = {
          ...task,
          order: newOrder,
          updatedAt: new Date().toISOString()
        };
        
        // データベース更新
        await this.svc.updateTask(updatedTask);
        
        // メモリ内でも更新
        task.order = newOrder;
        
        console.log(`タスク修復完了: "${task.title}" の順序を ${newOrder} に設定しました`);
        return task;
      } catch (err) {
        console.error(`タスク修復エラー (ID: ${task.id}):`, err);
        return task;
      }
    });
    
    // すべての修復を実行
    await Promise.all(repairPromises);
    
    // 成功メッセージは表示しない
    
    return tasks;
  }

  // タッチデバイス用のドラッグアンドドロップをサポートするための初期化
  private initializeTouchDragSupport() {
    // タッチデバイスのドラッグをより反応良くするための設定
    document.addEventListener('touchmove', (event) => {
      // スワイプでのページナビゲーションを防止 - ドラッグ操作中のみ
      if (document.querySelector('.cdk-drag-preview')) {
        event.preventDefault();
      }
    }, { passive: false });
    
    console.log('タッチデバイス用のドラッグサポートを初期化しました');
  }

  private async loadAllStatuses(): Promise<void> {
    // 「すべて」カテゴリーではデフォルト3つのみ表示
    this.statuses = [
      { id: '1', name: '未着手' },
      { id: '2', name: '進行中' },
      { id: '3', name: '完了' }
    ];
    this.cdr.detectChanges();
  }

  private async loadStatusesForCategory(categoryId: string): Promise<void> {
    console.log(`カテゴリーID: ${categoryId} のステータス読み込み開始`);
    try {
      // Firestoreからorder順で取得
      this.statuses = await this.statusService.getAll(categoryId);
      this.cdr.detectChanges();
      console.log('読み込んだステータス:', this.statuses);
    } catch (error) {
      console.error('カテゴリーステータス読み込みエラー:', error);
      this.statuses = [
        { id: '1', name: '未着手' },
        { id: '2', name: '進行中' },
        { id: '3', name: '完了' }
      ];
      this.cdr.detectChanges();
      throw error;
    }
  }

  selectCategory(category: string) {
    console.log('カテゴリー選択:', category);
    
    if (category === 'すべて') {
      this.selectedCategory = 'すべて';
      this.selectedCategoryId = '';
      this.loadAllStatuses().then(() => {
        console.log('全ステータス読み込み完了');
        this.updateTasksAfterCategoryChange();
      }).catch(err => {
        console.error('全ステータスの読み込みエラー:', err);
        this.statuses = [
          { id: '1', name: '未着手' },
          { id: '2', name: '進行中' },
          { id: '3', name: '完了' }
        ];
        this.updateTasksAfterCategoryChange();
      });
    } else {
      const selectedCategory = this.categories.find(c => c.name === category);
      if (selectedCategory) {
        this.selectedCategory = selectedCategory.name;
        this.selectedCategoryId = selectedCategory.id;
        this.statusService.initializeStatuses(this.selectedCategoryId);
        this.statusService.getStatuses().subscribe(statuses => {
          this.statuses = statuses; // StatusMaster[]のまま
          this.cdr.detectChanges();
          console.log('購読で取得したステータス:', this.statuses);
        });
        this.updateTasksAfterCategoryChange();
      }
    }
  }

  selectCategoryById(categoryId: string) {
    console.log('カテゴリーID選択:', categoryId);
    const selectedCategory = this.categories.find(c => c.id === categoryId);
    if (selectedCategory) {
      this.selectedCategory = selectedCategory.name;
      this.selectedCategoryId = categoryId;
      this.statusService.initializeStatuses(this.selectedCategoryId);
      this.statusService.getStatuses().subscribe(statuses => {
        this.statuses = statuses; // StatusMaster[]のまま
        this.cdr.detectChanges();
        console.log('購読で取得したステータス:', this.statuses);
      });
      this.updateTasksAfterCategoryChange();
    }
  }

  filterTasks(tasks: Task[]): Task[] {
    console.log('タスクフィルタリング開始');
    console.log('全タスク数:', tasks.length);
    console.log('選択されたカテゴリーID:', this.selectedCategoryId);

    let filtered = tasks;
    
    // カテゴリーでフィルタリング（categoryIdベース）
    if (this.selectedCategoryId) {
      filtered = filtered.filter(task => task.categoryId === this.selectedCategoryId);
      console.log('カテゴリーフィルタリング後のタスク数:', filtered.length);
    }

    // アーカイブされていないタスクのみ表示
    filtered = filtered.filter(task => !task.archived);
    console.log('アーカイブフィルタリング後のタスク数:', filtered.length);

    // 手動で並び替えられたタスクがある場合はその順序を優先
    const hasManualOrder = filtered.some(task => task.order !== undefined);
    
    if (hasManualOrder) {
      filtered.sort((a, b) => (a.order || 0) - (b.order || 0));
    } else {
      filtered.sort((a, b) => this.taskTimeSort(a, b));
    }
    
    console.log('フィルタリング完了');
    return filtered;
  }

  getTasksByStatus(status: StatusMaster | string): Task[] {
    const statusName = typeof status === 'string' ? status : status.name;
    const tasks = this.filteredTasks
      .filter(task => task.status === statusName)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return tasks;
  }

  // タスクの時系列ソート関数
  private taskTimeSort(a: Task, b: Task): number {
    // 目標完了日タスクを最上部に
    const aIsTarget = !!a.targetCompletionDate;
    const bIsTarget = !!b.targetCompletionDate;
    if (aIsTarget && !bIsTarget) return -1;
    if (!aIsTarget && bIsTarget) return 1;

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

  openNewTaskDialog() {
    const dialogRef = this.dialog.open(TaskFormDialogComponent, {
      width: '500px',
      maxHeight: '80vh',
      panelClass: ['task-form-dialog', 'mat-elevation-z8'],
      autoFocus: true,
      disableClose: true,
      position: { top: '50px' },
      data: {
        type: 'todo'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.svc.getTasks().subscribe((tasks: Task[]) => {
          this.tasks = tasks;
          this.filteredTasks = this.filterTasks(tasks);
          this.cdr.detectChanges();
        });
      }
    });
  }

  toggleComplete(task: Task) {
    const updatedTask = { ...task, completed: !task.completed, archived: task.archived ?? false };
    // 親タスクが完了にされた場合、サブタスクもすべて完了にする
    if (updatedTask.completed && updatedTask.subTasks && updatedTask.subTasks.length > 0) {
      updatedTask.subTasks = updatedTask.subTasks.map(st => ({ ...st, completed: true }));
    }
    // 完了にした場合はstatusも'完了'に変更
    if (updatedTask.completed) {
      updatedTask.status = '完了';
    } else {
      // 未完了にした場合は「未着手」または「進行中」に戻す
      if (updatedTask.subTasks && updatedTask.subTasks.some(st => st.completed)) {
        updatedTask.status = '進行中';
      } else {
        updatedTask.status = '未着手';
      }
    }
    this.svc.updateTask(updatedTask).then(() => {
      this.snackBar.open('ステータスを更新しました', '閉じる', { duration: 3000 });
    });
  }

  delete(id: string) {
    // カレンダー以外では繰り返しタスクも親タスクごと削除
    if (confirm('本当に削除しますか？')) {
      this.svc.deleteTask(id).then(() => {
        this.snackBar.open('タスクを削除しました', '閉じる', { duration: 3000 });
      });
    }
  }

  edit(id: string) {
    this.router.navigate(['/tasks', id, 'edit']);
  }

  onStatusChange(task: Task, newStatus: '未着手' | '進行中' | '完了') {
    const updatedTask = { ...task, status: newStatus, archived: task.archived ?? false };
    this.svc.updateTask(updatedTask).then(() => {
      this.snackBar.open('ステータスを更新しました', '閉じる', { duration: 3000 });
    });
  }

  onEdit(task: Task) {
    const dialogRef = this.dialog.open(TaskFormDialogComponent, {
      width: '500px',
      maxHeight: '80vh',
      panelClass: ['task-form-dialog', 'mat-elevation-z8'],
      autoFocus: true,
      disableClose: true,
      position: { top: '50px' },
      data: { id: task.id }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // archivedを維持
        result.archived = task.archived ?? false;
        // 元のtaskとresultをマージして保存
        const updatedTask = { ...task, ...result };
        this.svc.updateTask(updatedTask).then(() => {
          this.snackBar.open('タスクを更新しました', '閉じる', { duration: 3000 });
        });
      }
    });
  }

  onDuplicate(task: Task) {
    const duplicatedTask = { ...task, id: uuidv4(), archived: false };
    this.svc.addTask(duplicatedTask).then(() => {
      this.snackBar.open('タスクを複製しました', '閉じる', { duration: 3000 });
    });
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === 'list' ? 'kanban' : 'list';
  }

  onTaskDrop(event: CdkDragDrop<Task[]>, newStatus: StatusMaster | string) {
    console.log('タスクのドロップイベント:', event);
    const statusName = typeof newStatus === 'string' ? newStatus : newStatus.name;
    console.log('新しいステータス:', statusName);
    
    if (event.previousContainer === event.container) {
      // 同じステータス内での並び替え
      console.log('同じステータス内での並び替え');
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      // 同じステータス内でのタスク更新
      this.updateTasksInSameStatus(event.container.data, statusName);
    } else {
      // 異なるステータス間の移動
      console.log('異なるステータス間の移動');
      const task = event.item.data as Task;
      console.log('移動するタスク:', task);
      try {
        // UIデータの更新
        transferArrayItem(
          event.previousContainer.data,
          event.container.data,
          event.previousIndex,
          event.currentIndex
        );
        // データベースの更新処理
        this.updateTasksAfterStatusChange(
          task,
          statusName,
          event.container.data,
          event.previousContainer.data,
          event.currentIndex
        );
      } catch (error) {
        console.error('ステータス間移動エラー:', error);
        // 通知を表示しない
        // エラー発生時は元のタスクリストを再取得して表示を更新
        this.svc.getTasks().subscribe(tasks => {
          this.tasks = tasks;
          this.filteredTasks = this.filterTasks(tasks);
          this.cdr.detectChanges();
        });
      }
    }
  }

  private async updateTasksInSameStatus(tasks: Task[], status: string) {
    try {
      // 同じステータス内でのタスク更新
      const updatePromises = tasks.map(async (task, index) => {
        try {
          // 最新のタスク情報を取得
          const currentTask = await this.svc.getTask(task.id);
          if (!currentTask) {
            console.error(`タスクが見つかりません: ${task.id}`);
            return Promise.reject(`タスクが見つかりません: ${task.id}`);
          }
          
          // 更新するプロパティだけを変更
          const updatedTask: Task = {
            ...currentTask,
            order: index,
            status: status,
            updatedAt: new Date().toISOString()
          };
          
          console.log(`同じステータス内タスク更新: ${task.title}, ID: ${task.id}, 新しい順序: ${index}`);
          return this.svc.updateTask(updatedTask);
        } catch (err) {
          console.error(`タスク更新エラー (ID: ${task.id}):`, err);
          return Promise.reject(err);
        }
      });
      
      await Promise.all(updatePromises);
      console.log('同じステータス内でのタスク順序更新が完了しました');
      
      // タスクリストを再取得して最新状態を表示
      this.svc.getTasks().subscribe(tasks => {
        this.tasks = tasks;
        this.filteredTasks = this.filterTasks(tasks);
        this.cdr.detectChanges();
        // 通知を表示しない
      });
    } catch (error) {
      console.error('タスク更新エラー:', error);
      // 通知を表示しない
      
      // エラー発生時は元のタスクリストを再取得
      this.svc.getTasks().subscribe(tasks => {
        this.tasks = tasks;
        this.filteredTasks = this.filterTasks(tasks);
        this.cdr.detectChanges();
      });
    }
  }

  private async updateTasksAfterStatusChange(
    movedTask: Task,
    newStatus: string,
    targetTasks: Task[],
    sourceTasks: Task[],
    newIndex: number
  ) {
    try {
      // 1. 移動したタスクを更新
      const currentTask = await this.svc.getTask(movedTask.id);
      if (!currentTask) {
        throw new Error(`移動するタスクが見つかりません: ${movedTask.id}`);
      }
      
      const updatedTask: Task = {
        ...currentTask,
        status: newStatus,
        order: newIndex,
        updatedAt: new Date().toISOString()
      };
      
      console.log('移動するタスクを更新:', updatedTask);
      await this.svc.updateTask(updatedTask);
      
      // 2. 移動元のタスクの順序を更新
      const sourcePromises = sourceTasks.map(async (task, index) => {
        const sourceTask = await this.svc.getTask(task.id);
        if (!sourceTask) return Promise.resolve();
        
        const updatedSourceTask: Task = {
          ...sourceTask,
          order: index,
          updatedAt: new Date().toISOString()
        };
        
        return this.svc.updateTask(updatedSourceTask);
      });
      
      // 3. 移動先のタスクの順序を更新（移動したタスク以外）
      const targetPromises = targetTasks
        .filter(t => t.id !== movedTask.id)
        .map(async (task, index) => {
          const targetTask = await this.svc.getTask(task.id);
          if (!targetTask) return Promise.resolve();
          
          // 移動したタスクの位置を考慮して順序を計算
          const finalIndex = index < newIndex ? index : index + 1;
          
          const updatedTargetTask: Task = {
            ...targetTask,
            order: finalIndex,
            updatedAt: new Date().toISOString()
          };
          
          return this.svc.updateTask(updatedTargetTask);
        });
      
      // すべての更新を実行
      await Promise.all([...sourcePromises, ...targetPromises]);
      console.log('ステータス間のタスク移動が完了しました');
      
      // タスクリストを再取得して最新状態を表示
      this.svc.getTasks().subscribe(tasks => {
        this.tasks = tasks;
        this.filteredTasks = this.filterTasks(tasks);
        this.cdr.detectChanges();
        // 通知を表示しない
      });
    } catch (error) {
      console.error('タスク更新エラー:', error);
      // 通知を表示しない
      
      // エラー発生時は元のタスクリストを再取得
      this.svc.getTasks().subscribe(tasks => {
        this.tasks = tasks;
        this.filteredTasks = this.filterTasks(tasks);
        this.cdr.detectChanges();
      });
    }
  }

  // ドラッグ中のプレビューをカスタマイズ
  getDragPreview(task: Task) {
    const preview = document.createElement('div');
    preview.classList.add('task-drag-preview');
    preview.innerHTML = `
      <div class="preview-card">
        <div class="preview-title">${task.title}</div>
        <div class="preview-category">${this.getCategoryName(task.categoryId)}</div>
      </div>
    `;
    return preview;
  }

  // ドラッグ中のタスクがドロップ可能かどうかを判定
  canDrop(drag: CdkDrag<Task>, drop: CdkDropList<Task[]>) {
    // ドロップを許可する（常にtrue）
    return true;
  }

  onCategoryDrop(event: CdkDragDrop<Category[]>) {
    // 配列内の要素を移動
    moveItemInArray(this.categories, event.previousIndex, event.currentIndex);
    
    // カテゴリーの順序を更新
    const updatedCategories = this.categories.map((category, index) => ({
      ...category,
      order: index,
      updatedAt: new Date().toISOString()
    }));
    
    // 一括更新
    Promise.all(updatedCategories.map(category => 
      this.categorySvc.update(category)
    )).then(() => {
      // 更新後にカテゴリーリストを再取得
      this.categories = updatedCategories;
      this.cdr.detectChanges();
      this.snackBar.open('カテゴリーの順序を更新しました', '閉じる', { duration: 3000 });
    }).catch(error => {
      console.error('カテゴリーの更新に失敗しました:', error);
      this.snackBar.open('カテゴリーの更新に失敗しました', '閉じる', { duration: 3000 });
    });
  }

  // スクロール可能かどうかをチェックしてクラスを追加/削除
  private checkScrollable() {
    const container = document.querySelector('.kanban-container');
    if (container) {
      const hasScroll = container.scrollWidth > container.clientWidth;
      if (hasScroll) {
        container.classList.add('has-horizontal-scroll');
      } else {
        container.classList.remove('has-horizontal-scroll');
      }
    }
  }

  // ステータス追加後にスクロール可能状態を再チェック
  openAddStatusDialog() {
    const dialogRef = this.dialog.open(StatusFormDialogComponent, {
      width: '400px',
      maxHeight: '80vh',
      panelClass: ['status-form-dialog', 'mat-elevation-z8'],
      autoFocus: true,
      disableClose: true,
      position: { top: '50px' }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && this.selectedCategoryId) {
        try {
          const trimmed = result.trim();
          console.log('Firestoreに追加するstatus名:', trimmed);
          await this.statusService.add(this.selectedCategoryId, trimmed);
          this.snackBar.open('新しいステータスを追加しました', '閉じる', {
            duration: 3000,
          });
          setTimeout(() => this.checkScrollable(), 100);
        } catch (e) {
          this.snackBar.open('ステータスの追加に失敗しました', '閉じる', { duration: 3000 });
        }
      }
    });
  }

  getConnectedLists(currentStatus: StatusMaster | string): string[] {
    // IDプレフィックスを含めたステータス文字列の配列を返す
    const currentStatusName = typeof currentStatus === 'string' ? currentStatus : currentStatus.name;
    const connectedLists = this.statuses
      .filter(status => status.name !== currentStatusName)
      .map(status => `status-${status.name}`);
    console.log('接続されたリスト:', connectedLists);
    return connectedLists;
  }

  onListTaskDrop(event: CdkDragDrop<Task[]>) {
    console.log('リストタスクのドロップイベント発生:', event);
    console.log('現在のカテゴリー:', this.selectedCategory);
    
    try {
      // ドロップ前後のインデックスを確認
      console.log(`移動: インデックス ${event.previousIndex} → ${event.currentIndex}`);
      
      if (event.previousIndex === event.currentIndex) {
        console.log('同じ位置にドロップされました - 処理をスキップします');
        return;
      }
      
      // UIの状態を更新（見た目の更新）
      moveItemInArray(this.filteredTasks, event.previousIndex, event.currentIndex);
      
      // タスクのコピーを作成して更新
      const tasksToUpdate = [...this.filteredTasks];
      
      // カテゴリー内でのソート順確認
      console.log(`${this.selectedCategory} カテゴリーのタスク数: ${tasksToUpdate.length}`);
      tasksToUpdate.forEach((t, i) => {
        console.log(`順序 ${i}: ${t.title} (ID: ${t.id}, 現在の順序: ${t.order ?? 'undefined'})`);
      });
      
      // データベースに永続化するために、タスクの順序を一括で更新
      const updatePromises = tasksToUpdate.map(async (task, idx) => {
        try {
          // 既存のタスクを取得
          const existingTask = await this.svc.getTask(task.id);
          if (!existingTask) {
            console.error(`タスク更新エラー: ID ${task.id} のタスクが見つかりません`);
            return Promise.resolve();
          }
          
          // 順序だけを更新したタスクオブジェクトを作成
          const updatedTask: Task = {
            ...existingTask,
            order: idx,  // インデックスを順序として保存
            updatedAt: new Date().toISOString()
          };
          
          // メモリ上のタスクも更新（UIを即時反映するため）
          task.order = idx;
          
          console.log(`タスク更新: ${task.title}, ID: ${task.id}, 新しい順序: ${idx}`);
          return this.svc.updateTask(updatedTask);
        } catch (err) {
          console.error(`タスク更新エラー (ID: ${task.id}):`, err);
          return Promise.reject(err);
        }
      });
      
      // すべての更新を実行
      Promise.all(updatePromises)
        .then(() => {
          console.log('リスト形式でのタスク順序更新が完了しました');
          
          // メモリ上のメインタスク配列にも順序を反映
          this.tasks = this.tasks.map(task => {
            const updatedTask = tasksToUpdate.find(t => t.id === task.id);
            if (updatedTask) {
              return { ...task, order: updatedTask.order };
            }
            return task;
          });
          
          // 順序を再適用してUIを更新
          this.filteredTasks = this.filterTasks(this.tasks);
          
          // 通知を表示しない
          
          // Change Detection強制実行
          this.cdr.detectChanges();
        })
        .catch(error => {
          console.error('タスク更新エラー:', error);
          this.handleTaskUpdateError(error, 'タスクの順序更新に失敗しました');
        });
    } catch (error) {
      console.error('ドラッグ&ドロップ処理エラー:', error);
      this.handleTaskUpdateError(error, 'タスクの移動に失敗しました');
    }
  }

  // エラーハンドリングを統一的に処理するヘルパーメソッド
  private handleTaskUpdateError(error: any, defaultMessage: string) {
    // エラーを記録するだけで、ユーザーには表示しない
    console.error(`${defaultMessage}:`, error);
    
    // エラー発生時は元のタスクリストを再取得
    this.reloadAllTasks();
  }

  // タスクリストを完全に再読み込みする
  private reloadAllTasks(): Promise<void> {
    return new Promise((resolve) => {
      this.svc.getTasks().subscribe(tasks => {
        console.log('タスクデータを再読み込み:', tasks.length);
        this.tasks = tasks;
        this.filteredTasks = this.filterTasks(tasks);
        console.log('再読み込み後のフィルタ済みタスク順:', this.filteredTasks.map(t => `${t.title}(順序:${t.order})`));
        this.cdr.detectChanges();
        resolve();
      });
    });
  }

  // サブタスク入力欄の参照を設定
  setSubTaskInputRef(taskId: string, ref: EventTarget | null) {
    if (ref instanceof HTMLInputElement) {
      this.subTaskInputElements[taskId.toString()] = ref;
      this.subTaskInputRefs[taskId.toString()] = ref;
    }
  }

  addSubTask(task: Task, event?: Event) {
    // イベントがある場合は伝播を停止
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    const value = (this.subTaskInput[task.id.toString()] || '').trim();
    if (!value) return;
    
    const newSubTask = {
      id: uuidv4(),
      title: value,
      completed: false
    };
    
    if (!task.subTasks) task.subTasks = [];
    task.subTasks.push(newSubTask);
    
    this.svc.updateTask({ ...task, archived: task.archived ?? false }).then(() => {
      // 入力値をクリア
      this.subTaskInput[task.id.toString()] = '';
      // 入力欄を再生成するためにキーをインクリメント
      this.subTaskInputKey[task.id.toString()] = (this.subTaskInputKey[task.id.toString()] || 0) + 1;
      // 入力欄を維持（falseにしない）
      this.activeSubTaskInputId = task.id.toString();
      
      // 更新を反映
      this.cdr.detectChanges();
      
      // より確実にフォーカスを設定
      requestAnimationFrame(() => {
        const inputElement = document.getElementById(`subtask-input-${task.id.toString()}`) as HTMLInputElement;
        if (inputElement) {
          inputElement.focus();
        }
      });
    });
  }

  toggleSubTask(task: Task, subTaskId: string) {
    if (!task.subTasks) return;
    const sub = task.subTasks.find(s => s.id === subTaskId);
    if (sub) {
      sub.completed = !sub.completed;
      // サブタスクの状態に応じて親タスクのcompletedも連動
      const allCompleted = task.subTasks.every(st => st.completed);
      const anyCompleted = task.subTasks.some(st => st.completed);
      task.completed = allCompleted;
      // ステータスも連動
      if (allCompleted) {
        task.status = '完了';
      } else if (anyCompleted) {
        task.status = '進行中';
      } else {
        task.status = '未着手';
      }
      this.svc.updateTask({ ...task, archived: task.archived ?? false });
    }
  }

  toggleExpandTask(taskId: string) {
    this.expandedTask[taskId] = !this.expandedTask[taskId];
    if (!this.expandedTask[taskId]) {
      this.showSubTaskInput[taskId] = false;
    }
  }

  // "+"ボタンでサブタスク入力を表示する処理を改善
  showSubTaskInputField(taskId: string, event: MouseEvent) {
    event.stopPropagation();
    this.showSubTaskInput[taskId] = true;
    this.subTaskInput[taskId] = '';
    this.expandedTask[taskId] = true;
    this.activeSubTaskInputId = taskId;
    
    // より確実にフォーカスを設定
    this.cdr.detectChanges();
    requestAnimationFrame(() => {
      const inputElement = document.getElementById(`subtask-input-${taskId}`) as HTMLInputElement;
      if (inputElement) {
        inputElement.focus();
      }
    });
  }

  onTaskCardClick(taskId: string) {
    if (this.showSubTaskInput[taskId]) {
      this.showSubTaskInput[taskId] = false;
      this.activeSubTaskInputId = null;
    }
  }

  startEditSubTask(task: Task, subTaskId: string) {
    if (!this.editingSubTask[task.id]) {
      this.editingSubTask[task.id] = {};
      this.editedSubTaskText[task.id] = {};
    }
    const subTask = task.subTasks?.find(st => st.id === subTaskId);
    if (subTask) {
      this.editingSubTask[task.id][subTaskId] = true;
      this.editedSubTaskText[task.id][subTaskId] = subTask.title;
      // 入力フィールドにフォーカスを設定
      setTimeout(() => {
        const inputElement = document.querySelector(`#edit-subtask-${task.id}-${subTaskId}`) as HTMLInputElement;
        if (inputElement) {
          inputElement.focus();
          inputElement.select();
        }
      });
    }
  }

  saveEditSubTask(task: Task, subTaskId: string) {
    if (!task.subTasks) return;
    const subTask = task.subTasks.find(st => st.id === subTaskId);
    if (subTask && this.editedSubTaskText[task.id]?.[subTaskId] !== undefined) {
      const newTitle = this.editedSubTaskText[task.id][subTaskId].trim();
      if (newTitle) {
        subTask.title = newTitle;
        this.editingSubTask[task.id][subTaskId] = false;
        this.cdr.detectChanges();
        this.svc.updateTask({ ...task, archived: task.archived ?? false }).then(() => {
          this.snackBar.open('サブタスクを更新しました', '閉じる', { duration: 3000 });
        });
      } else {
        this.cancelEditSubTask(task.id, subTaskId);
      }
    } else {
      this.cancelEditSubTask(task.id, subTaskId);
    }
  }

  cancelEditSubTask(taskId: string, subTaskId: string) {
    if (this.editingSubTask[taskId]) {
      this.editingSubTask[taskId][subTaskId] = false;
    }
  }

  deleteSubTask(task: Task, subTaskId: string) {
    if (!task.subTasks) return;
    task.subTasks = task.subTasks.filter(st => st.id !== subTaskId);
    this.svc.updateTask({ ...task, archived: task.archived ?? false }).then(() => {
      this.snackBar.open('サブタスクを削除しました', '閉じる', { duration: 3000 });
    });
  }

  onSubTaskInput(event: Event, taskId: string) {
    const target = event.target as HTMLInputElement | null;
    this.subTaskInput[taskId] = target && typeof target.value === 'string' ? target.value : '';
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    window.removeEventListener('resize', this.checkScrollable.bind(this));
    document.removeEventListener('keydown', this.handleKeyDown.bind(this));
    if (this.focusTimeout) {
      clearTimeout(this.focusTimeout);
    }
  }

  ngAfterViewChecked() {
    if (this.activeSubTaskInputId && this.showSubTaskInput[this.activeSubTaskInputId]) {
      const inputField = document.getElementById(`subtask-input-${this.activeSubTaskInputId}`);
      if (inputField && document.activeElement !== inputField) {
        setTimeout(() => {
          (inputField as HTMLInputElement).focus();
        }, 0);
      }
    }
  }

  getSubTaskInput(taskId: string): string {
    return this.subTaskInput[taskId] ?? '';
  }
  setSubTaskInput(taskId: string, value: string) {
    this.subTaskInput[taskId] = value;
  }

  async archiveTask(task: Task) {
    task.archived = true;
    await this.svc.updateTask(task);
    this.filteredTasks = this.filterTasks(this.tasks);
    this.cdr.detectChanges();
  }

  async restoreTask(task: Task) {
    task.archived = false;
    await this.svc.updateTask(task);
    this.filteredTasks = this.filterTasks(this.tasks);
    this.cdr.detectChanges();
  }

  // 追加：サブタスク入力フィールドのフォーカスを設定するメソッド
  focusSubTaskInput(taskId: string) {
    setTimeout(() => {
      const inputElement = this.subTaskInputRefs[taskId];
      if (inputElement) {
        inputElement.focus();
      }
    }, 100);
  }

  // ヘルパーメソッドを追加
  handleSubTaskInputBlur(event: FocusEvent, taskId: string): void {
    // relatedTargetがHTMLElementかつadd-buttonクラスを持つ場合は入力欄を維持
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (relatedTarget && relatedTarget.classList && relatedTarget.classList.contains('add-button')) {
      // 何もしない - 入力欄を維持
      return;
    }
    
    // それ以外の場合は入力欄を閉じる
    this.showSubTaskInput[taskId] = false;
  }

  // アクティブなサブタスク入力IDを設定する
  setActiveSubTaskInput(taskId: string) {
    this.activeSubTaskInputId = taskId;
  }

  // ステータス削除可否（デフォルト3つ以外のみ削除可）
  canDeleteStatus(status: StatusMaster | string): boolean {
    const statusName = typeof status === 'string' ? status : status.name;
    return !['未着手', '進行中', '完了'].includes(statusName);
  }

  // ステータス削除処理
  async deleteStatus(status: StatusMaster | string) {
    if (!this.selectedCategoryId) {
      this.snackBar.open('カテゴリーを選択してください', '閉じる', { duration: 3000 });
      return;
    }
    const statusName = typeof status === 'string' ? status : status.name;
    if (!this.canDeleteStatus(statusName)) {
      this.snackBar.open('このステータスは削除できません', '閉じる', { duration: 3000 });
      return;
    }
    if (!confirm(`ステータス「${statusName}」を本当に削除しますか？`)) return;
    try {
      // Firestoreからstatusesを取得
      const statuses = await this.statusService.getAll(this.selectedCategoryId);
      const target = statuses.find(s => s.name === statusName);
      if (target) {
        await this.statusService.delete(this.selectedCategoryId, target.id);
        this.snackBar.open('ステータスを削除しました', '閉じる', { duration: 3000 });
        this.loadStatusesForCategory(this.selectedCategoryId);
      }
    } catch (e) {
      this.snackBar.open('ステータスの削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  // ステータス削除確認ダイアログ
  confirmDeleteStatus(status: StatusMaster | string) {
    const statusName = typeof status === 'string' ? status : status.name;
    this.statusToDelete = statusName;
    this.showStatusDeleteBox = true;
  }

  // パネルから削除実行
  async deleteStatusFromBox() {
    if (this.statusToDelete) {
      await this.deleteStatus(this.statusToDelete);
    }
    this.closeStatusDeleteBox();
  }

  // パネルを閉じる
  closeStatusDeleteBox() {
    this.showStatusDeleteBox = false;
    this.statusToDelete = null;
  }

  // ステータスカラムのドラッグアンドドロップ
  async onStatusDrop(event: CdkDragDrop<any[]>) {
    if (event.previousIndex === event.currentIndex) return;
    
    // UIの更新
    moveItemInArray(this.statuses, event.previousIndex, event.currentIndex);
    
    // 新しい順序でステータスを更新
    const updatedStatuses = this.statuses.map((status: any, idx: number) => ({
      ...status,
      order: idx
    }));

    // Firestoreに保存
    if (this.selectedCategoryId) {
      try {
        await this.statusService.updateStatusOrder(this.selectedCategoryId, updatedStatuses);
        // 保存成功後、ローカルのステータスを更新
        this.statuses = updatedStatuses;
        this.cdr.detectChanges();
      } catch (error) {
        console.error('ステータスの順序更新に失敗しました:', error);
        // エラー時は元の順序に戻す
        this.statuses = [...this.statuses].sort((a, b) => (a.order || 0) - (b.order || 0));
        this.cdr.detectChanges();
      }
    }
  }

  openTaskDetailDialog(task: Task) {
    this.dialog.open(TaskDetailDialogComponent, {
      data: { task },
      width: '500px',
      panelClass: ['task-detail-dialog', 'mat-elevation-z8']
    });
  }

  // カテゴリーIDからカテゴリー名を取得するメソッド
  getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return '未分類';
    const category = this.categories.find(c => c.id === categoryId);
    return category ? category.name : '未分類';
  }
}

@DialogComponent({
  selector: 'app-status-delete-confirm-dialog',
  template: `
    <h2 mat-dialog-title style="font-size:1.25rem; font-weight:700; color:#d32f2f; letter-spacing:0.02em;">ステータス削除</h2>
    <mat-dialog-content>
      <p style="font-size:1.08rem; color:#222; font-weight:500; margin: 16px 0 8px 0;">「<span style='color:#1976d2;'>{{data.status}}</span>」を本当に削除しますか？</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onNo()" style="font-size:1.02rem;">キャンセル</button>
      <button mat-button color="warn" (click)="onYes()" style="font-size:1.02rem; font-weight:700; color:#fff; background:#d32f2f; margin-left:8px;">削除</button>
    </mat-dialog-actions>
  `,
  standalone: true,
  imports: [MatDialogModule]
})
export class StatusDeleteConfirmDialog {
  constructor(
    public dialogRef: MatDialogRef<StatusDeleteConfirmDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { status: string }
  ) {}
  onNo() { this.dialogRef.close(false); }
  onYes() { this.dialogRef.close(true); }
}
