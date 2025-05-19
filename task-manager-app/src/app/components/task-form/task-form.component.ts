import { Component, OnInit, Inject, ViewChild, ElementRef, ChangeDetectorRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormControl, ValidationErrors, NgForm, ValidatorFn, AbstractControl } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialog, MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { v4 as uuidv4 } from 'uuid';
import { TaskService } from '../../services/task.service';
import { Task, SubTask, DEFAULT_CATEGORIES, NotificationSettings } from '../../models/task.model';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../models/category.model';
import { NgxMatTimepickerModule } from 'ngx-mat-timepicker';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { NotificationSettingsComponent } from '../notification-settings/notification-settings.component';
import { isBefore, parse, parseISO } from 'date-fns';
import { Subscription } from 'rxjs';

const TITLE_MAX_LENGTH = 100;

@Component({
  selector: 'app-task-form',
  templateUrl: './task-form.component.html',
  styleUrls: ['./task-form.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatCardModule,
    MatDialogModule,
    MatChipsModule,
    NgxMatTimepickerModule,
    MatTooltipModule,
    MatButtonToggleModule,
    MatMenuModule,
    NotificationSettingsComponent
  ],
  providers: [
    provideNativeDateAdapter(),
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        hasBackdrop: true,
        disableClose: true,
        autoFocus: true,
        panelClass: 'no-animation-dialog',
        animationDuration: '0ms'
      }
    }
  ]
})
export class TaskFormComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('taskForm') taskForm!: NgForm;
  @ViewChild('titleInput') titleInput!: ElementRef<HTMLInputElement>;
  form!: FormGroup;
  activeTab: 'todo' | 'schedule' = 'todo';
  categories: string[] = [];
  editTaskId?: string;
  showAddCategory = false;
  newCategoryControl = new FormControl('');
  newSubTaskTitle = '';
  isSubmitting = false;
  categoryMap = new Map<string, string>(); // カテゴリー名からIDへのマッピング
  private subscriptions: Subscription[] = [];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<TaskFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      id?: string;
      type?: 'todo' | 'schedule';
      initialDate?: Date;
      task?: Task;
    },
    private taskSvc: TaskService,
    private categorySvc: CategoryService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {
    this.activeTab = data?.type || 'todo';
    this.initializeForm(undefined, data?.initialDate);
  }

  ngOnInit() {
    // カテゴリーの読み込み
    this.categorySvc.getCategories().subscribe(categories => {
      this.categoryMap = new Map(categories.map(cat => [cat.name, cat.id]));
      this.categories = categories.map(c => c.name);
      
      // 編集モードの場合
      const id = this.data?.id;
      if (id) {
        this.editTaskId = id;
        if (this.data?.task) {
          // 既存のタスクデータがある場合は直接使用
          this.loadTaskIntoForm(this.data.task);
        } else {
          // タスクデータがない場合は取得
          this.taskSvc.getTasks().subscribe(tasks => {
            const task = tasks.find(t => t.id === id);
            if (task) {
              this.loadTaskIntoForm(task);
            }
          });
        }
      } else {
        // 新規作成モードの場合
        if (this.categories.length > 0) {
          this.form.patchValue({
            category: this.categories[0]
          });
        }
      }
    });

    // フォームの状態変更を監視
    this.form.statusChanges.subscribe(status => {
      this.cdr.detectChanges();
    });
  }

  ngAfterViewInit() {
    // フォームの表示を確実にする
    setTimeout(() => {
      this.titleInput?.nativeElement.focus();
      this.cdr.detectChanges();
    }, 0);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }

  switchTab(tab: 'todo' | 'schedule') {
    // 現在のフォームの値を保存
    const currentValues = this.form?.value;
    
    // 共通フィールドの値を保持
    const commonFields = {
      title: currentValues?.title || '',
      category: currentValues?.category || '',
      categoryId: this.categoryMap.get(currentValues?.category || '') || '',
      relatedLinks: currentValues?.relatedLinks || [],
      memo: currentValues?.memo || '',
      notification: currentValues?.notification || {
        enabled: false,
        type: 'ブラウザ',
        timing: '10分前',
        priority: '中',
        soundEnabled: true,
        repeat: {
          enabled: false,
          interval: 5,
          maxRepeat: 3
        }
      },
      description: currentValues?.description || '',
      status: currentValues?.status || '未着手',
      completed: currentValues?.completed || false,
      noTask: currentValues?.noTask || false,
      repeat: currentValues?.repeat || {
        enabled: false,
        frequency: '毎週',
        startDate: null,
        daysOfWeek: [],
        dayOfMonth: null,
        month: null
      }
    };
    
    this.activeTab = tab;
    
    // 編集中のタスクを取得
    let editingTask: Task | undefined;
    if (this.editTaskId) {
      this.taskSvc.getTasks().subscribe(tasks => {
        editingTask = tasks.find(t => t.id === this.editTaskId);
        // フォームを初期化（編集中のタスクまたは共通フィールドの値を使用）
        const initialValues: Task = {
          id: editingTask?.id || uuidv4(),
          ...commonFields,
          // タブ固有のフィールドはリセット
          dueDate: currentValues?.dueDate || null,
          dueTime: tab === 'todo' ? currentValues?.dueTime : null,
          startTime: tab === 'schedule' ? currentValues?.startTime : null,
          endTime: tab === 'schedule' ? currentValues?.endTime : null,
          createdAt: editingTask?.createdAt ? (typeof editingTask.createdAt === 'string' ? editingTask.createdAt : new Date(editingTask.createdAt).toISOString()) : new Date().toISOString(),
          updatedAt: editingTask?.updatedAt ? (typeof editingTask.updatedAt === 'string' ? editingTask.updatedAt : new Date(editingTask.updatedAt).toISOString()) : new Date().toISOString()
        };
        this.initializeForm(initialValues);
      });
    } else {
      const initialValues: Task = {
        id: uuidv4(),
        ...commonFields,
        dueDate: currentValues?.dueDate || this.data?.initialDate || null,
        dueTime: tab === 'todo' ? currentValues?.dueTime : null,
        startTime: tab === 'schedule' ? currentValues?.startTime : null,
        endTime: tab === 'schedule' ? currentValues?.endTime : null,
        noTask: tab === 'schedule' ? currentValues?.noTask : false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.initializeForm(initialValues);
    }

    // フォーム再初期化後にバリデーター再設定
    setTimeout(() => {
      if (this.form) {
        this.form.setValidators([
          notificationFutureValidator(this.activeTab),
          repeatDetailRequiredValidator(),
          targetBeforeDueDateValidator()
        ]);
        this.form.updateValueAndValidity();
      }
    }, 0);
  }

  private initializeForm(task?: Task, initialDate?: Date) {
    // 共通フィールドの定義
    const commonFields = {
      title: [task?.title || '', [Validators.required, Validators.minLength(1), Validators.maxLength(TITLE_MAX_LENGTH)]],
      category: [task?.category || '', [Validators.required]],
      categoryId: [task?.categoryId || this.categoryMap.get(task?.category || '') || ''],
      memo: [task?.memo || ''],
      description: [task?.description || ''],
      notification: [task?.notification || {
        enabled: false,
        type: 'ブラウザ',
        timing: '10分前',
        priority: '中',
        soundEnabled: true,
        repeat: {
          enabled: false,
          interval: 5,
          maxRepeat: 3
        }
      }],
      relatedLinks: this.fb.array(
        (task?.relatedLinks && task.relatedLinks.length > 0)
          ? task.relatedLinks.map(link => this.fb.control(link))
          : [this.createLinkControl()]
      ),
      repeat: this.fb.group({
        enabled: [task?.repeat?.enabled || false],
        frequency: [task?.repeat?.frequency || '毎週'],
        startDate: [task?.repeat?.startDate ? new Date(task.repeat.startDate) : null],
        daysOfWeek: [task?.repeat?.daysOfWeek || []],
        dayOfMonth: [task?.repeat?.dayOfMonth || null],
        month: [task?.repeat?.month || null]
      })
    };

    // タブに応じたフォームグループの作成
    const formGroup = this.activeTab === 'todo'
      ? {
          ...commonFields,
          dueDate: [initialDate || (task?.dueDate ? new Date(task.dueDate) : null)],
          dueTime: [task?.dueTime || ''],
          subTasks: this.fb.array(
            task?.subTasks?.map(subTask => this.fb.group({
              id: [subTask.id],
              title: [subTask.title],
              completed: [subTask.completed]
            })) || []
          )
        }
      : {
          ...commonFields,
          dueDate: [initialDate || (task?.dueDate ? new Date(task.dueDate) : null)],
          startTime: [task?.startTime || ''],
          endTime: [task?.endTime || ''],
          noTask: [task?.noTask || false],
          subTasks: this.fb.array(
            task?.subTasks?.map(subTask => this.fb.group({
              id: [subTask.id],
              title: [subTask.title],
              completed: [subTask.completed]
            })) || []
          )
        };

    // フォームグループの作成
    this.form = this.fb.group(formGroup);
    
    // バリデーターを設定
    this.form.setValidators([
      notificationFutureValidator(this.activeTab),
      repeatDetailRequiredValidator(),
      targetBeforeDueDateValidator()
    ]);
    
    // 初期バリデーション実行
    this.form.updateValueAndValidity({ emitEvent: false });

    // 既存の購読を解除
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];

    // 日付フィールドの変更を監視
    const dueDateSub = this.form.get('dueDate')?.valueChanges.subscribe(() => {
      this.form.updateValueAndValidity({ emitEvent: false });
    });
    if (dueDateSub) this.subscriptions.push(dueDateSub);

    // フォームの状態変更を監視
    const statusSub = this.form.statusChanges.subscribe(status => {
      this.cdr.detectChanges();
    });
    this.subscriptions.push(statusSub);

    // 日付をまたぐスケジュールの監視
    const startDateSub = this.form.get('startDate')?.valueChanges.subscribe(() => this.updateCrossDayStatus());
    if (startDateSub) this.subscriptions.push(startDateSub);
    const endDateSub = this.form.get('endDate')?.valueChanges.subscribe(() => this.updateCrossDayStatus());
    if (endDateSub) this.subscriptions.push(endDateSub);
    const startTimeSub = this.form.get('startTime')?.valueChanges.subscribe(() => this.updateCrossDayStatus());
    if (startTimeSub) this.subscriptions.push(startTimeSub);
    const endTimeSub = this.form.get('endTime')?.valueChanges.subscribe(() => this.updateCrossDayStatus());
    if (endTimeSub) this.subscriptions.push(endTimeSub);

    // 繰り返し設定の変更を監視
    const repeatEnabledSub = this.form.get('repeat.enabled')?.valueChanges.subscribe(enabled => {
      const dueDateControl = this.form.get('dueDate');
      const startTimeControl = this.form.get('startTime');
      const endTimeControl = this.form.get('endTime');

      if (this.activeTab === 'schedule' && enabled) {
        // スケジュールタブで繰り返しONなら必須バリデーションを外す
        dueDateControl?.clearValidators();
      } else if (this.activeTab === 'schedule') {
        // スケジュールタブで繰り返しOFFなら必須
        dueDateControl?.setValidators([Validators.required]);
      }
      dueDateControl?.updateValueAndValidity();
    });
    if (repeatEnabledSub) this.subscriptions.push(repeatEnabledSub);

    // 時間設定の変更を監視
    const startTimeRepeatSub = this.form.get('startTime')?.valueChanges.subscribe(() => {
      const repeatEnabled = this.form.get('repeat.enabled')?.value;
      if (repeatEnabled) {
        const dueDateControl = this.form.get('dueDate');
        if (!dueDateControl?.value) {
          dueDateControl?.setValue(new Date());
        }
      }
    });
    if (startTimeRepeatSub) this.subscriptions.push(startTimeRepeatSub);

    const endTimeRepeatSub = this.form.get('endTime')?.valueChanges.subscribe(() => {
      const repeatEnabled = this.form.get('repeat.enabled')?.value;
      if (repeatEnabled) {
        const dueDateControl = this.form.get('dueDate');
        if (!dueDateControl?.value) {
          dueDateControl?.setValue(new Date());
        }
      }
    });
    if (endTimeRepeatSub) this.subscriptions.push(endTimeRepeatSub);
  }

  private createLinkControl(): FormControl {
    return this.fb.control('', [Validators.pattern('https?://.+')]);
  }

  // FormArray Getters
  get relatedLinks(): FormArray {
    return this.form.get('relatedLinks') as FormArray;
  }

  get subTasks(): FormArray {
    return this.form.get('subTasks') as FormArray;
  }

  // 関連リンク
  addLink() {
    this.relatedLinks.push(this.createLinkControl());
  }

  removeLink(index: number) {
    if (this.relatedLinks.length > 1) {
      this.relatedLinks.removeAt(index);
    }
  }

  // バリデーションヘルパー
  getErrorMessage(fieldName: string): string {
    const field = this.form.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) {
      if (fieldName === 'dueDate' && this.form.get('repeat.enabled')?.value) {
        return ''; // 繰り返し設定が有効な場合は日付のエラーを表示しない
      }
      return 'この項目は必須です';
    }
    if (field.errors['minlength']) {
      return '1文字以上入力してください';
    }
    if (field.errors['maxlength']) {
      return `最大${TITLE_MAX_LENGTH}文字まで入力できます`;
    }
    if (field.errors['timeRange']) {
      return '開始時間は終了時間より前である必要があります';
    }
    if (field.errors['requiredDate']) {
      return '繰り返し設定を使用しない場合は日付の入力が必要です';
    }
    if (field.errors['targetBeforeDue']) {
      return '目標完了日は締め切り日より前の日付にしてください';
    }
    return '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    if (!field) return false;

    // 繰り返し設定が有効な場合は日付のバリデーションを無視
    if (fieldName === 'dueDate' && this.form.get('repeat.enabled')?.value) {
      return false;
    }

    // フォーム全体のエラーもチェック
    const hasFormError = this.form.errors?.['targetBeforeDue'] && 
      (fieldName === 'dueDate' || fieldName === 'targetCompletionDate');

    return (field.invalid && (field.dirty || field.touched)) || hasFormError;
  }

  // フォーム送信
  async onSubmit() {
    // 送信中は重複クリックを防止
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    try {
      const formValue = this.form.value;
      const categoryId = this.categoryMap.get(formValue.category) || formValue.categoryId || formValue.category;

      // 通知バリデーション - 新規・編集共通のロジックとして実装
      if (this.form.get('notification')?.value?.enabled) {
        let dueDate: Date | null = null;
        let dueTime: string | null = null;
        
        // Todoタスクとスケジュールタスクの処理分岐
        if (this.activeTab === 'todo') {
          dueDate = this.form.get('dueDate')?.value ? new Date(this.form.get('dueDate')?.value) : null;
          dueTime = this.form.get('dueTime')?.value || null;
        } else {
          dueDate = this.form.get('dueDate')?.value ? new Date(this.form.get('dueDate')?.value) : null;
          dueTime = this.form.get('startTime')?.value || null;
        }
        
        if (dueDate && dueTime) {
          // 時刻を合成
          const [h, m] = dueTime.split(':');
          dueDate.setHours(Number(h), Number(m), 0, 0);
          
          // 編集時も新規作成時も同じチェックを実施
          if (isBefore(dueDate, new Date())) {
            this.snackBar.open('今の時間よりあとの時間に設定してください', '閉じる', { duration: 4000 });
            this.isSubmitting = false;
            return;
          }
        } else {
          this.snackBar.open('通知を設定するには日付と時間が必要です', '閉じる', { duration: 4000 });
          this.isSubmitting = false;
          return;
        }
      }

      // スケジュールの場合は日付・開始時間・終了時間すべて必須
      if (this.activeTab === 'schedule') {
        const repeatEnabled = this.form.get('repeat.enabled')?.value;
        if ((!repeatEnabled && (!formValue.dueDate || !formValue.startTime || !formValue.endTime)) ||
            (repeatEnabled && (!formValue.startTime || !formValue.endTime))) {
          this.snackBar.open('スケジュール登録には' + (repeatEnabled ? '開始時間・終了時間' : '日付・開始時間・終了時間') + 'が必須です', '閉じる', { duration: 4000 });
          this.isSubmitting = false;
          return;
        }
      }

      // 新規追加時、startTimeまたはendTimeのみ設定でdueDateが未設定の場合は保存不可
      if (!this.editTaskId) {
        const hasStartOrEnd = !!formValue.startTime || !!formValue.endTime;
        const repeatEnabled = this.form.get('repeat.enabled')?.value;
        if (hasStartOrEnd && !formValue.dueDate && !repeatEnabled) {
          this.snackBar.open('スケジュールには開始時間、終了時間、日付が仮でも必須です', '閉じる', { duration: 4000 });
          this.isSubmitting = false;
          return;
        }
      }

      // 日付と時間の両方が設定されている場合のみ通知を有効にする
      if (formValue.notification?.enabled) {
        if (!formValue.dueDate && !formValue.startTime && !formValue.dueTime) {
          formValue.notification.enabled = false;
          this.snackBar.open('通知を設定するには、その日付と時間（開始時間または期限時刻）を指定してください。', '閉じる', { duration: 4000 });
        }
      }

      // サブタスクの処理
      const subTasks = formValue.subTasks?.map((subTask: any) => ({
        id: subTask.id || uuidv4(),
        title: subTask.title,
        completed: subTask.completed || false
      })) || [];

      // 日付フィールドの処理を強化
      const processDateField = (dateValue: any): Date | null => {
        if (!dateValue) return null;
        // 本物のDate型
        if (Object.prototype.toString.call(dateValue) === '[object Date]') {
          return new Date(dateValue.setHours(0, 0, 0, 0));
        }
        // Firestore Timestamp型
        if (typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
          const d = dateValue.toDate();
          return new Date(d.setHours(0, 0, 0, 0));
        }
        // {seconds, nanoseconds}型
        if (typeof dateValue === 'object' && dateValue.seconds !== undefined) {
          const d = new Date(dateValue.seconds * 1000);
          return new Date(d.setHours(0, 0, 0, 0));
        }
        // 日本語ローカライズ文字列対応
        if (typeof dateValue === 'string') {
          const match = dateValue.match(/^([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日/);
          if (match) {
            const [_, y, m, d] = match;
            return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00`);
          }
          const d = new Date(dateValue);
          return !isNaN(d.getTime()) ? new Date(d.setHours(0, 0, 0, 0)) : null;
        }
        // [object Object]（Material Datepicker等）
        if (typeof dateValue === 'object') {
          try {
            const iso = JSON.stringify(dateValue);
            const d = new Date(iso);
            if (!isNaN(d.getTime())) return new Date(d.setHours(0, 0, 0, 0));
          } catch {}
        }
        // 文字列や数値
        const d = new Date(dateValue);
        return !isNaN(d.getTime()) ? new Date(d.setHours(0, 0, 0, 0)) : null;
      };

      const dueDateValue = processDateField(formValue.dueDate);
      // dueDateは必ずDate型で統一
      const dueDate: Date | undefined = dueDateValue instanceof Date && !isNaN(dueDateValue.getTime()) ? dueDateValue : undefined;

      // scheduleDateの決定
      let scheduleDate: Date | undefined = undefined;
      if (dueDate) {
        scheduleDate = dueDate;
      } else if (formValue.createdAt) {
        scheduleDate = new Date(formValue.createdAt);
      }

      // タスクオブジェクトの作成
      const task: Task = {
        id: this.editTaskId || uuidv4(),
        title: formValue.title,
        category: formValue.category,
        categoryId: categoryId,
        status: formValue.status || '未着手',
        dueDate: dueDate,
        dueTime: formValue.dueTime || '',
        scheduleDate: (formValue.startTime || formValue.endTime) ? scheduleDate : undefined,
        relatedLinks: formValue.relatedLinks?.filter((link: string) => link?.trim() !== '') || [],
        subTasks: subTasks,
        memo: formValue.memo || '',
        description: formValue.description || '',
        completed: formValue.completed || false,
        noTask: formValue.noTask || false,
        startTime: formValue.startTime || '',
        endTime: formValue.endTime || '',
        notification: formValue.notification ?? true,
        repeat: formValue.repeat,
        createdAt: this.editTaskId ? (formValue.createdAt ? new Date(formValue.createdAt).toISOString() : new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (this.editTaskId) {
        // 既存のタスクを更新
        await this.taskSvc.updateTask(task);
        this.snackBar.open('タスクを更新しました', '閉じる', { duration: 3000 });
      } else {
        // 新規タスクを作成
        await this.taskSvc.addTask(task);
        this.snackBar.open('タスクを追加しました', '閉じる', { duration: 3000 });
      }

      this.dialogRef.close(task);
      this.forceRemoveOverlay();
    } catch (error) {
      console.error('タスクの保存に失敗しました:', error);
      this.snackBar.open('タスクの保存に失敗しました', '閉じる', { duration: 4000 });
    } finally {
      this.isSubmitting = false;
    }
  }

  onCancel() {
    this.dialogRef.close(false);
  }

  private forceRemoveOverlay() {
    // 即時実行
    this.removeOverlayElements();
    // 追加のクリーンアップを実行
    setTimeout(() => {
      const overlayContainer = document.querySelector('.cdk-overlay-container');
      if (overlayContainer) {
        overlayContainer.innerHTML = '';
      }
    }, 0);
  }

  private removeOverlayElements() {
    const overlayContainer = document.querySelector('.cdk-overlay-container');
    if (overlayContainer) {
      // バックドロップの削除
      const backdrops = overlayContainer.querySelectorAll('.cdk-overlay-backdrop');
      backdrops.forEach(backdrop => {
        if (backdrop instanceof HTMLElement) {
          backdrop.remove();
        }
      });
      
      // オーバーレイの削除
      const overlays = overlayContainer.querySelectorAll('.cdk-overlay-pane');
      overlays.forEach(overlay => {
        if (overlay instanceof HTMLElement) {
          overlay.remove();
        }
      });
    }
  }

  onShowAddCategory(event: Event) {
    this.showAddCategory = true;
    event.stopPropagation();
  }

  async addCategory() {
    const name = (this.newCategoryControl.value || '').trim();
    if (name) {
      try {
        await this.categorySvc.add(name);
        if (this.form.get('category')) {
          this.form.get('category')?.setValue(name);
        }
      } catch (error) {
        console.error('カテゴリーの追加に失敗しました:', error);
      }
    }
    this.newCategoryControl.setValue('');
    this.showAddCategory = false;
  }

  // 時間範囲のバリデーター
  private timeRangeValidator(group: FormGroup): ValidationErrors | null {
    if (!group) return null;

    const startTime = group.get('startTime')?.value;
    const endTime = group.get('endTime')?.value;
    
    // 両方の時間が入力されている場合のみバリデーション
    if (!startTime || !endTime) {
      return null;
    }

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    // 開始時間が終了時間より後の場合はエラー
    if (startMinutes >= endMinutes) {
      return { timeRange: true };
    }
    
    return null;
  }

  // 条件付きの日付バリデーター
  private conditionalDateValidator(group: FormGroup): ValidationErrors | null {
    if (!group) return null;

    const repeat = group.get('repeat')?.value;
    const dueDate = group.get('dueDate')?.value;

    // 日付の必須設定を解除
    return null;
  }

  // 月の日数を取得するヘルパーメソッド
  getDaysInMonth(): number[] {
    return Array.from({length: 31}, (_, i) => i + 1);
  }

  // 通知設定の変更を処理
  onNotificationSettingsChange(settings: NotificationSettings) {
    // 通知設定の更新（emitEvent: falseでイベント発火を防止）
    this.form.patchValue({ notification: settings }, { emitEvent: false });
    
    // 通知が有効で、過去の時間に設定されている場合の処理
    if (settings.enabled) {
      const dueDate = this.form.get('dueDate')?.value ? new Date(this.form.get('dueDate')?.value) : null;
      const dueTime = this.activeTab === 'todo' ? 
        this.form.get('dueTime')?.value : 
        this.form.get('startTime')?.value;
      
      if (dueDate && dueTime) {
        const [h, m] = dueTime.split(':');
        dueDate.setHours(Number(h), Number(m), 0, 0);
        
        if (isBefore(dueDate, new Date())) {
          this.snackBar.open('今の時間よりあとの時間に設定してください', '閉じる', { duration: 4000 });
          // 通知をオフにする（emitEvent: falseでイベント発火を防止）
          this.form.patchValue({ 
            notification: { ...settings, enabled: false } 
          }, { emitEvent: false });
        }
      }
    }

    // 最後に一度だけバリデーションを実行
    this.form.updateValueAndValidity({ emitEvent: true });
  }

  // 日付をまたぐかどうかを判定して更新
  private updateCrossDayStatus() {
    const startDate = this.form.get('startDate')?.value;
    const endDate = this.form.get('endDate')?.value;
    const startTime = this.form.get('startTime')?.value;
    const endTime = this.form.get('endTime')?.value;

    if (startDate && endDate && startTime && endTime) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // 時刻を設定
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      start.setHours(startHour, startMinute);
      end.setHours(endHour, endMinute);

      // 日付が異なるか、または終了時刻が開始時刻より前の場合は日付をまたぐと判定
      const isCrossDay = start.getDate() !== end.getDate() || 
                        (start.getDate() === end.getDate() && endTime < startTime);
      
      this.form.patchValue({ isCrossDay }, { emitEvent: false });
    }
  }

  private loadTaskIntoForm(task: Task) {
    // タブの種類を判断
    if ((task.startTime || task.endTime) && !task.dueTime) {
      this.activeTab = 'schedule';
    } else {
      this.activeTab = 'todo';
    }

    // フォームを初期化し直す
    this.initializeForm(task);

    // 基本フィールド
    this.form.patchValue({
      title: task.title || '',
      category: task.category || '',
      categoryId: task.categoryId || this.categoryMap.get(task.category || '') || '',
      memo: task.memo || '',
      description: task.description || '',
      notification: task.notification || {
        enabled: false,
        type: 'ブラウザ',
        timing: '10分前',
        priority: '中',
        soundEnabled: true,
        repeat: { enabled: false, interval: 5, maxRepeat: 3 }
      },
      completed: task.completed || false,
      noTask: task.noTask || false
    });

    // 日付・時刻
    if (task.dueDate) {
      try {
        const dueDate = typeof task.dueDate === 'string' ? new Date(task.dueDate) : task.dueDate;
        this.form.get('dueDate')?.setValue(dueDate);
      } catch (e) { console.error('期限日付パースエラー:', e); }
    }

    if (this.activeTab === 'todo') {
      if (task.dueTime) {
        this.form.get('dueTime')?.setValue(task.dueTime);
      }
    } else {
      if (task.startTime) {
        this.form.get('startTime')?.setValue(task.startTime);
      }
      if (task.endTime) {
        this.form.get('endTime')?.setValue(task.endTime);
      }
    }

    // 繰り返し設定
    if (task.repeat) {
      this.form.get('repeat')?.patchValue({
        enabled: task.repeat.enabled || false,
        frequency: task.repeat.frequency || '毎週',
        startDate: task.repeat.startDate ? new Date(task.repeat.startDate) : null,
        daysOfWeek: task.repeat.daysOfWeek || [],
        dayOfMonth: task.repeat.dayOfMonth || null,
        month: task.repeat.month || null
      });
    }

    // FormArray
    const subTasksArray = this.form.get('subTasks') as FormArray;
    subTasksArray.clear();
    if (task.subTasks && task.subTasks.length > 0) {
      task.subTasks.forEach(subTask => {
        subTasksArray.push(this.fb.group({
          id: [subTask.id || uuidv4()],
          title: [subTask.title || ''],
          completed: [!!subTask.completed]
        }));
      });
    }

    const linksArray = this.form.get('relatedLinks') as FormArray;
    linksArray.clear();
    if (task.relatedLinks && task.relatedLinks.length > 0) {
      task.relatedLinks.forEach(link => linksArray.push(this.fb.control(link)));
    } else {
      linksArray.push(this.createLinkControl());
    }

    this.form.markAsPristine();
    this.form.updateValueAndValidity();

    // 通知設定の読み込み時にバリデーションを実行
    if (task.notification?.enabled) {
      const dueDate = task.dueDate ? new Date(task.dueDate) : null;
      const dueTime = this.activeTab === 'todo' ? task.dueTime : task.startTime;
      
      if (dueDate && dueTime) {
        const [h, m] = dueTime.split(':');
        dueDate.setHours(Number(h), Number(m), 0, 0);
        
        // 過去の時間の場合は通知をオフにする（emitEvent: falseでイベント発火を防止）
        if (isBefore(dueDate, new Date())) {
          const notification = { ...task.notification, enabled: false };
          this.form.patchValue({ notification }, { emitEvent: false });
          this.snackBar.open('過去の日時に通知を設定できないため、通知をオフにしました', '閉じる', { duration: 4000 });
        }
      }
    }

    // 最後に一度だけバリデーションを実行
    this.form.updateValueAndValidity({ emitEvent: true });
  }

  // サブタスク追加
  addSubTask() {
    const title = this.newSubTaskTitle.trim();
    if (title) {
      this.subTasks.push(this.fb.group({
        id: [uuidv4()],
        title: [title],
        completed: [false]
      }));
      this.newSubTaskTitle = '';
    }
  }

  // サブタスク削除
  removeSubTask(index: number) {
    this.subTasks.removeAt(index);
  }
}

// 通知日時が未来かどうかのバリデーター
function notificationFutureValidator(tab: 'todo' | 'schedule'): ValidatorFn {
  // 時刻パース関数
  function parseTimeToDate(date: Date, timeStr: string): Date | null {
    if (!date || !timeStr) return null;
    let h = 0, m = 0;
    // 24時間表記
    const match24 = timeStr.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (match24) {
      h = parseInt(match24[1], 10);
      m = parseInt(match24[2], 10);
    } else {
      // AM/PM表記
      const matchAmPm = timeStr.match(/^([01]?\d):([0-5]\d)\s*(AM|PM)$/i);
      if (matchAmPm) {
        h = parseInt(matchAmPm[1], 10);
        m = parseInt(matchAmPm[2], 10);
        const isPM = matchAmPm[3].toUpperCase() === 'PM';
        if (h === 12) h = isPM ? 12 : 0;
        else if (isPM) h += 12;
      } else {
        return null; // 不正な時刻
      }
    }
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d;
  }

  return (control: AbstractControl): ValidationErrors | null => {
    const notification = control.get('notification')?.value;
    if (!notification?.enabled) return null;
    const dueDateRaw = control.get('dueDate')?.value;
    const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
    let dueTime: string | null = null;
    if (tab === 'todo') {
      dueTime = control.get('dueTime')?.value;
    } else {
      dueTime = control.get('startTime')?.value;
      if (!dueTime || dueTime.trim() === '') {
        return { notificationFuture: '通知を設定するには日付と開始時間が必要です' };
      }
    }
    if (!dueDate || !dueTime) {
      return { notificationFuture: '通知を設定するには日付と時間が必要です' };
    }
    const dateWithTime = parseTimeToDate(dueDate, dueTime);
    if (!dateWithTime || isNaN(dateWithTime.getTime())) {
      return { notificationFuture: '通知を設定するには正しい日付と時間が必要です' };
    }
    if (isBefore(dateWithTime, new Date())) {
      if (tab === 'schedule') {
        return { notificationFuture: '過去のスケジュールなので通知できません' };
      } else {
        return { notificationFuture: '今の時間よりあとの時間に設定してください' };
      }
    }
    const minBufferMinutes = 5;
    let notificationMinutes = 0;
    switch (notification.timing) {
      case '5分前': notificationMinutes = 5; break;
      case '10分前': notificationMinutes = 10; break;
      case '15分前': notificationMinutes = 15; break;
      case '30分前': notificationMinutes = 30; break;
      case '1時間前': notificationMinutes = 60; break;
      case '2時間前': notificationMinutes = 120; break;
      case '1日前': notificationMinutes = 1440; break;
      default:
        notificationMinutes = 0;
    }
    const notificationDate = new Date(dateWithTime.getTime() - notificationMinutes * 60 * 1000);
    const now = new Date();
    if (notificationDate.getTime() - now.getTime() < minBufferMinutes * 60 * 1000) {
      return { notificationFuture: `通知タイミングが適切ではありません` };
    }
    return null;
  };
}

function repeatDetailRequiredValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const repeatGroup = control.get('repeat');
    if (!repeatGroup) return null;
    const enabled = repeatGroup.get('enabled')?.value;
    const freq = repeatGroup.get('frequency')?.value;
    if (!enabled) return null;
    if (freq === '毎週') {
      const daysOfWeek = repeatGroup.get('daysOfWeek')?.value;
      if (!daysOfWeek || !Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
        return { repeatDetailRequired: '曜日を1つ以上選択してください' };
      }
    }
    if (freq === '毎月') {
      const dayOfMonth = repeatGroup.get('dayOfMonth')?.value;
      if (!dayOfMonth) {
        return { repeatDetailRequired: '日にちを指定してください' };
      }
    }
    if (freq === '毎年') {
      const dayOfMonth = repeatGroup.get('dayOfMonth')?.value;
      const month = repeatGroup.get('month')?.value;
      if (!month && month !== 0) {
        return { repeatDetailRequired: '月を指定してください' };
      }
      if (!dayOfMonth) {
        return { repeatDetailRequired: '日にちを指定してください' };
      }
    }
    return null;
  };
}

function targetBeforeDueDateValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const dueDateRaw = group.get('dueDate')?.value;
    const targetDateRaw = group.get('targetCompletionDate')?.value;

    if (dueDateRaw && targetDateRaw) {
      const due = new Date(dueDateRaw);
      due.setHours(0, 0, 0, 0);
      const target = new Date(targetDateRaw);
      target.setHours(0, 0, 0, 0);

      if (target >= due) {
        group.get('targetCompletionDate')?.setErrors({ targetBeforeDue: '目標完了日は締め切り日より前の日付にしてください' });
        return { targetBeforeDue: '目標完了日は締め切り日より前の日付にしてください' };
      } else {
        // 他のエラーがなければクリア
        const ctrl = group.get('targetCompletionDate');
        if (ctrl?.errors && ctrl.errors['targetBeforeDue']) {
          const { targetBeforeDue, ...rest } = ctrl.errors;
          if (Object.keys(rest).length === 0) {
            ctrl.setErrors(null);
          } else {
            ctrl.setErrors(rest);
          }
        }
      }
    } else {
      // どちらか未入力ならtargetBeforeDueエラーはクリア
      const ctrl = group.get('targetCompletionDate');
      if (ctrl?.errors && ctrl.errors['targetBeforeDue']) {
        const { targetBeforeDue, ...rest } = ctrl.errors;
        if (Object.keys(rest).length === 0) {
          ctrl.setErrors(null);
        } else {
          ctrl.setErrors(rest);
        }
      }
    }
    return null;
  };
}