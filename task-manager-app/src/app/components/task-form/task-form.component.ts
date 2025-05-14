// src/app/components/task-form/task-form.component.ts

import { Component, OnInit, Inject, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, FormControl, ValidationErrors, NgForm } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialog } from '@angular/material/dialog';
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
import { Task, SubTask, Label, DEFAULT_LABELS, DEFAULT_CATEGORIES, NotificationSettings } from '../../models/task.model';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../models/category.model';
import { NgxMatTimepickerModule } from 'ngx-mat-timepicker';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { LabelService } from '../../services/label.service';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { NotificationSettingsComponent } from '../notification-settings/notification-settings.component';

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
  providers: [provideNativeDateAdapter()]
})
export class TaskFormComponent implements OnInit {
  @ViewChild('taskForm') taskForm!: NgForm;
  form!: FormGroup;
  activeTab: 'todo' | 'schedule' = 'todo';
  categories: string[] = [];
  availableLabels: Label[] = [];
  editTaskId?: string;
  showAddCategory = false;
  newCategoryControl = new FormControl('');
  newSubTaskTitle = '';
  newLabelControl = new FormControl('');
  isSubmitting = false;
  categoryMap = new Map<string, string>(); // カテゴリー名からIDへのマッピング

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<TaskFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      id?: string;
      type?: 'todo' | 'schedule';
      initialDate?: Date;
    },
    private taskSvc: TaskService,
    private categorySvc: CategoryService,
    private labelSvc: LabelService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) {
    this.activeTab = data?.type || 'todo';
    this.initializeForm(undefined, data?.initialDate);
  }

  ngOnInit() {
    // カテゴリーの読み込み
    this.categorySvc.getCategories().subscribe(categories => {
      this.categoryMap = new Map(categories.map(cat => [cat.name, cat.id]));
    });

    // カテゴリーを取得してから、フォームの値を更新
    this.categorySvc.getCategories().subscribe(categories => {
      this.categories = categories.map(c => c.name);
      // カテゴリーが存在し、新規作成モードの場合のみデフォルト値をセット
      if (this.categories.length > 0 && !this.editTaskId) {
        this.form.patchValue({
          category: this.categories[0]
        });
      }
    });

    // ラベルを取得
    this.labelSvc.getLabels().subscribe(labels => {
      this.availableLabels = labels.length > 0 ? labels : DEFAULT_LABELS;
    });

    // 編集モードの場合
    const id = this.data?.id;
    if (id) {
      this.editTaskId = id;
      this.taskSvc.getTasks().subscribe(tasks => {
        const task = tasks.find(t => t.id === id);
        if (task) {
          this.form.patchValue(task);
        }
      });
    }

    // フォームの状態変更を監視
    this.form.statusChanges.subscribe(status => {
      console.log('Form Status:', status);
      console.log('Form Valid:', this.form.valid);
      if (this.form.invalid) {
        console.log('Invalid Controls:', Object.keys(this.form.controls).filter(key => this.form.get(key)?.invalid));
      }
    });
  }

  switchTab(tab: 'todo' | 'schedule') {
    // 現在のフォームの値を保存
    const currentValues = this.form?.value;
    
    // 共通フィールドの値を保持
    const commonFields = {
      title: currentValues?.title || '',
      category: currentValues?.category || '',
      categoryId: this.categoryMap.get(currentValues?.category || '') || '',
      labels: currentValues?.labels || [],
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
      subTasks: currentValues?.subTasks || [],
      repeat: currentValues?.repeat || {
        enabled: false,
        frequency: '毎週',
        startDate: null,
        daysOfWeek: [],
        dayOfMonth: null,
        month: null,
        endDate: null
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
          targetCompletionDate: tab === 'todo' ? currentValues?.targetCompletionDate : null,
          startTime: tab === 'schedule' ? currentValues?.startTime : null,
          endTime: tab === 'schedule' ? currentValues?.endTime : null,
          noTask: tab === 'schedule' ? currentValues?.noTask : false,
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
        targetCompletionDate: tab === 'todo' ? currentValues?.targetCompletionDate : null,
        startTime: tab === 'schedule' ? currentValues?.startTime : null,
        endTime: tab === 'schedule' ? currentValues?.endTime : null,
        noTask: tab === 'schedule' ? currentValues?.noTask : false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.initializeForm(initialValues);
    }

    // デバッグ用のログ
    console.log('Tab switched:', {
      tab,
      formValue: this.form.value,
      formValid: this.form.valid,
      formErrors: this.form.errors
    });
  }

  private initializeForm(task?: Task, initialDate?: Date) {
    console.log('Initializing form with task:', task);
    console.log('Initial date:', initialDate);
    console.log('Active tab:', this.activeTab);

    // 共通フィールドの定義
    const commonFields = {
      title: [task?.title || '', [Validators.required, Validators.minLength(1)]],
      category: [task?.category || '', [Validators.required]],
      categoryId: [task?.categoryId || this.categoryMap.get(task?.category || '') || ''],
      labels: this.fb.array(task?.labels || []),
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
        month: [task?.repeat?.month || null],
        endDate: [task?.repeat?.endDate ? new Date(task.repeat.endDate) : null]
      })
    };

    // タブに応じたフォームグループの作成
    const formGroup = this.activeTab === 'todo'
      ? {
          ...commonFields,
          dueDate: [initialDate || (task?.dueDate ? new Date(task.dueDate) : null)],
          dueTime: [task?.dueTime || ''],
          targetCompletionDate: [
            task?.targetCompletionDate ? new Date(task.targetCompletionDate) : null
          ],
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
          targetCompletionDate: [task?.targetCompletionDate ? new Date(task.targetCompletionDate) : null],
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

    // 日付をまたぐスケジュールの監視
    this.form.get('startDate')?.valueChanges.subscribe(() => this.updateCrossDayStatus());
    this.form.get('endDate')?.valueChanges.subscribe(() => this.updateCrossDayStatus());
    this.form.get('startTime')?.valueChanges.subscribe(() => this.updateCrossDayStatus());
    this.form.get('endTime')?.valueChanges.subscribe(() => this.updateCrossDayStatus());

    // 繰り返し設定の変更を監視
    this.form.get('repeat.enabled')?.valueChanges.subscribe(enabled => {
      console.log('Repeat enabled changed:', enabled);
      const dueDateControl = this.form.get('dueDate');
      if (dueDateControl) {
        if (enabled) {
          dueDateControl.clearValidators();
        } else if (this.activeTab === 'schedule') {
          dueDateControl.setValidators([Validators.required]);
        }
        dueDateControl.updateValueAndValidity();
      }
    });

    // フォームの状態変更を監視
    this.form.statusChanges.subscribe(status => {
      console.log('Form Status Changed:', {
        status,
        valid: this.form.valid,
        errors: this.form.errors,
        controls: Object.keys(this.form.controls).reduce((acc, key) => {
          const control = this.form.get(key);
          if (control?.errors) {
            acc[key] = control.errors;
          }
          return acc;
        }, {} as {[key: string]: any})
      });
    });

    // デバッグ用のログ
    console.log('Form initialized:', {
      activeTab: this.activeTab,
      formValue: this.form.value,
      formValid: this.form.valid,
      formErrors: this.form.errors
    });
  }

  private createLinkControl(): FormControl {
    return this.fb.control('', [Validators.pattern('https?://.+')]);
  }

  // FormArray Getters
  get relatedLinks(): FormArray {
    return this.form.get('relatedLinks') as FormArray;
  }

  get labels(): FormArray {
    return this.form.get('labels') as FormArray;
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

  // ラベル
  isLabelSelected(label: Label): boolean {
    return this.labels.value.some((l: Label) => l.id === label.id);
  }

  toggleLabel(label: Label) {
    const index = this.labels.value.findIndex((l: Label) => l.id === label.id);
    if (index === -1) {
      this.labels.push(this.fb.control(label));
    } else {
      this.labels.removeAt(index);
    }
  }

  // サブタスク
  addSubTask() {
    if (this.newSubTaskTitle.trim()) {
      const newSubTask: SubTask = {
        id: uuidv4(),
        title: this.newSubTaskTitle,
        completed: false
      };
      this.subTasks.push(this.fb.group({
        id: [newSubTask.id],
        title: [newSubTask.title],
        completed: [newSubTask.completed]
      }));
      this.newSubTaskTitle = '';
    }
  }

  removeSubTask(index: number) {
    this.subTasks.removeAt(index);
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
    if (field.errors['timeRange']) {
      return '開始時間は終了時間より前である必要があります';
    }
    if (field.errors['requiredDate']) {
      return '繰り返し設定を使用しない場合は日付の入力が必要です';
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

    return field.invalid && (field.dirty || field.touched);
  }

  // フォーム送信
  async onSubmit() {
    // 送信中は重複クリックを防止
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    console.log('Form submission started');
    if (!this.form.valid) {
      console.log('Form is invalid:', this.form.errors);
      this.isSubmitting = false;
      return;
    }

    console.log('Form value:', this.form.value);
    console.log('Form validation state:', {
      valid: this.form.valid,
      errors: this.form.errors,
      dirtyFields: Object.keys(this.form.controls).filter(key => this.form.get(key)?.dirty)
    });

    try {
      const formValue = this.form.value;

      // スケジュールの場合は日付・開始時間・終了時間すべて必須
      if (this.activeTab === 'schedule') {
        if (!formValue.dueDate || !formValue.startTime || !formValue.endTime) {
          this.snackBar.open('スケジュール登録には日付・開始時間・終了時間すべてが仮でも必須です', '閉じる', { duration: 4000 });
          this.isSubmitting = false;
          return;
        }
      }

      // 新規追加時、startTimeまたはendTimeのみ設定でdueDateが未設定の場合は保存不可
      if (!this.editTaskId) {
        const hasStartOrEnd = !!formValue.startTime || !!formValue.endTime;
        if (hasStartOrEnd && !formValue.dueDate) {
          this.snackBar.open('スケジュールには開始時間、終了時間、日付が仮でも必須です', '閉じる', { duration: 4000 });
          this.isSubmitting = false;
          return;
        }
      }

      // 日付と時間の両方が設定されている場合のみ通知を有効にする
      if (formValue.notification?.enabled) {
        if (!formValue.dueDate || (!formValue.startTime && !formValue.dueTime)) {
          formValue.notification.enabled = false;
          this.snackBar.open('通知を設定するには、その日付と時間（開始時間または期限時刻）を指定してください。', '閉じる', { duration: 4000 });
        }
      }

      // 目標完了日が入力されている場合は締め切り日も必須
      if (formValue.targetCompletionDate && !formValue.dueDate) {
        this.snackBar.open('目標完了日を設定する場合は、締め切り日も入力してください。', '閉じる', { duration: 4000 });
        this.isSubmitting = false;
        return;
      }
      console.log('formValue.dueDate:', formValue.dueDate, typeof formValue.dueDate);
      console.log('formValue.targetCompletionDate:', formValue.targetCompletionDate, typeof formValue.targetCompletionDate);
      console.log('Processing form value:', formValue);

      const categoryId = this.categoryMap.get(formValue.category) || formValue.category;

      // repeatの値を適切に処理
      const repeat = formValue.repeat?.enabled
        ? {
            enabled: true,
            frequency: formValue.repeat.frequency || '毎週',
            startDate: formValue.repeat.startDate ? new Date(formValue.repeat.startDate) : null,
            daysOfWeek: formValue.repeat.daysOfWeek?.map(Number) || [],
            dayOfMonth: formValue.repeat.dayOfMonth || null,
            month: formValue.repeat.month !== null ? Number(formValue.repeat.month) : null,
            endDate: formValue.repeat.endDate ? new Date(formValue.repeat.endDate) : null
          }
        : undefined;

      // repeatGroupIdの付与
      const repeatGroupId = repeat?.enabled
        ? (formValue.repeatGroupId || (this.editTaskId ? this.form.value.repeatGroupId : uuidv4()))
        : undefined;

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
      const targetDateValue = processDateField(formValue.targetCompletionDate);
      const dueDate = dueDateValue === null ? undefined : dueDateValue;
      const targetDate = targetDateValue === null ? undefined : targetDateValue;

      // scheduleDateの決定
      let scheduleDate: Date | undefined = undefined;
      if (dueDate) {
        scheduleDate = dueDate;
      } else if (targetDate) {
        scheduleDate = targetDate;
      } else if (formValue.initialDate) {
        scheduleDate = new Date(formValue.initialDate);
      } else if (formValue.createdAt) {
        scheduleDate = new Date(formValue.createdAt);
      }

      // タスクオブジェクトの作成
      const task: Task = {
        id: this.editTaskId || uuidv4(),
        title: formValue.title,
        category: categoryId,
        categoryId,
        status: formValue.status || '未着手',
        dueDate: dueDate,
        dueTime: formValue.dueTime || '',
        targetCompletionDate: targetDate,
        scheduleDate: (formValue.startTime || formValue.endTime) ? scheduleDate : undefined,
        relatedLinks: formValue.relatedLinks?.filter((link: string) => link?.trim() !== '') || [],
        labels: formValue.labels || [],
        subTasks: subTasks,
        memo: formValue.memo || '',
        description: formValue.description || '',
        completed: formValue.completed || false,
        noTask: formValue.noTask || false,
        startTime: formValue.startTime || '',
        endTime: formValue.endTime || '',
        notification: formValue.notification ?? true,
        repeat: repeat,
        repeatGroupId: repeatGroupId,
        createdAt: this.editTaskId ? (formValue.createdAt ? new Date(formValue.createdAt).toISOString() : new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      console.log('task.dueDate:', task.dueDate, typeof task.dueDate);
      console.log('task.targetCompletionDate:', task.targetCompletionDate, typeof task.targetCompletionDate);

      console.log('Task object to be saved:', task);
      console.log('CreatedAt type:', typeof task.createdAt);
      console.log('targetCompletionDate to be saved:', targetDate, typeof targetDate);

      if (this.editTaskId) {
        // 既存のタスクを更新
        const updateResult = await this.taskSvc.updateTask(task);
        if (updateResult === 'notification-failed') {
          // 通知失敗時は保存メッセージを出さない
        } else {
          this.snackBar.open('タスクを更新しました', '閉じる', { duration: 3000 });
        }
      } else {
        // 新規タスクを作成
        const addResult = await this.taskSvc.addTask(task);
        if (addResult === 'notification-failed') {
          // 通知失敗時は保存メッセージを出さない
        }
      }

      this.dialogRef.close(task);
    } catch (error) {
      console.error('タスクの保存中にエラーが発生しました:', error);
      this.snackBar.open('タスクの保存に失敗しました: ' + (error as Error).message, '閉じる', { duration: 3000 });
    } finally {
      this.isSubmitting = false;
    }
  }

  onCancel() {
    this.dialogRef.close(false);
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

  async addLabel() {
    const name = (this.newLabelControl.value || '').trim();
    if (name) {
      try {
        // 新しいラベルを作成
        const newLabel: Label = {
          id: uuidv4(),
          name: name,
          color: '#E0E0E0' // デフォルトの色
        };

        // ラベルをFirestoreに保存
        await this.labelSvc.add(name);

        // 利用可能なラベルリストに追加
        this.availableLabels = [...this.availableLabels, newLabel];

        // フォームのラベルコントロールを更新
        this.labels.push(this.fb.control(newLabel));

        // 入力フィールドをクリア
        this.newLabelControl.setValue('');

        // 変更を検出
        this.cdr.detectChanges();
      } catch (error) {
        console.error('ラベルの追加に失敗しました:', error);
        this.snackBar.open('ラベルの追加に失敗しました', '閉じる', { duration: 3000 });
      }
    }
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
    this.form.patchValue({ notification: settings });
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
}