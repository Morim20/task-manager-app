import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskService } from '../../services/task.service';
import { Task } from '../../models/task.model';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TaskDetailDialogComponent } from '../task-detail-dialog/task-detail-dialog.component';
import { UserSettingsService } from '../../services/user-settings.service';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';
import { getTaskDisplayTime } from '../../utils/task.utils';

@Component({
  selector: 'app-today-todo',
  standalone: true,
  imports: [CommonModule, NgxChartsModule, MatCardModule, MatIconModule, MatCheckboxModule, MatDialogModule],
  template: `
    <div class="today-header-simple">
      <div class="today-title-simple">TODAY</div>
      <div class="today-date-simple">{{ today | date:'yyyy/MM/dd (EEE)' : undefined : 'ja' }}</div>
    </div>
    <div *ngIf="capacityLoaded" class="capacity-bar-wrapper">
      <div *ngIf="!userCapacity || userCapacity === 0" style="color:#1976d2; font-weight:bold; margin-bottom:8px;">
        ユーザー設定からキャパシティ登録すると、よりとぅどぅまるが使いやすくなります
      </div>
      <div *ngIf="userCapacity && userCapacity > 0">
        <div class="capacity-labels">
          <span>本日のキャパシティ: {{ userCapacity }}分</span>
          <span [ngStyle]="usedCapacityColor">予定合計: {{ usedCapacity }}分</span>
          <span>残り: {{ remainingCapacity }}分</span>
        </div>
        <div *ngIf="showOverCapacityMessage" style="color:red; font-weight:bold; margin-bottom:4px;">
          {{ overCapacityMessage }}
        </div>
        <div class="capacity-bar-bg">
          <div class="capacity-bar-fill" [style.width.%]="(usedCapacity / userCapacity) * 100" [style.background-color]="capacityBarColor"></div>
        </div>
      </div>
    </div>
    <div class="today-dashboard">
      <div class="today-col schedule-col">
        <div class="section-title-simple">本日のスケジュール</div>
        <mat-card>
          <div class="calendar-schedule-wrapper" #scheduleWrapper>
            <div class="calendar-rows">
              <ng-container *ngFor="let hour of hours">
                <div class="calendar-row">
                  <div class="calendar-time-label">{{ hour }}:00</div>
                  <div class="calendar-hour-cell"></div>
                </div>
              </ng-container>
              <!-- タスクバーはabsoluteで重ねる -->
              <ng-container *ngFor="let block of todayTaskBlocks">
                <div class="calendar-task-bar"
                  [style.top.px]="block.topPosition"
                  [style.height.px]="block.heightInPixels"
                  [class.completed]="isCompleted(block.task)"
                  [class.all-day]="block.isAllDay"
                  [class.no-task]="block.isNoTask"
                  [title]="block.task.title + (block.task.startTime ? ' ' + block.task.startTime : '') + (block.task.endTime ? '-' + block.task.endTime : '')"
                  (click)="openTaskDetailDialog(block.task)">
                  <span class="bar-title">{{ block.task.title }}</span>
                  <span class="bar-time" *ngIf="block.task.startTime && block.task.endTime">({{block.task.startTime}}-{{block.task.endTime}})</span>
                  <span class="bar-time" *ngIf="!block.task.startTime && block.task.dueTime">({{block.task.dueTime}})</span>
                </div>
              </ng-container>
              <!-- 現在時刻の横棒 -->
              <div class="current-time-line" [style.top.px]="currentTimeTop">
                <span class="current-time-label">{{ currentTimeLabel }}</span>
              </div>
              <div *ngIf="todayTaskBlocks.length === 0" style="color:red;">本日分のタスクバーがありません</div>
            </div>
          </div>
        </mat-card>
        <div style="text-align:center; margin-top: 24px;">
          <img src="assets/logo.png" alt="アプリロゴ" style="width: 200px; height: 200px; object-fit: contain;" />
        </div>
      </div>
      <div class="today-col right-col">
        <div class="section-title-simple">本日のTODOリスト</div>
        <mat-card>
          <mat-card-content>
            <ul class="todo-list">
              <li *ngFor="let task of todayTasks" [class.completed]="isCompleted(task)" (click)="openTaskDetailDialog(task)">
                <mat-checkbox color="primary"
                  [checked]="isCompleted(task)"
                  (change)="toggleTaskCompleted(task, $event.checked)"
                  (click)="$event.stopPropagation()"
                ></mat-checkbox>
                <span>{{ task.title }}</span>
                <span *ngIf="getTaskDisplayTime(task)">({{ getTaskDisplayTime(task) }})</span>
              </li>
            </ul>
            <div *ngIf="todayTasks.length === 0" class="no-tasks">本日のTODOはありません</div>
          </mat-card-content>
        </mat-card>
        <div class="section-title-simple">本日の完了率</div>
        <mat-card class="completion-rate-card">
          <div class="completion-rate-summary">
            <div class="completion-rate-main">
              <span class="completion-rate-number">{{ completedCount }}/{{ totalCount }}</span>
              <span class="completion-rate-percent">({{ completionPercent }}%)</span>
            </div>
            <div class="completion-rate-label">完了タスク数 / 全タスク数</div>
          </div>
          <ngx-charts-pie-chart
            [results]="completionRateData"
            [labels]="true"
            [doughnut]="true"
            [view]="[300,200]"
            [animations]="false">
          </ngx-charts-pie-chart>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .today-header-simple {
      display: flex;
      flex-direction: row;
      align-items: flex-end;
      gap: 24px;
      margin: 12px 0 0 12px;
    }
    .today-title-simple {
      font-size: 2.2rem;
      font-weight: bold;
      color: #1976d2;
      letter-spacing: 2px;
      margin-right: 16px;
    }
    .today-date-simple {
      font-size: 1.1rem;
      color: #555;
      font-weight: 500;
      margin-bottom: 4px;
    }
    .section-title-simple {
      font-size: 1.25rem;
      font-weight: bold;
      color: #1976d2;
      margin-bottom: 10px;
      margin-top: 32px;
      letter-spacing: 1px;
      text-align: left;
    }
    .today-dashboard {
      display: flex;
      flex-direction: row;
      gap: 24px;
      padding: 24px 8px 32px 8px;
      background: #f5f5f5;
      min-height: 100vh;
      justify-content: center;
    }
    .today-col {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
    }
    .schedule-col {
      min-width: 340px;
      max-width: 360px;
      flex: 0 0 360px;
    }
    .right-col {
      min-width: 400px;
      max-width: 520px;
      flex: 1 1 0;
      gap: 16px;
    }
    mat-card { border-radius: 14px; box-shadow: 0 4px 16px rgba(25, 118, 210, 0.07); margin-bottom: 0; padding-bottom: 8px; }
    .calendar-schedule-wrapper {
      display: block;
      position: relative;
      height: 1440px;
      max-height: 420px;
      overflow-y: auto;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.04);
    }
    .calendar-rows {
      position: relative;
      width: 100%;
      height: 1440px;
    }
    .calendar-row {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      height: 60px;
      width: 100%;
      position: relative;
    }
    .calendar-time-label {
      width: 56px;
      height: 60px;
      font-size: 1.08em;
      color: #1976d2;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      font-weight: 500;
      border-bottom: 1px solid #e3e3e3;
      margin: 0;
      justify-content: flex-end;
      padding-right: 10px;
      background: #f5f5f5;
      z-index: 1;
    }
    .calendar-hour-cell {
      flex: 1;
      height: 60px;
      border-bottom: 1px solid #e3e3e3;
      width: 100%;
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      background: #fafcff;
      position: relative;
    }
    .calendar-task-bar {
      position: absolute;
      left: 64px;
      right: 8px;
      background: #90caf9;
      color: #0d47a1;
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 1.01em;
      box-shadow: 0 1px 4px rgba(33,150,243,0.08);
      display: flex;
      flex-direction: row;
      align-items: center;
      z-index: 10;
      min-height: 16px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      border-left: 4px solid #1976d2;
      transition: background 0.2s;
    }
    .calendar-task-bar.completed {
      background: #c8e6c9;
      color: #388e3c;
      border-left: 4px solid #388e3c;
      text-decoration: line-through;
    }
    .calendar-task-bar.no-task {
      background: #eee;
      color: #888;
      border-left: 4px solid #bbb;
      font-style: italic;
    }
    .calendar-task-bar.all-day {
      background: #ffe082;
      color: #795548;
      border-left: 4px solid #ffb300;
      top: 0 !important;
      height: 24px !important;
      left: 0;
      right: 0;
      font-weight: bold;
    }
    .bar-title { font-weight: 500; margin-right: 8px; }
    .bar-time { font-size: 0.97em; color: #555; }
    .todo-list { list-style: none; padding: 0; margin: 0; }
    .todo-list li { padding: 6px 0; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 8px; }
    .todo-list li.completed { color: #888; text-decoration: line-through; }
    .no-tasks { color: #888; text-align: center; padding: 16px; }
    .current-time-line {
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background-color: #1976d2;
      z-index: 20;
      pointer-events: none;
      box-shadow: 0 1px 2px rgba(25, 118, 210, 0.15);
    }
    .current-time-label {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      background: #1976d2;
      color: #fff;
      font-size: 0.95em;
      font-weight: bold;
      padding: 2px 8px;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(25, 118, 210, 0.13);
      z-index: 21;
      pointer-events: none;
      letter-spacing: 1px;
    }
    .capacity-bar-wrapper { max-width: 600px; margin: 16px 0 16px 24px; }
    .capacity-labels { display: flex; gap: 24px; font-size: 1.08em; color: #1976d2; margin-bottom: 4px; }
    .capacity-bar-bg { width: 100%; height: 16px; background: #e3e3e3; border-radius: 8px; overflow: hidden; }
    .capacity-bar-fill { height: 100%; background: #1976d2; border-radius: 8px; transition: width 0.4s; }
    .completion-rate-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 18px 0 8px 0;
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 4px 16px rgba(25, 118, 210, 0.07);
      margin-bottom: 0;
    }
    .completion-rate-summary {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 8px;
    }
    .completion-rate-main {
      font-size: 2.1rem;
      font-weight: bold;
      color: #1976d2;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .completion-rate-percent {
      font-size: 1.2rem;
      color: #388e3c;
      font-weight: 500;
    }
    .completion-rate-label {
      font-size: 0.98rem;
      color: #888;
      margin-top: 2px;
    }
  `]
})
export class TodayTodoComponent implements OnInit, AfterViewInit, OnDestroy {
  today = new Date();
  todayTasks: Task[] = [];
  allTasks: Task[] = [];
  hours = Array.from({ length: 24 }, (_, i) => i);
  completionRateData: any[] = [];
  workTimeData: any[] = [];
  todayTaskBlocks: any[] = [];

  // カレンダーと同じ定数
  readonly PIXELS_PER_HOUR = 60;
  readonly PIXELS_PER_MINUTE = 1;
  readonly MIN_DURATION_MINUTES = 15;

  @ViewChild('scheduleWrapper') scheduleWrapperRef!: ElementRef;

  currentTimeTop = 0;
  currentTimeLabel = '';
  private currentTimeTimer: any;

  virtualTaskCompletionMap: { [id: string]: boolean } = {};

  userCapacity: number = 0;
  usedCapacity: number = 0;
  remainingCapacity: number = 0;
  capacityLoaded: boolean = false;
  overCapacity: boolean = false;
  overCapacityMessage: string = '';

  // 追加: 完了数・全体数・パーセント
  completedCount = 0;
  totalCount = 0;
  completionPercent = 0;

  getTaskDisplayTime = getTaskDisplayTime;

  constructor(
    private taskService: TaskService,
    private dialog: MatDialog,
    private userSettingsService: UserSettingsService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    console.log('TodayTodoComponent init');
    this.taskService.getTasks().subscribe(async tasks => {
      console.log('tasks:', tasks);
      this.allTasks = tasks;
      this.todayTasks = this.getTodayTasks();
      await this.loadVirtualTaskCompletions();
      console.log('todayTasks:', this.todayTasks);
      this.completionRateData = this.getCompletionRateData();
      this.workTimeData = this.getWorkTimeData();
      this.todayTaskBlocks = this.getTaskBlocksForToday();
      console.log('todayTaskBlocks:', this.todayTaskBlocks);
      await this.loadUserCapacity();
      this.calcCapacityUsage();
      this.updateCompletionStats();
    });
    this.updateCurrentTimeTop();
    this.currentTimeTimer = setInterval(() => this.updateCurrentTimeTop(), 60000);
  }

  ngAfterViewInit() {
    // 現在時刻の3時間前を中心にスクロール
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const scrollTo = Math.max((minutes - 180), 0); // 3時間=180分
    if (this.scheduleWrapperRef && this.scheduleWrapperRef.nativeElement) {
      this.scheduleWrapperRef.nativeElement.scrollTop = scrollTo;
    }
  }

  ngOnDestroy() {
    if (this.currentTimeTimer) {
      clearInterval(this.currentTimeTimer);
    }
  }

  getTodayTasks(): Task[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 通常タスク＋本日分の繰り返しタスクを展開
    const expanded = this.expandRepeatingTasks(this.allTasks);
    const filtered = expanded.filter(task => {
      if (!task.dueDate) return false; // dueDate未設定は除外
      const date = new Date(task.dueDate);
      date.setHours(0, 0, 0, 0);
      return date.getTime() === today.getTime();
    });

    // --- 前日から日またぎで本日にまたがるタスクも追加 ---
    const prevDate = new Date(today);
    prevDate.setDate(today.getDate() - 1);
    prevDate.setHours(0, 0, 0, 0);
    const crossDayTasks = this.allTasks.filter(task => {
      if (!task.startTime || !task.endTime || !task.dueDate) return false;
      const startTimeStr = task.startTime;
      const endTimeStr = task.endTime;
      if (!startTimeStr || !endTimeStr) return false;
      const startTime = this.parseTime(startTimeStr);
      const endTime = this.parseTime(endTimeStr);
      if (startTime.hour === null || endTime.hour === null) return false;
      // 日またぎ
      const isCrossDay = startTime.hour > endTime.hour || (startTime.hour === endTime.hour && startTime.minutes > endTime.minutes);
      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return isCrossDay && dueDate.getTime() === prevDate.getTime();
    });
    // 重複しないようにIDで除外
    const filteredIds = new Set(filtered.map(t => t.id));
    const crossDayOnly = crossDayTasks.filter(t => !filteredIds.has(t.id));
    const allTodayTasks = [...filtered, ...crossDayOnly];

    // 並び順: 終日タスク → 前日から日またぎタスク → 通常の時間指定タスク
    const allDayTasks = allTodayTasks.filter(t => !t.startTime && !t.dueTime);
    const timedTasks = allTodayTasks.filter(t => t.startTime || t.dueTime);
    timedTasks.sort((a, b) => {
      // startTime優先、なければdueTime、なければcreatedAt
      const getMinutes = (t: Task) => {
        if (t.startTime) {
          const parsed = this.parseTime(t.startTime);
          if (parsed.hour === null) return 99999;
          return parsed.hour * 60 + parsed.minutes;
        }
        if (t.dueTime) {
          const parsed = this.parseTime(t.dueTime);
          if (parsed.hour === null) return 99999;
          return parsed.hour * 60 + parsed.minutes;
        }
        return t.createdAt ? new Date(t.createdAt).getHours() * 60 + new Date(t.createdAt).getMinutes() : 99999;
      };
      return getMinutes(a) - getMinutes(b);
    });
    return [...allDayTasks, ...crossDayOnly, ...timedTasks.filter(t => !crossDayOnly.includes(t))];
  }

  parseTime(timeStr: string): { hour: number | null, minutes: number } {
    if (!timeStr) return { hour: null, minutes: 0 };
    // 12時間表記（AM/PM）対応
    const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (ampmMatch) {
      let hour = parseInt(ampmMatch[1], 10);
      const minutes = parseInt(ampmMatch[2], 10);
      const ampm = ampmMatch[3].toUpperCase();
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
      return { hour, minutes };
    }
    // 24時間表記
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h)) return { hour: null, minutes: 0 };
    return { hour: h, minutes: m || 0 };
  }

  getTaskBlocksForToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayData = { date: today, tasks: this.todayTasks, isToday: true };
    const blocks: any[] = [];
    const processedTaskIds = new Set<string>();

    // --- 前日から日またぎで本日にまたがるタスクを検出しバーを追加 ---
    const prevDate = new Date(today);
    prevDate.setDate(today.getDate() - 1);
    prevDate.setHours(0, 0, 0, 0);
    const crossDayTasks = this.allTasks.filter(task => {
      if (!task.startTime || !task.endTime || !task.dueDate) return false;
      const startTimeStr = task.startTime;
      const endTimeStr = task.endTime;
      if (!startTimeStr || !endTimeStr) return false;
      const startTime = this.parseTime(startTimeStr);
      const endTime = this.parseTime(endTimeStr);
      if (startTime.hour === null || endTime.hour === null) return false;
      // 日またぎ
      const isCrossDay = startTime.hour > endTime.hour || (startTime.hour === endTime.hour && startTime.minutes > endTime.minutes);
      const dueDate = new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return isCrossDay && dueDate.getTime() === prevDate.getTime();
    });
    crossDayTasks.forEach(task => {
      if (!task.endTime) return;
      const endTime = this.parseTime(task.endTime);
      if (endTime.hour === null) return;
      const taskEndMinutes = endTime.hour * 60 + endTime.minutes;
      if (taskEndMinutes > 0) {
        blocks.push({
          task: { ...task },
          duration: taskEndMinutes / 60,
          startOffset: 0,
          topPosition: 0,
          heightInPixels: taskEndMinutes * this.PIXELS_PER_MINUTE,
          isNoTask: task.noTask || false,
          isAllDay: false,
          isCrossDay: true
        });
      }
      processedTaskIds.add(task.id + '_crossday');
    });

    // 終日タスク
    const allDayTasks = dayData.tasks.filter(task =>
      (!task.startTime || task.startTime.trim() === '') &&
      (!task.endTime || task.endTime.trim() === '') &&
      (!task.dueTime || task.dueTime.trim() === '')
    );
    allDayTasks.forEach(task => {
      if (!processedTaskIds.has(task.id)) {
        blocks.push({
          task,
          duration: 24,
          startOffset: 0,
          topPosition: 0,
          heightInPixels: 24,
          isNoTask: task.noTask || false,
          isAllDay: true,
          isCrossDay: false
        });
        processedTaskIds.add(task.id);
      }
    });
    // 時間指定タスク
    const timedTasks = dayData.tasks.filter(task => {
      if (processedTaskIds.has(task.id)) return false;
      const hasStartEndTime = task.startTime && task.endTime && task.startTime.trim() !== '' && task.endTime.trim() !== '';
      const hasDueTime = task.dueTime && task.dueTime.trim() !== '';
      return hasStartEndTime || hasDueTime;
    });
    timedTasks.sort((a, b) => {
      const timeA = a.startTime || a.dueTime || '';
      const timeB = b.startTime || b.dueTime || '';
      const startA = this.parseTime(timeA);
      const startB = this.parseTime(timeB);
      return (startA.hour! * 60 + startA.minutes) - (startB.hour! * 60 + startB.minutes);
    });
    timedTasks.forEach(task => {
      if (processedTaskIds.has(task.id)) return;
      let taskStartMinutes: number;
      let taskEndMinutes: number;
      let isCrossDay = false;
      if (task.startTime && task.endTime) {
        const startTime = this.parseTime(task.startTime);
        const endTime = this.parseTime(task.endTime);
        if (startTime.hour === null || endTime.hour === null) return;
        // 日をまたぐ場合
        isCrossDay = startTime.hour > endTime.hour || (startTime.hour === endTime.hour && startTime.minutes > endTime.minutes);
        taskStartMinutes = startTime.hour * 60 + startTime.minutes;
        taskEndMinutes = endTime.hour * 60 + endTime.minutes;
        if (isCrossDay) {
          // 前日から本日にまたがる場合、2つのバーを作成
          if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (dueDate.getTime() === today.getTime()) {
              // 1. 前日分（23:30-24:00など）
              if (taskStartMinutes < 1440) {
                blocks.push({
                  task: { ...task },
                  duration: (1440 - taskStartMinutes) / 60,
                  startOffset: 0,
                  topPosition: taskStartMinutes * this.PIXELS_PER_MINUTE,
                  heightInPixels: (1440 - taskStartMinutes) * this.PIXELS_PER_MINUTE,
                  isNoTask: task.noTask || false,
                  isAllDay: false,
                  isCrossDay: true
                });
              }
              // 2. 本日分（0:00-8:00など）
              if (taskEndMinutes > 0) {
                blocks.push({
                  task: { ...task },
                  duration: taskEndMinutes / 60,
                  startOffset: 0,
                  topPosition: 0,
                  heightInPixels: taskEndMinutes * this.PIXELS_PER_MINUTE,
                  isNoTask: task.noTask || false,
                  isAllDay: false,
                  isCrossDay: true
                });
              }
              processedTaskIds.add(task.id);
              return;
            }
          }
          // 本日分は開始時刻から24:00まで表示（従来の処理）
          const endOfDayMinutes = 24 * 60;
          blocks.push({
            task: { ...task, title: task.title + ' (1/2)' },
            duration: (endOfDayMinutes - taskStartMinutes) / 60,
            startOffset: 0,
            topPosition: taskStartMinutes * this.PIXELS_PER_MINUTE,
            heightInPixels: (endOfDayMinutes - taskStartMinutes) * this.PIXELS_PER_MINUTE,
            isNoTask: task.noTask || false,
            isAllDay: false,
            isCrossDay: true
          });
          processedTaskIds.add(task.id);
          return;
        }
      } else if (task.dueTime) {
        const dueTime = this.parseTime(task.dueTime);
        if (dueTime.hour === null) return;
        taskStartMinutes = dueTime.hour * 60 + dueTime.minutes;
        taskEndMinutes = taskStartMinutes + 30; // 30分枠
      } else {
        return;
      }
      // 通常（または日をまたがない）タスク
      const topPosition = taskStartMinutes * this.PIXELS_PER_MINUTE;
      const duration = taskEndMinutes - taskStartMinutes;
      const heightInPixels = Math.max(
        duration * this.PIXELS_PER_MINUTE,
        this.MIN_DURATION_MINUTES * this.PIXELS_PER_MINUTE
      );
      blocks.push({
        task,
        duration: duration / 60,
        startOffset: 0,
        topPosition: topPosition,
        heightInPixels: heightInPixels,
        isNoTask: task.noTask || false,
        isAllDay: false,
        isCrossDay
      });
      processedTaskIds.add(task.id);
    });
    // ソート: 開始時刻が早い順、同じならdurationが短い順、重なりがある場合は長いものを後ろ（下）に
    blocks.sort((a, b) => {
      // 1. 開始時刻（topPosition）が早い順
      if (a.topPosition !== b.topPosition) {
        return a.topPosition - b.topPosition;
      }
      // 2. 同じ開始時刻ならduration（長さ）が短い順
      if (a.duration !== b.duration) {
        return a.duration - b.duration;
      }
      // 3. 完全に重なっている場合は長いものを後ろ（下）に
      return 0;
    });
    return blocks;
  }

  isCompleted(task: Task): boolean {
    if (task.id && task.id.includes('_')) {
      return !!this.virtualTaskCompletionMap[task.id];
    }
    return task.completed === true || task.status === '完了';
  }

  getCompletionRateData() {
    const total = this.todayTasks.length;
    const done = this.todayTasks.filter(t => this.isCompleted(t)).length;
    return total > 0 ? [
      { name: '完了', value: done },
      { name: '未完了', value: total - done }
    ] : [];
  }

  getWorkTimeData() {
    // 本日タスクの合計作業時間（分）
    let total = 0;
    this.todayTasks.forEach(task => {
      if (task.startTime && task.endTime) {
        const [sh, sm] = task.startTime.split(':').map(Number);
        const [eh, em] = task.endTime.split(':').map(Number);
        total += (eh * 60 + em) - (sh * 60 + sm);
      } else if (task.dueTime && (task.startTime || task.endTime)) {
        // dueTimeのみのタスクはカウントしない
        total += 30;
      }
    });
    return [{ name: '作業時間', value: total }];
  }

  // カレンダーから移植: 繰り返しタスクを本日分だけ展開
  expandRepeatingTasks(tasks: Task[]): Task[] {
    const expandedTasks: Task[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rangeStart = today;
    const rangeEnd = today;
    tasks.forEach(task => {
      if (!task.repeat?.enabled) {
        if (!task.dueDate || (new Date(task.dueDate) >= rangeStart && new Date(task.dueDate) <= rangeEnd)) {
          expandedTasks.push(task);
        }
        return;
      }
      const startDate = task.repeat.startDate ? new Date(task.repeat.startDate) : rangeStart;
      const endDate = task.repeat.endDate ? new Date(task.repeat.endDate) : new Date('2100-01-01');
      switch (task.repeat.frequency) {
        case '毎日':
          if (today >= startDate && today <= endDate) {
            expandedTasks.push(this.createRepeatedTask(task, new Date(today)));
          }
          break;
        case '毎週':
          if (task.repeat.daysOfWeek && task.repeat.daysOfWeek.length > 0) {
            if (today >= startDate && today <= endDate && task.repeat.daysOfWeek.includes(today.getDay())) {
              expandedTasks.push(this.createRepeatedTask(task, new Date(today)));
            }
          }
          break;
        case '毎月':
          if (task.repeat.dayOfMonth) {
            if (today >= startDate && today <= endDate && today.getDate() === task.repeat.dayOfMonth) {
              expandedTasks.push(this.createRepeatedTask(task, new Date(today)));
            }
          }
          break;
        case '毎年':
          if (task.repeat.month !== undefined && task.repeat.dayOfMonth) {
            if (today >= startDate && today <= endDate && today.getMonth() === task.repeat.month && today.getDate() === task.repeat.dayOfMonth) {
              expandedTasks.push(this.createRepeatedTask(task, new Date(today)));
            }
          }
          break;
      }
    });
    return expandedTasks;
  }

  createRepeatedTask(originalTask: Task, date: Date): Task {
    const newDate = new Date(date);
    return {
      ...originalTask,
      dueDate: newDate,
      id: `${originalTask.id}_${newDate.toISOString()}`,
      title: `${originalTask.title} (繰り返し)`,
      repeat: undefined
    };
  }

  updateCurrentTimeTop() {
    const now = new Date();
    this.currentTimeTop = now.getHours() * 60 + now.getMinutes(); // 1分=1px
    this.currentTimeLabel = now.toTimeString().slice(0,5); // "HH:mm"形式
  }

  async toggleTaskCompleted(task: Task, checked: boolean) {
    if (task.id && task.id.includes('_')) {
      await this.taskService.setRepeatTaskCompletion(task.id, this.getTodayStr(), checked);
      this.virtualTaskCompletionMap[task.id] = checked;
      task.completed = checked;
      task.status = checked ? '完了' : '未着手';
      this.completionRateData = this.getCompletionRateData();
      this.updateCompletionStats();
      return;
    }
    const updatedTask = { ...task, completed: checked, status: checked ? '完了' : '未着手' };
    await this.taskService.updateTask(updatedTask);
    task.completed = checked;
    task.status = checked ? '完了' : '未着手';
    this.completionRateData = this.getCompletionRateData();
    this.updateCompletionStats();
  }

  async loadVirtualTaskCompletions() {
    const virtualTasks = this.todayTasks.filter(t => t.id && t.id.includes('_'));
    const todayStr = this.getTodayStr();
    for (const t of virtualTasks) {
      this.virtualTaskCompletionMap[t.id] = await this.taskService.getRepeatTaskCompletion(t.id, todayStr);
    }
  }

  getTodayStr(): string {
    const d = this.today;
    return `${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}-${('0'+d.getDate()).slice(-2)}`;
  }

  async loadUserCapacity() {
    const user = await firstValueFrom(this.authService.getCurrentUser());
    if (!user || !(user as any).uid) {
      this.userCapacity = 0;
      this.capacityLoaded = true;
      return;
    }
    const settings = await this.userSettingsService.getUserCapacitySettings((user as any).uid);
    const today = this.today;
    const ymd = `${today.getFullYear()}-${('0'+(today.getMonth()+1)).slice(-2)}-${('0'+today.getDate()).slice(-2)}`;
    let cap = settings?.capacity ?? 0;

    // 1. 特別日（値が0でも優先）
    if (settings?.specialCapacity && settings.specialCapacity[ymd] !== undefined && settings.specialCapacity[ymd] !== null) {
      cap = settings.specialCapacity[ymd];
      console.log('specialCapacity hit:', ymd, cap);
    }
    // 2. 曜日ごと（値がnull/undefinedならスキップ、0なら標準capacityを使う）
    else if (settings?.weekdayCapacity && settings.weekdayCapacity[today.getDay()] !== undefined && settings.weekdayCapacity[today.getDay()] !== null) {
      const weekdayCap = settings.weekdayCapacity[today.getDay()];
      if (weekdayCap === 0) {
        cap = settings.capacity ?? 0;
        console.log('weekdayCapacity is 0, fallback to default capacity:', cap);
      } else {
        cap = weekdayCap ?? 0;
        console.log('weekdayCapacity hit:', today.getDay(), cap);
      }
    } else {
      console.log('default capacity used:', cap);
    }
    this.userCapacity = cap;
    this.capacityLoaded = true;
    console.log('userCapacity set to:', this.userCapacity);
  }

  calcCapacityUsage() {
    // 1分単位で重複を除外
    const minutes = new Array(1440).fill(false);
    for (const block of this.todayTaskBlocks) {
      if (
        block.isNoTask ||
        block.isAllDay ||
        (!block.task.startTime && !block.task.endTime && !block.task.dueTime)
      ) {
        continue;
      }
      let start = 0, end = 0;
      if (block.task.startTime && block.task.endTime) {
        const startTime = this.parseTime(block.task.startTime);
        const endTime = this.parseTime(block.task.endTime);
        if (startTime.hour === null || endTime.hour === null) continue;
        start = startTime.hour * 60 + startTime.minutes;
        end = endTime.hour * 60 + endTime.minutes;
        if (end <= start) end = 1440;
      } else if (block.task.dueTime && (block.task.startTime || block.task.endTime)) {
        // dueTimeのみのタスクは除外
        const dueTime = this.parseTime(block.task.dueTime);
        if (dueTime.hour === null) continue;
        start = dueTime.hour * 60 + dueTime.minutes;
        end = start + 30;
      } else {
        continue;
      }
      start = Math.max(0, Math.min(1439, start));
      end = Math.max(0, Math.min(1440, end));
      for (let i = start; i < end; i++) {
        minutes[i] = true;
      }
    }
    this.usedCapacity = minutes.filter(Boolean).length;
    this.remainingCapacity = Math.max(this.userCapacity - this.usedCapacity, 0);
    this.overCapacity = this.usedCapacity > this.userCapacity;
    this.overCapacityMessage = this.overCapacity ? 'よく頑張ってるね！働きすぎ注意！' : '';
    console.log('usedCapacity:', this.usedCapacity, 'userCapacity:', this.userCapacity, 'remainingCapacity:', this.remainingCapacity);
    console.log('minutes true count:', minutes.filter(Boolean).length);
  }

  get usedCapacityColor() {
    if (this.usedCapacity >= this.userCapacity) {
      return { color: 'red', fontWeight: 'bold' };
    } else if (this.usedCapacity >= this.userCapacity * 0.8) {
      return { color: '#fbc02d', fontWeight: 'bold' }; // 黄色
    } else {
      return { color: '#1976d2' };
    }
  }

  get showOverCapacityMessage() {
    return !!this.overCapacityMessage;
  }

  get capacityBarColor() {
    if (this.usedCapacity >= this.userCapacity) {
      return '#e53935'; // 赤
    } else if (this.usedCapacity >= this.userCapacity * 0.8) {
      return '#fbc02d'; // 黄色
    } else {
      return '#1976d2'; // 青
    }
  }

  openTaskDetailDialog(task: Task) {
    this.dialog.open(TaskDetailDialogComponent, {
      width: '500px',
      maxHeight: '80vh',
      data: { task, fromToday: true },
      panelClass: ['task-detail-dialog', 'mat-elevation-z8'],
      position: { top: '50px' }
    });
  }

  updateCompletionStats() {
    this.completedCount = this.todayTasks.filter(t => this.isCompleted(t)).length;
    this.totalCount = this.todayTasks.length;
    this.completionPercent = this.totalCount > 0 ? Math.round(this.completedCount / this.totalCount * 100) : 0;
  }

  get sortedTodayTasks() {
    return [...this.todayTasks]
      .sort((a, b) => {
        // 未完了→完了
        if (this.isCompleted(a) !== this.isCompleted(b)) {
          return this.isCompleted(a) ? 1 : -1;
        }
        // 時系列
        const getMinutes = (t: Task) => {
          if (t.startTime) {
            const parsed = this.parseTime(t.startTime);
            if (parsed.hour === null) return 99999;
            return parsed.hour * 60 + parsed.minutes;
          }
          if (t.dueTime) {
            const parsed = this.parseTime(t.dueTime);
            if (parsed.hour === null) return 99999;
            return parsed.hour * 60 + parsed.minutes;
          }
          return new Date(t.createdAt).getHours() * 60 + new Date(t.createdAt).getMinutes();
        };
        return getMinutes(a) - getMinutes(b);
      });
  }
} 