import { Component, OnInit, Inject, Optional, ViewEncapsulation, AfterViewInit, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule, FormArray, FormControl } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { v4 as uuidv4 } from 'uuid';
import { NgxMatTimepickerModule } from 'ngx-mat-timepicker';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { NotificationSettingsComponent } from '../notification-settings/notification-settings.component';
import { MatTooltipModule } from '@angular/material/tooltip';

import { TaskService } from '../../services/task.service';
import { CategoryService } from '../../services/category.service';
import { DEFAULT_CATEGORIES, DEFAULT_LABELS } from '../../models/task.model';
import { Task, Category, SubTask, Label } from '../../models/task.model';
import { LabelService } from '../../services/label.service';

@Component({
  selector: 'app-task-form-dialog',
  templateUrl: './task-form-dialog.component.html',
  styleUrls: ['./task-form-dialog.component.scss'],
  encapsulation: ViewEncapsulation.None,
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
    MatDialogModule,
    NgxMatTimepickerModule,
    MatButtonToggleModule,
    NotificationSettingsComponent,
    MatTooltipModule
  ],
  providers: [provideNativeDateAdapter()]
})
export class TaskFormDialogComponent implements OnInit, AfterViewInit {
  form!: FormGroup;
  categories: Category[] = [];
  selectedTab: 'TODO' | 'スケジュール' = 'TODO';
  originalTab: 'TODO' | 'スケジュール' = 'TODO';
  editTaskId?: string;
  categoryMap = new Map<string, string>(); // カテゴリー名からIDへのマッピング
  categoryAddMode = false;
  newCategoryName = '';
  showRepeatDetail = false;
  showNotificationDetail = false;
  repeatFrequency: string = '';
  notificationTime: string = '';
  notificationMethod: string = 'browser';
  notificationTiming: string = '10';
  notificationPriority: string = 'medium';
  subTasks: SubTask[] = [];
  newSubTaskTitle = '';
  availableLabels: Label[] = [];
  selectedLabels: Label[] = [];
  newLabelName: string = '';
  notificationSettings: any;

  constructor(
    private fb: FormBuilder,
    private taskSvc: TaskService,
    private categorySvc: CategoryService,
    public dialogRef: MatDialogRef<TaskFormDialogComponent>,
    private snackBar: MatSnackBar,
    private elementRef: ElementRef,
    private labelSvc: LabelService,
    @Inject(MAT_DIALOG_DATA) public data: {
      type: 'todo' | 'schedule';
      initialDate?: Date;
      startTime?: string;
      endTime?: string;
      dueDate?: Date;
      id?: string;
      task?: Task;
    },
    private cdr: ChangeDetectorRef
  ) {
    this.selectedTab = data.type === 'todo' ? 'TODO' : 'スケジュール';
    this.originalTab = this.selectedTab;
    console.log('TaskFormDialog - Received data:', data);
    if (data && data.id) {
      this.editTaskId = data.id;
      console.log('TaskFormDialog - Set editTaskId:', this.editTaskId);
    }
  }

  ngOnInit() {
    // カテゴリーの読み込み
    this.categorySvc.getCategories().subscribe(categories => {
      this.categories = categories;
      this.categoryMap = new Map(categories.map(cat => [cat.id, cat.name]));
      // 編集時、既存タスクのcategoryIdをセット
      if (this.form && this.form.get('category')) {
        // 既存の値がIDでなければIDに変換
        const current = this.form.get('category')?.value;
        if (current && !this.categories.some(cat => cat.id === current)) {
          // 名前からIDを検索
          const found = this.categories.find(cat => cat.name === current);
          if (found) this.form.get('category')?.setValue(found.id);
        }
      }
    });

    // フォームの初期化
    this.form = this.fb.group({
      id: [this.data?.task?.id || this.data?.id || ''],
      title: ['', Validators.required],
      description: [''],
      category: ['', Validators.required],
      date: [this.data.initialDate || null],
      time: [''],
      startTime: [this.data.startTime || ''],
      endTime: [this.data.endTime || ''],
      noTask: [false],
      targetCompletionDate: [null],
      dueDate: [this.data.dueDate || this.data.initialDate || null],
      dueTime: [''],
      repeat: this.fb.group({
        enabled: [false],
        frequency: ['毎日'],
        startDate: [null],
        endDate: [null],
        daysOfWeek: [[]],
        dayOfMonth: [null],
        month: [null]
      }),
      labels: [[]],
      subtasks: this.fb.array([]),
      notification: this.fb.group({
        enabled: [false],
        type: ['ブラウザ'],
        timing: ['10分前'],
        customMinutes: [null],
        priority: ['中']
      }),
      memo: [''],
      links: this.fb.array([])
    });

    // 初期値セット
    this.notificationSettings = this.form.get('notification')?.value;

    // フォームのnotification値が変わったら反映
    this.form.get('notification')?.valueChanges.subscribe(val => {
      console.log('[通知] 通知設定が変更されました:', val);
      this.notificationSettings = val;
    });

    // 既存のタスクがある場合は、フォームに値を設定
    if (this.data?.task) {
      const task = this.data.task;
      this.editTaskId = task.id;
      console.log('[通知] 既存タスクの通知設定:', task.notification);
      
      // 通知設定の初期化
      const notificationSettings = {
        enabled: task.notification?.enabled || false,
        type: task.notification?.type || 'ブラウザ',
        timing: task.notification?.timing || '10分前',
        customMinutes: task.notification?.customMinutes || null,
        priority: task.notification?.priority || '中'
      };

      // サブタスクのFormArrayを設定
      const subTasksArray = this.form.get('subtasks') as FormArray;
      subTasksArray.clear();
      if (task.subTasks && task.subTasks.length > 0) {
        task.subTasks.forEach(subTask => {
          subTasksArray.push(this.fb.group({
            id: [subTask.id],
            title: [subTask.title],
            completed: [subTask.completed]
          }));
        });
      }

      this.form.patchValue({
        id: task.id,
        title: task.title,
        category: task.categoryId,
        date: task.dueDate ? new Date(task.dueDate) : null,
        time: task.dueTime,
        startTime: task.startTime,
        endTime: task.endTime,
        noTask: task.noTask,
        memo: task.memo,
        notification: notificationSettings,
        targetCompletionDate: task.targetCompletionDate ? new Date(task.targetCompletionDate) : null,
        repeat: {
          enabled: task.repeat?.enabled || false,
          frequency: task.repeat?.frequency || '毎週',
          startDate: task.repeat?.startDate ? new Date(task.repeat.startDate) : null,
          daysOfWeek: Array.isArray(task.repeat?.daysOfWeek)
            ? task.repeat.daysOfWeek.map((v: any) => typeof v === 'string' ? Number(v) : v)
            : [],
          dayOfMonth: task.repeat?.dayOfMonth || null,
          month: task.repeat?.month !== undefined ? Number(task.repeat.month) : null,
          endDate: task.repeat?.endDate ? new Date(task.repeat.endDate) : null
        }
      });
      this.selectedLabels = task.labels || [];
      this.form.get('labels')?.setValue(this.selectedLabels);
    } else {
      console.log('[通知] 新規タスク作成');
    }

    // エンターキーでのフォーム送信を無効化
    this.dialogRef.keydownEvents().subscribe(event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    // ラベル一覧を取得
    this.labelSvc.getLabels().subscribe(labels => {
      this.availableLabels = labels.length > 0 ? labels : DEFAULT_LABELS;
      // 編集時は既存タスクのラベルも反映
      if (this.editTaskId && this.form.value.labels) {
        this.selectedLabels = this.form.value.labels;
        this.form.get('labels')?.setValue(this.selectedLabels);
      }
      this.cdr.detectChanges();
    });

    // タブ切り替え時の処理
    this.form.get('selectedTab')?.valueChanges.subscribe(tab => {
      this.selectedTab = tab;
    });
  }

  ngAfterViewInit() {
    // ViewEncapsulationを確実に効かせるためにダイアログのクラスを追加
    const dialogContainer = this.elementRef.nativeElement.closest('.mat-mdc-dialog-container');
    if (dialogContainer) {
      dialogContainer.classList.add('task-form-dialog-container');
    }
    // notificationSettingsの値を再セットし、detectChangesを呼ぶ
    this.notificationSettings = this.form.get('notification')?.value;
    this.cdr.detectChanges();
  }

  // 既存タスクの読み込み
  private async loadExistingTask() {
    try {
      const task = await this.taskSvc.getTask(this.editTaskId!);
      if (task) {
        this.form.patchValue({
          id: task.id,
          title: task.title,
          category: task.category,
          date: task.dueDate || new Date(),
          time: task.dueTime,
          startTime: task.startTime || '',
          endTime: task.endTime || '',
          memo: task.memo || '',
          repeat: {
            enabled: task.repeat?.enabled || false,
            frequency: task.repeat?.frequency || '毎週',
            startDate: task.repeat?.startDate ? new Date(task.repeat.startDate) : null,
            daysOfWeek: Array.isArray(task.repeat?.daysOfWeek)
              ? task.repeat.daysOfWeek.map((v: any) => typeof v === 'string' ? Number(v) : v)
              : [],
            dayOfMonth: task.repeat?.dayOfMonth || null,
            endDate: task.repeat?.endDate ? new Date(task.repeat.endDate) : null
          },
          notification: task.notification !== undefined ? task.notification : true,
          labels: task.labels || [],
          links: task.relatedLinks || []
        });
        this.selectedLabels = task.labels || [];
        this.form.get('labels')?.setValue(this.selectedLabels);
        const subTasksFA = this.form.get('subtasks') as FormArray;
        subTasksFA.clear();
        (task.subTasks || []).forEach((st: SubTask) => {
          subTasksFA.push(this.fb.group({
            id: [st.id],
            title: [st.title],
            completed: [st.completed]
          }));
        });
      }
    } catch (error) {
      console.error('タスク読み込みエラー:', error);
      this.snackBar.open('タスクの読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  onSubmit(): void {
    const formValue = this.form.value;
    // 新規追加時、startTimeまたはendTimeのみ設定でdateが未設定の場合は保存不可
    if (!this.editTaskId) {
      const hasStartOrEnd = !!formValue.startTime || !!formValue.endTime;
      if (hasStartOrEnd && !formValue.date) {
        this.snackBar.open('開始時間または終了時間を設定する場合は日付も必須です', '閉じる', { duration: 4000 });
        return;
      }
    }
    // 保存判定ロジック
    const hasDueTime = !!formValue.time && !formValue.startTime && !formValue.endTime;
    const hasScheduleTime = !!formValue.startTime && !!formValue.endTime;
    const isDateOnly = !formValue.time && !formValue.startTime && !formValue.endTime;

    if (this.selectedTab === 'TODO' && hasScheduleTime) {
      this.snackBar.open('開始・終了時間が設定されている場合は「スケジュール」タブで保存してください', '閉じる', { duration: 4000 });
      return;
    }
    if (this.selectedTab === 'スケジュール' && hasDueTime) {
      this.snackBar.open('締め切り時間のみ設定されている場合は「TODO」タブで保存してください', '閉じる', { duration: 4000 });
      return;
    }
    // isDateOnlyならどちらでもOK

    if (this.form.valid) {
      const formValue = this.form.value;
      console.log('[通知] フォーム送信時の値:', {
        formValue,
        notification: formValue.notification,
        date: formValue.date,
        time: formValue.time,
        startTime: formValue.startTime,
        endTime: formValue.endTime
      });

      // 通知設定の検証と調整
      if (formValue.notification?.enabled) {
        console.log('[通知] 通知設定の検証開始:', {
          hasDate: !!formValue.date,
          hasTime: !!(formValue.time || formValue.startTime),
          notificationSettings: formValue.notification
        });

        // 日付が設定されていない場合の処理
        if (!formValue.date) {
          console.warn('[通知] 日付が設定されていません');
          formValue.notification.enabled = false;
          this.snackBar.open('通知を有効にするには日付を設定してください', '閉じる', { duration: 4000 });
        }
        // 時間が設定されていない場合の処理
        else if (!formValue.time && !formValue.startTime) {
          console.warn('[通知] 時間が設定されていません');
          formValue.notification.enabled = false;
          this.snackBar.open('通知を有効にするには時間を設定してください', '閉じる', { duration: 4000 });
        }
        // 通知タイミングの検証
        else if (formValue.notification.timing === 'カスタム' && !formValue.notification.customMinutes) {
          console.warn('[通知] カスタム通知の分数が設定されていません');
          formValue.notification.enabled = false;
          this.snackBar.open('カスタム通知の場合は分数を設定してください', '閉じる', { duration: 4000 });
        }
      }

      // サブタスクの処理（新規作成フォームと同じ）
      const subTasks = this.subTasksArray.controls.map(ctrl => {
        const val = ctrl.value;
        return {
          id: val.id || uuidv4(),
          title: val.title,
          completed: !!val.completed
        };
      });

      // リンクの処理（新規作成フォームと同じ）
      const relatedLinks = this.linksArray.controls
        .map(ctrl => (typeof ctrl.value === 'string' ? ctrl.value.trim() : ''))
        .filter(link => link && /^https?:\/\//.test(link));

      // 繰り返し設定の処理
      const repeatSettings = formValue.repeat.enabled ? {
        enabled: true,
        frequency: formValue.repeat.frequency,
        startDate: formValue.repeat.startDate,
        endDate: formValue.repeat.endDate,
        daysOfWeek: (formValue.repeat.daysOfWeek || []).map((v: any) => typeof v === 'string' ? Number(v) : v),
        dayOfMonth: formValue.repeat.dayOfMonth,
        month: formValue.repeat.month
      } : undefined;

      // タスクデータの準備
      const taskData: Partial<Task> = {
        id: formValue.id || this.editTaskId || uuidv4(),
        title: formValue.title,
        description: formValue.description,
        categoryId: formValue.category,
        status: formValue.status || '未着手',
        priority: formValue.priority || '中',
        dueDate: formValue.date,
        dueTime: formValue.time,
        startTime: formValue.startTime,
        endTime: formValue.endTime,
        notification: formValue.notification,
        labels: formValue.labels || [],
        memo: formValue.memo,
        targetCompletionDate: formValue.targetCompletionDate,
        inProgress: formValue.progress > 0,
        noTask: formValue.noTask,
        relatedLinks,
        subTasks,
        repeat: repeatSettings
      };

      // スケジュールタスクの場合の追加処理
      if (formValue.isSchedule) {
        taskData.scheduleDate = formValue.date;
        taskData.startTime = formValue.startTime;
        taskData.endTime = formValue.endTime;
      }

      // 通知設定の有効性を再確認
      if (taskData.notification?.enabled) {
        const hasValidDateTime = (taskData.dueDate && (taskData.dueTime || taskData.startTime));
        console.log('[通知] 最終確認:', {
          hasValidDateTime,
          dueDate: taskData.dueDate,
          dueTime: taskData.dueTime,
          startTime: taskData.startTime,
          notification: taskData.notification
        });

        if (!hasValidDateTime) {
          console.warn('[通知] 日付または時間が無効です');
          taskData.notification.enabled = false;
          this.snackBar.open('通知を有効にするには日付と時間を設定してください', '閉じる', { duration: 4000 });
        }
      }

      console.log('[通知] 最終的なタスクデータ:', taskData);
      this.dialogRef.close(taskData);
    } else {
      console.warn('[通知] フォームが無効です:', this.form.errors);
      this.snackBar.open('必須項目を入力してください', '閉じる', { duration: 4000 });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }

  onTabChange(tab: 'TODO' | 'スケジュール') {
    this.selectedTab = tab;
  }

  onCategoryChange(value: string) {
    if (value === '__add_new__') {
      this.categoryAddMode = true;
      this.form.get('category')?.setValue('');
    }
  }

  addCategory() {
    const name = this.newCategoryName.trim();
    if (!name) return;
    // 既存に同名がなければ追加
    if (!this.categories.some(cat => cat.name === name)) {
      const newCat = { id: uuidv4(), name, createdAt: new Date().toISOString() };
      this.categories.push(newCat);
      this.form.get('category')?.setValue(newCat.id);
      this.categoryAddMode = false;
      this.newCategoryName = '';
      // サービスへの追加はローカルのみ
    }
  }

  cancelCategoryAdd() {
    this.categoryAddMode = false;
    this.newCategoryName = '';
    // 選択をリセット
    if (this.categories.length > 0) {
      this.form.get('category')?.setValue(this.categories[0].id);
    }
  }

  toggleRepeatDetail() {
    this.showRepeatDetail = !this.showRepeatDetail;
  }

  toggleNotificationDetail() {
    this.showNotificationDetail = !this.showNotificationDetail;
  }

  get subTasksArray(): FormArray {
    // formやsubtasksが未初期化の場合は空のFormArray<any>を返す
    return (this.form && this.form.get('subtasks')) ? (this.form.get('subtasks') as FormArray) : new FormArray<any>([]);
  }

  addSubTask() {
    const title = this.newSubTaskTitle.trim();
    if (title) {
      const newSubTask: SubTask = {
        id: uuidv4(),
        title,
        completed: false
      };
      this.subTasksArray.push(this.fb.group({
        id: [newSubTask.id],
        title: [newSubTask.title],
        completed: [newSubTask.completed]
      }));
      this.newSubTaskTitle = '';
    }
  }

  removeSubTask(index: number) {
    this.subTasksArray.removeAt(index);
  }

  async addLabel() {
    const name = (this.newLabelName || '').trim();
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
        this.selectedLabels.push(newLabel);

        // 入力フィールドをクリア
        this.newLabelName = '';

        // 変更を検出
        this.cdr.detectChanges();
      } catch (error) {
        console.error('ラベルの追加に失敗しました:', error);
        this.snackBar.open('ラベルの追加に失敗しました', '閉じる', { duration: 3000 });
      }
    }
  }

  toggleLabel(label: Label) {
    const idx = this.selectedLabels.findIndex(l => l.id === label.id);
    if (idx >= 0) {
      this.selectedLabels.splice(idx, 1);
    } else {
      this.selectedLabels.push(label);
    }
    this.selectedLabels = [...this.selectedLabels];
    this.form.get('labels')?.setValue(this.selectedLabels);
    this.cdr.detectChanges();
  }

  isLabelSelected(label: Label): boolean {
    return this.selectedLabels.some(l => l.id === label.id);
  }

  get isEditMode(): boolean {
    return !!this.editTaskId;
  }

  get linksArray(): FormArray {
    return this.form.get('links') as FormArray;
  }

  get fbPublic() {
    return this.fb;
  }

  // リンクFormControl生成
  createLinkControl(): FormControl {
    return this.fb.control('', [Validators.pattern('https?://.+')]);
  }

  // リンク追加
  addLink() {
    this.linksArray.push(this.createLinkControl());
  }

  // リンク削除
  removeLink(index: number) {
    if (this.linksArray.length > 1) {
      this.linksArray.removeAt(index);
    }
  }
} 