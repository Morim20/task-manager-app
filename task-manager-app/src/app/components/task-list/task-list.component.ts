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
import { TaskFormComponent } from '../task-form/task-form.component';
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
  autoSort: boolean = true; // 自動ソート設定を追加

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

    this.svc.getTasks().subscribe((tasks: Task[]) => {
      this.tasks = this.sortTasksByTime(tasks);
      this.filteredTasks = this.filterTasks(this.tasks);
      this.cdr.detectChanges();
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
    
    // 警告メッセージを非表示に
    // console.warn(`${undefinedOrderTasks.length}個のタスクで順序が未定義です。修復します...`);
    // console.warn('修復対象:', undefinedOrderTasks.map(t => `${t.title} (ID: ${t.id})`));
    
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
        
        // ログメッセージも非表示に
        // console.log(`タスク修復完了: "${task.title}" の順序を ${newOrder} に設定しました`);
        return task;
      } catch (err) {
        console.error(`タスク修復エラー (ID: ${task.id}):`, err);
        return task;
      }
    });
    
    // すべての修復を実行
    await Promise.all(repairPromises);
    
    return tasks;
  }

  // タッチデバイス用のドラッグアンドドロップをサポートするための初期化
  private initializeTouchDragSupport() {
    // タッチデバイス用のドラッグサポートを初期化
    const dragElements = document.querySelectorAll('.cdk-drag');
    dragElements.forEach(element => {
      element.addEventListener('touchstart', (e: Event) => {
        const touch = (e as TouchEvent).touches[0];
        const dragElement = element as HTMLElement;
        dragElement.style.touchAction = 'none';
      });
    });
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
    
    // カテゴリーでフィルタリング
    if (this.selectedCategoryId) {
      filtered = filtered.filter(task => task.categoryId === this.selectedCategoryId);
      console.log('カテゴリーフィルタリング後のタスク数:', filtered.length);
    }

    // アーカイブされていないタスクのみ表示
    filtered = filtered.filter(task => !task.archived);
    console.log('アーカイブフィルタリング後のタスク数:', filtered.length);
    
    // ソートはfilterTasksでは行わない（sortTasksByTimeで一元管理）
    
    console.log('フィルタリング完了');
    return filtered;
  }

  getTasksByStatus(status: StatusMaster | string): Task[] {
    const statusName = typeof status === 'string' ? status : status.name;
    return this.filteredTasks.filter(task => task.status === statusName);
  }

  // タスクを時系列でソートする関数
  private sortTasksByTime(tasks: Task[]): Task[] {
    // 時間指定あり判定関数
    const getHasTime = (task: Task) => {
      return (
        this.parseTimeString(task.startTime) !== null ||
        this.parseTimeString(task.dueTime) !== null ||
        this.parseTimeString(task.endTime) !== null
      );
    };
    return tasks.sort((a, b) => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const aDate = a.dueDate ? new Date(a.dueDate) : null;
      const bDate = b.dueDate ? new Date(b.dueDate) : null;

      if (aDate && bDate) {
        const aIsToday = aDate.setHours(0, 0, 0, 0) === now.getTime();
        const bIsToday = bDate.setHours(0, 0, 0, 0) === now.getTime();
        if (aIsToday && !bIsToday) return -1;
        if (!aIsToday && bIsToday) return 1;
        if (aDate.getTime() !== bDate.getTime()) return aDate.getTime() - bDate.getTime();

        // --- 時間指定の厳密な判定 ---
        const aHasTime = getHasTime(a);
        const bHasTime = getHasTime(b);
        if (aHasTime && !bHasTime) return -1;
        if (!aHasTime && bHasTime) return 1;
        if (aHasTime && bHasTime) {
          const aTime = this.parseTimeString(a.startTime) ?? this.parseTimeString(a.dueTime) ?? this.parseTimeString(a.endTime) ?? 0;
          const bTime = this.parseTimeString(b.startTime) ?? this.parseTimeString(b.dueTime) ?? this.parseTimeString(b.endTime) ?? 0;
          return aTime - bTime;
        }
        // 両方時間指定なし→そのまま
      } else if (aDate && !bDate) {
        return -1;
      } else if (!aDate && bDate) {
        return 1;
      }
      // 3. 時間情報がない場合は優先度でソート
      if (a.priority !== b.priority) {
        return this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority);
      }
      return 0;
    });
  }

  // 時刻文字列を分単位に変換する強化版
  private parseTimeString(timeStr?: string): number | null {
    if (!timeStr || timeStr.trim() === '') return null;
    
    // 24時間形式 (HH:MM)
    const match24h = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (match24h) {
      const hours = parseInt(match24h[1], 10);
      const minutes = parseInt(match24h[2], 10);
      return hours * 60 + minutes;
    }
    
    // AM/PM形式 (HH:MM AM/PM)
    const matchAMPM = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (matchAMPM) {
      let hours = parseInt(matchAMPM[1], 10);
      const minutes = parseInt(matchAMPM[2], 10);
      const isPM = matchAMPM[3].toUpperCase() === 'PM';
      
      if (hours === 12) {
        hours = isPM ? 12 : 0;
      } else if (isPM) {
        hours += 12;
      }
      
      return hours * 60 + minutes;
    }
    
    // 午前/午後形式 (午前/午後 HH:MM)
    const matchJP = timeStr.match(/^(午前|午後)?(\d{1,2}):(\d{2})$/);
    if (matchJP) {
      let hours = parseInt(matchJP[2], 10);
      const minutes = parseInt(matchJP[3], 10);
      
      if (matchJP[1] === '午後' && hours < 12) hours += 12;
      if (matchJP[1] === '午前' && hours === 12) hours = 0;
      
      return hours * 60 + minutes;
    }
    
    return null;
  }

  // 優先度を数値に変換
  private getPriorityValue(priority?: string): number {
    if (!priority) return 0;
    
    switch (priority.toLowerCase()) {
      case 'high': case '高': return 3;
      case 'medium': case '中': return 2;
      case 'low': case '低': return 1;
      default: return 0;
    }
  }

  openNewTaskDialog() {
    const dialogRef = this.dialog.open(TaskFormComponent, {
      width: '500px',
      height: '500px',
      maxHeight: '90vh',
      panelClass: ['mat-elevation-z8'],
      autoFocus: true,
      disableClose: true,
      position: { top: '30px' },
      data: {
        type: 'todo'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.svc.getTasks().subscribe((tasks: Task[]) => {
          this.tasks = this.sortTasksByTime(tasks);
          this.filteredTasks = this.filterTasks(this.tasks);
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
    const dialogRef = this.dialog.open(TaskFormComponent, {
      width: '800px',
      height: '700px',
      maxHeight: '90vh',
      panelClass: ['mat-elevation-z8'],
      autoFocus: true,
      disableClose: true,
      position: { top: '30px' },
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
    
    // ビューモード切り替え後にドラッグ&ドロップを再初期化
    setTimeout(() => {
      this.initializeTouchDragSupport();
    }, 0);
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
    if (this.dialog) {
      this.dialog.closeAll();
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

  // カテゴリーのドラッグアンドドロップ
  async onCategoryDrop(event: CdkDragDrop<Category[]>) {
    if (event.previousIndex === event.currentIndex) return;
    
    // UIの更新
    moveItemInArray(this.categories, event.previousIndex, event.currentIndex);
    
    // 新しい順序でカテゴリーを更新
    const updatedCategories = this.categories.map((category, idx) => ({
      ...category,
      order: idx
    }));

    // Firestoreに保存
    try {
      await this.categorySvc.updateCategoryOrder(updatedCategories);
      // 保存成功後、ローカルのカテゴリーを更新
      this.categories = updatedCategories;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('カテゴリーの順序更新に失敗しました:', error);
      // エラー時は元の順序に戻す
      this.categories = [...this.categories].sort((a, b) => (a.order || 0) - (b.order || 0));
      this.cdr.detectChanges();
    }
  }

  // タスクのドラッグアンドドロップ
  async onTaskDrop(event: CdkDragDrop<Task[]>, status: StatusMaster | string) {
    if (event.previousContainer === event.container) {
      // 同じステータス内での移動
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      
      // 順序を更新
      const updatedTasks = event.container.data;
      for (let i = 0; i < updatedTasks.length; i++) {
        const task = updatedTasks[i];
        task.order = i;
        task.updatedAt = new Date().toISOString();
        try {
          await this.svc.updateTask(task);
        } catch (error) {
          console.error('タスクの順序更新に失敗:', error);
          this.snackBar.open('タスクの順序更新に失敗しました', '閉じる', { duration: 3000 });
        }
      }
    } else {
      // 異なるステータス間での移動
      const task = event.previousContainer.data[event.previousIndex];
      const newStatus = typeof status === 'string' ? status : status.name;
      
      // タスクのステータスを更新
      task.status = newStatus;
      task.updatedAt = new Date().toISOString();
      
      try {
        // タスクを更新
        await this.svc.updateTask(task);
        
        // リストを再ソート（自動ソートが有効な場合のみ）
        this.applyAutoSortIfEnabled();
        
        this.snackBar.open('タスクのステータスを更新しました', '閉じる', { duration: 3000 });
      } catch (error) {
        console.error('タスクのステータス更新に失敗:', error);
        this.snackBar.open('タスクのステータス更新に失敗しました', '閉じる', { duration: 3000 });
      }
    }
  }

  async clearCache() {
    try {
      await this.svc.clearFirestoreCache();
      // カテゴリーとステータスも再読み込み
      this.categorySvc.getCategories().subscribe(categories => {
        this.categories = categories;
      });
      if (this.selectedCategoryId) {
        await this.statusService.initializeStatuses(this.selectedCategoryId);
      }
    } catch (error) {
      console.error('キャッシュのクリアに失敗しました:', error);
    }
  }

  // 自動ソートが有効な場合のみソートを適用するメソッド
  private applyAutoSortIfEnabled() {
    if (this.autoSort) {
      this.tasks = this.sortTasksByTime(this.tasks);
      this.filteredTasks = this.filterTasks(this.tasks);
      this.cdr.detectChanges();
    }
  }

  // 手動で時系列ソートを実行するメソッド
  manualSortTasks() {
    this.tasks = this.sortTasksByTime(this.tasks);
    this.filteredTasks = this.filterTasks(this.tasks);
    this.cdr.detectChanges();
    this.snackBar.open('タスクを時系列で並び替えました', '閉じる', { duration: 3000 });
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
