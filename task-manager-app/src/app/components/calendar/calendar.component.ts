import { Component, OnInit, OnDestroy } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { TasksByDateDialogComponent } from '../tasks-by-date-dialog/tasks-by-date-dialog.component';
import { TaskService } from '../../services/task.service';
import { Task } from '../../models/task.model';
import { provideNativeDateAdapter } from '@angular/material/core';
import { TaskDetailDialogComponent } from '../task-detail-dialog/task-detail-dialog.component';
import { TaskFormComponent } from '../task-form/task-form.component';
import { UserSettingsService } from '../../services/user-settings.service';
import { AuthService } from '../../services/auth.service';
import { firstValueFrom } from 'rxjs';

interface DaySchedule {
  date: string;   // ISO文字列 or toDateString()
  tasks: Task[];
}

interface TimeBlock {
  task: Task;
  duration: number;
  startOffset: number;
  isNoTask?: boolean;
  isAllDay?: boolean;
  isCrossDay?: boolean;
  topPosition?: number;
  heightInPixels?: number;
  isOverlap?: boolean;
}

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatListModule,
    MatTooltipModule
  ],
  standalone: true,
  providers: [provideNativeDateAdapter()]
})
export class CalendarComponent implements OnInit, OnDestroy {
  schedule: DaySchedule[] = [];
  monthGrid: { date: Date, tasks: Task[], isToday: boolean }[][] = [];
  monthTitle: string = '';
  currentYear: number = 0;
  currentMonth: number = 0; // 0-indexed
  isWeekView: boolean = false;
  currentWeekIndex: number = 0;
  weekDays: string[] = ['日', '月', '火', '水', '木', '金', '土'];
  currentDate: Date = new Date();

  // コンポーネントにタスクを保持するためのプロパティを追加
  private _tasks: Task[] = [];

  // 定数を上部でまとめて定義
  private static readonly PIXELS_PER_HOUR = 60; // グリッド1行 = 60px
  private static readonly PIXELS_PER_MINUTE = CalendarComponent.PIXELS_PER_HOUR / 60; // = 1px/分
  private static readonly HEADER_HEIGHT = 40; // ヘッダーの高さ
  private static readonly MIN_DURATION_MINUTES = 15; // 最小表示時間（分）

  private currentTimeInterval: any;
  currentTimePosition: number = 0;
  currentTimeLabel: string = '';

  private userSettings: any = null;

  constructor(
    private dialog: MatDialog,
    private svc: TaskService,
    private userSettingsService: UserSettingsService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth();
    this.currentDate = today;
    await this.loadUserSettings();
    this.loadTasks();
    this.updateCurrentTimeLine();
    this.startCurrentTimeTimer();
  }

  ngOnDestroy() {
    if (this.currentTimeInterval) {
      clearInterval(this.currentTimeInterval);
    }
  }

  // タスクの読み込みを独立した関数に
  private loadTasks() {
    this.svc.getTasks().subscribe({
      next: (tasks: Task[]) => {
        console.log('読み込んだタスク一覧:', tasks);
        this._tasks = tasks;
        this.updateCalendar();
      },
      error: (err) => console.error('タスクの読み込みエラー:', err)
    });
  }

  updateCalendar() {
    this.monthTitle = this.getMonthTitle();
    
    // 繰り返しタスクを展開
    const expandedTasks = this.expandRepeatingTasks(this._tasks);
    
    // 月表示用のグリッドを生成
    const map = new Map<string, Task[]>();
    expandedTasks.forEach(t => {
      if (t.dueDate) {
        const d = new Date(t.dueDate).toDateString();
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(t);
      }
    });

    this.schedule = Array.from(map.entries())
      .map(([date, tasks]) => ({ date, tasks }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    this.generateMonthGrid(expandedTasks);
  }

  generateMonthGrid(tasks: Task[]) {
    const year = this.currentYear;
    const month = this.currentMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekDay = firstDay.getDay();
    const endWeekDay = lastDay.getDay();
    const gridStart = new Date(year, month, 1 - startWeekDay);
    const gridEnd = new Date(year, month, lastDay.getDate() + (6 - endWeekDay));
    const grid: { date: Date, tasks: Task[], isToday: boolean }[][] = [];
    let week: { date: Date, tasks: Task[], isToday: boolean }[] = [];

    // タスクをDateごとにマッピング（日付の比較を修正）
    const taskMap = new Map<string, Task[]>();
    tasks.forEach(task => {
      // dueDateでマッピング
      if (task.dueDate) {
        const taskDate = new Date(task.dueDate);
        const dateKey = taskDate.toDateString();
        if (!taskMap.has(dateKey)) {
          taskMap.set(dateKey, []);
        }
        taskMap.get(dateKey)!.push(task);
      }
    });

    // タスクのソート関数
    const sortTasks = (tasks: Task[]): Task[] => {
      return [...tasks].sort((a, b) => {
        // 終日タスクを最上部に
        const aIsAllDay = !a.startTime || a.startTime.trim() === '';
        const bIsAllDay = !b.startTime || b.startTime.trim() === '';
        if (aIsAllDay && !bIsAllDay) return -1;
        if (!aIsAllDay && bIsAllDay) return 1;
        if (aIsAllDay && bIsAllDay) return 0;

        // 時間指定のあるタスクを時間順にソート
        const aTime = a.startTime || a.dueTime || '';
        const bTime = b.startTime || b.dueTime || '';
        const aTimeObj = this.parseTime(aTime);
        const bTimeObj = this.parseTime(bTime);

        if (aTimeObj.hour === null && bTimeObj.hour === null) return 0;
        if (aTimeObj.hour === null) return 1;
        if (bTimeObj.hour === null) return -1;

        const aMinutes = aTimeObj.hour * 60 + aTimeObj.minutes;
        const bMinutes = bTimeObj.hour * 60 + bTimeObj.minutes;
        return aMinutes - bMinutes;
      });
    };

    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      const date = new Date(d);
      const key = date.toDateString();
      const dayTasks = taskMap.get(key) || [];
      const sortedTasks = sortTasks(dayTasks);
      const today = new Date();
      const isToday = (date.getFullYear() === today.getFullYear() && 
                      date.getMonth() === today.getMonth() && 
                      date.getDate() === today.getDate());
      
      week.push({ date: new Date(date), tasks: sortedTasks, isToday });
      
      if (week.length === 7) {
        grid.push([...week]);
        week = [];
      }
    }
    
    this.monthGrid = grid;
  }

  // 週表示/通常表示切り替え
  toggleWeekView() {
    this.isWeekView = !this.isWeekView;
    if (this.isWeekView) {
      // 週表示に切り替えた時、現在の日付を基準にする
      const today = new Date();
      this.currentDate = today;
    } else {
      // 月表示に戻した時は、その月の1日にリセットし、currentYear/currentMonthも更新
      const firstDayOfMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
      this.currentYear = firstDayOfMonth.getFullYear();
      this.currentMonth = firstDayOfMonth.getMonth();
      this.currentDate = firstDayOfMonth;
    }
    this.updateCalendar();
  }

  getWeekIndexOfDate(date: Date): number {
    for (let i = 0; i < this.monthGrid.length; i++) {
      for (let d of this.monthGrid[i]) {
        if (d.date.getFullYear() === date.getFullYear() && d.date.getMonth() === date.getMonth() && d.date.getDate() === date.getDate()) {
          return i;
        }
      }
    }
    return 0;
  }

  prevMonth() {
    if (this.isWeekView) {
      // 週表示の場合は1週間戻る
      const newDate = new Date(this.currentDate);
      newDate.setDate(newDate.getDate() - 7);
      this.currentDate = newDate;
      this.updateCalendar(); // カレンダーの更新を追加
      return;
    }
    // 月表示の場合は1ヶ月戻る
    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
    this.updateCalendar();
  }

  nextMonth() {
    if (this.isWeekView) {
      // 週表示の場合は1週間進む
      const newDate = new Date(this.currentDate);
      newDate.setDate(newDate.getDate() + 7);
      this.currentDate = newDate;
      this.updateCalendar(); // カレンダーの更新を追加
      return;
    }
    // 月表示の場合は1ヶ月進む
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
    this.updateCalendar();
  }

  onDateSelected(date: Date) {
    this.svc.getTasks().subscribe(tasks => {
      const filteredTasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === date.toDateString();
      });
      this.dialog.open(TasksByDateDialogComponent, {
        data: { date, tasks: filteredTasks }
      });
    });
  }


  goToday() {
    const today = new Date();
    this.currentDate = today;
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth();
    this.updateCalendar();
  }

  // 時間差を分単位で計算するユーティリティメソッド（日またぎ対応）
  private diffInMinutes(startTime: string, endTime: string): number {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    let minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    if (minutes < 0) {
      // 日をまたぐ場合は24時間分を加算
      minutes += 24 * 60;
    }
    return minutes;
  }

  // 分からピクセルへの変換ユーティリティ（丸めなし）
  private minutesToPixels(minutes: number): number {
    return minutes * CalendarComponent.PIXELS_PER_MINUTE;
  }

  // 週表示用：1時間ごとのタイムテーブル（バー表示用）
  getWeekTimeTableWithBar(week: { date: Date, tasks: Task[], isToday: boolean }[]) {
    // 各時間・各曜日ごとに複数バーを許容する配列に変更
    const timeTable: ({ task: Task, duration: number, isNoTask?: boolean }[])[][] = Array.from({ length: 24 }, () => week.map(() => []));
    week.forEach((day, dayIdx) => {
      // ノータスク（時間指定あり）
      day.tasks.filter(t => t.noTask && t.startTime && t.endTime && t.startTime !== '' && t.endTime !== '').forEach(task => {
        const start = this.parseTime(task.startTime!);
        const end = this.parseTime(task.endTime!);
        if (start.hour !== null && end.hour !== null && end.hour >= start.hour) {
            timeTable[start.hour][dayIdx].push({ task, duration: end.hour - start.hour + 1, isNoTask: true });
          for (let h = start.hour + 1; h <= end.hour; h++) {
            // バーの途中セルは空配列のまま
          }
        }
      });
      // 通常タスク
      day.tasks.filter(t => !t.noTask).forEach(task => {
        if (task.startTime && task.endTime && task.startTime !== '' && task.endTime !== '') {
          const start = this.parseTime(task.startTime);
          const end = this.parseTime(task.endTime);
          if (start.hour !== null && end.hour !== null && end.hour >= start.hour) {
              timeTable[start.hour][dayIdx].push({ task, duration: end.hour - start.hour + 1 });
            for (let h = start.hour + 1; h <= end.hour; h++) {
              // バーの途中セルは空配列のまま
            }
          }
          return;
        }
        // dueTimeのみ
        if (task.dueTime && task.dueTime !== '') {
          let hour = this.parseTime(task.dueTime).hour;
          if (hour !== null) {
            timeTable[hour][dayIdx].push({ task, duration: 1 });
            return;
          }
        }
      });
      // ノータスクで時間指定なし（終日グレー）
      day.tasks.filter(t => t.noTask && (!t.startTime || !t.endTime || t.startTime === '' || t.endTime === '')).forEach(task => {
        timeTable[0][dayIdx].push({ task, duration: 24, isNoTask: true });
        for (let h = 1; h < 24; h++) {
          // バーの途中セルは空配列のまま
        }
      });
    });
    return timeTable;
  }

  // 時刻文字列から時間と分を抽出（より厳密な解析）
  parseTime(timeStr: string): { hour: number | null, minutes: number } {
    if (!timeStr || timeStr.trim() === '') {
      return { hour: null, minutes: 0 };
    }

    // 24時間形式（HH:mm）を優先的にチェック
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      if (hour >= 0 && hour < 24 && minutes >= 0 && minutes < 60) {
        return { hour, minutes };
      }
    }

    // AM/PM形式
    const englishAmpmMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (englishAmpmMatch) {
      let hour = parseInt(englishAmpmMatch[1], 10);
      const minutes = parseInt(englishAmpmMatch[2], 10);
      const isPM = englishAmpmMatch[3].toUpperCase() === 'PM';
      
      if (hour < 1 || hour > 12 || minutes < 0 || minutes >= 60) {
        return { hour: null, minutes: 0 };
      }

      if (hour === 12) {
        hour = isPM ? 12 : 0;
      } else if (isPM) {
        hour += 12;
      }
      
      return { hour, minutes };
    }

    // 午前/午後形式
    const japaneseAmpmMatch = timeStr.match(/^(午前|午後)?(\d{1,2})時(\d{1,2})?分?$/);
    if (japaneseAmpmMatch) {
      let hour = parseInt(japaneseAmpmMatch[2], 10);
      const minutes = japaneseAmpmMatch[3] ? parseInt(japaneseAmpmMatch[3], 10) : 0;
      const isPM = japaneseAmpmMatch[1] === '午後';
      
      if (hour < 1 || hour > 12 || minutes < 0 || minutes >= 60) {
        return { hour: null, minutes: 0 };
      }

      if (hour === 12) {
        hour = isPM ? 12 : 0;
      } else if (isPM) {
        hour += 12;
      }
      
      return { hour, minutes };
    }

    return { hour: null, minutes: 0 };
  }

  getDayName(date: Date): string {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
  }

  getDateForDay(day: string): Date {
    if (!day) {
      return new Date(); // デフォルト値として現在の日付を返す
    }
    const dayIndex = this.weekDays.indexOf(day);
    if (dayIndex === -1) {
      return new Date(); // 無効な曜日の場合は現在の日付を返す
    }
    const currentDay = this.currentDate.getDay();
    const diff = dayIndex - currentDay;
    const date = new Date(this.currentDate);
    date.setDate(date.getDate() + diff);
    return date;
  }

  getDayData(day: string): { date: Date; tasks: Task[]; isToday: boolean } {
    if (!day || !this.weekDays.includes(day)) {
      return {
        date: new Date(),
        tasks: [],
        isToday: false
      };
    }

    const date = this.getDateForDay(day);
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dateStr = startOfDay.toDateString();
    
    // 繰り返しタスクを展開
    const expandedTasks = this.expandRepeatingTasks(this._tasks);
    
    const tasksSet = new Set<Task>();
    // dueDateやstartTime/endTimeが該当するタスク
    expandedTasks.forEach(t => {
      // 1. dueDateが一致
      if (t.dueDate) {
        const taskDate = new Date(t.dueDate);
        const taskDateStr = taskDate.toDateString();
        // 通常のタスク（同じ日付）
        if (taskDateStr === dateStr) tasksSet.add(t);
        // 日をまたぐタスクの処理
        if (t.startTime && t.endTime) {
          const startTime = this.parseTime(t.startTime);
          const endTime = this.parseTime(t.endTime);
          if (startTime.hour === null || endTime.hour === null) return;
          if (startTime.hour > endTime.hour) {
            const prevDate = new Date(startOfDay);
            prevDate.setDate(prevDate.getDate() - 1);
            if (prevDate.toDateString() === taskDateStr) tasksSet.add(t);
          }
        }
      }
      // 2. dueDateが無く、startTime/endTimeがあり、createdAtが一致
      else if ((t.startTime || t.endTime) && t.createdAt) {
        const createdDate = new Date(t.createdAt);
        if (createdDate.toDateString() === dateStr) tasksSet.add(t);
      }
    });

    // --- 日曜日用の特別処理を強化 ---
    if (startOfDay.getDay() === 0) {
      const prevDate = new Date(startOfDay);
      prevDate.setDate(prevDate.getDate() - 1); // 土曜日
      const prevDateStr = prevDate.toDateString();
      // 展開済みタスクだけでなく、元タスク（this._tasks）も対象にする
      [...expandedTasks, ...this._tasks].forEach(t => {
        if (t.startTime && t.endTime && t.dueDate) {
          const startTime = this.parseTime(t.startTime);
          const endTime = this.parseTime(t.endTime);
          const dueDateStr = new Date(t.dueDate).toDateString();
          if (
            startTime.hour !== null && endTime.hour !== null &&
            startTime.hour > endTime.hour &&
            dueDateStr === prevDateStr
          ) {
            tasksSet.add(t);
          }
        }
      });
    }
    // --- ここまで追加 ---


    const tasks = Array.from(tasksSet);
    console.log('getDayData', { day, startOfDay, tasks });

    const today = new Date();
    const isToday = startOfDay.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    return { date: startOfDay, tasks, isToday };
  }

  // 日ごとのタスクブロック全体を取得する最適化されたメソッド
  getTaskBlocksForDay(dayData: { date: Date; tasks: Task[]; isToday: boolean } | null | undefined): TimeBlock[] {
    if (!dayData || !dayData.tasks) {
      return [];
    }

    const blocks: TimeBlock[] = [];
    const processedTaskIds = new Set<string>();
    
    // 終日タスクを処理
    const allDayTasks = dayData.tasks.filter(task => {
      // 締め切り日がその日なら終日バーを出す（目標完了日があっても）
      const isAllDay = (!task.startTime || task.startTime.trim() === '') && 
                       (!task.endTime || task.endTime.trim() === '') &&
                       (!task.dueTime || task.dueTime.trim() === '');
      if (!isAllDay) return false;
      // 締め切り日がその日なら追加
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate).toDateString();
        const dayDate = new Date(dayData.date).toDateString();
        if (dueDate === dayDate) return true;
      }

      // 締め切り日も目標完了日もその日でなければ追加
      return true;
    });

    // 終日タスクをまとめて取得
    const allDayBlocks: TimeBlock[] = [];
    allDayTasks.forEach(task => {
      if (!processedTaskIds.has(task.id)) {
        allDayBlocks.push({
          task,
          duration: 24,
          startOffset: 0,
          // topPositionは後で設定
          isNoTask: task.noTask || false,
          isAllDay: true,
          isCrossDay: false,
        });
        processedTaskIds.add(task.id);
      }
    });

    // 縦に並べるためtopPositionを設定
    allDayBlocks.sort((a, b) => {
      
      // 同じ種類（目標完了日同士、または通常タスク同士）の場合は長さでソート
      // 長い方を下に（降順）
      return (b.heightInPixels ?? 0) - (a.heightInPixels ?? 0);
    });

    allDayBlocks.forEach((block, idx) => {
      block.topPosition = idx * 24;
      block.heightInPixels = 24;
    });
    console.log('allDayBlocks:', allDayBlocks);
    blocks.push(...allDayBlocks);

    // 時間指定のあるタスクを処理
    const timedTasks = dayData.tasks.filter(task => {
      if (processedTaskIds.has(task.id)) return false;
      
      // startTime/endTimeがある場合
      const hasStartEndTime = task.startTime && task.endTime && 
                            task.startTime.trim() !== '' && task.endTime.trim() !== '';
      
      // dueTimeがある場合
      const hasDueTime = task.dueTime && task.dueTime.trim() !== '';
      
      return hasStartEndTime || hasDueTime;
    });

    // 時間指定タスクをソート（開始時刻順→ノータスクゾーンは下→長さ（長い順））
    timedTasks.sort((a, b) => {
      // 1. ノータスクゾーンは下に
      if (a.noTask && !b.noTask) return 1;
      if (!a.noTask && b.noTask) return -1;

      const timeA = a.startTime || a.dueTime || '';
      const timeB = b.startTime || b.dueTime || '';
      const startA = this.parseTime(timeA);
      const startB = this.parseTime(timeB);
      const startMinutesA = (startA.hour ?? 0) * 60 + startA.minutes;
      const startMinutesB = (startB.hour ?? 0) * 60 + startB.minutes;
      if (startMinutesA !== startMinutesB) return startMinutesA - startMinutesB;

      // 2. ノータスクゾーン同士 or 通常タスク同士は長い方を下に（降順）
      let durationA = 0, durationB = 0;
      if (a.startTime && a.endTime) {
        const endA = this.parseTime(a.endTime);
        durationA = ((endA.hour ?? 0) * 60 + endA.minutes) - startMinutesA;
        if (durationA < 0) durationA += 24 * 60;
      }
      if (b.startTime && b.endTime) {
        const endB = this.parseTime(b.endTime);
        durationB = ((endB.hour ?? 0) * 60 + endB.minutes) - startMinutesB;
        if (durationB < 0) durationB += 24 * 60;
      }
      // 長い方を下に（降順）
      return durationB - durationA;
    });

    // 週表示の場合、前日からまたがるタスクを探索
    if (this.isWeekView) {
      const currentDate = dayData.date;
      const prevDate = new Date(currentDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toDateString();
      const currentDateStr = currentDate.toDateString();

      // --- 厳格な日曜日分バー生成 ---
      if (currentDate.getDay() === 0) { // 日曜日
        const sundayCrossBlocks: TimeBlock[] = [];
        dayData.tasks.forEach(task => {
          if (task.startTime && task.endTime && task.dueDate) {
            const startTime = this.parseTime(task.startTime);
            const endTime = this.parseTime(task.endTime);
            const dueDateStr = new Date(task.dueDate).toDateString();
            if (
              startTime.hour !== null && endTime.hour !== null &&
              startTime.hour > endTime.hour &&
              dueDateStr === prevDateStr
            ) {
              const endMinutes = endTime.hour * 60 + endTime.minutes;
              if (!processedTaskIds.has(task.id + '_sunday')) {
                sundayCrossBlocks.push({
                  task: { ...task, title: task.title + ' (2/2)' },
                  duration: endMinutes / 60,
                  startOffset: 0,
                  topPosition: 0,
                  heightInPixels: Math.max(
                    endMinutes * CalendarComponent.PIXELS_PER_MINUTE,
                    CalendarComponent.MIN_DURATION_MINUTES * CalendarComponent.PIXELS_PER_MINUTE
                  ),
                  isNoTask: task.noTask || false,
                  isAllDay: false,
                  isCrossDay: true,
                });
                processedTaskIds.add(task.id + '_sunday');
              }
            }
          }
        });
        // blocksの先頭に追加
        blocks.unshift(...sundayCrossBlocks);
      }
      // --- ここまで追加 ---

      console.log('週表示の日付処理:', {
        currentDate: currentDateStr,
        prevDate: prevDateStr,
        isWeekView: this.isWeekView,
        dayOfWeek: currentDate.getDay()
      });

      // 前日からまたがるタスクを探索
      dayData.tasks.forEach(task => {
        if (task.startTime && task.endTime) {
          const startTime = this.parseTime(task.startTime);
          const endTime = this.parseTime(task.endTime);
          
          if (startTime.hour !== null && endTime.hour !== null) {
            const isCrossDay = startTime.hour > endTime.hour;
            const taskDate = task.dueDate ? new Date(task.dueDate) : prevDate;
            const taskDateStr = taskDate.toDateString();

            console.log('週表示のタスク確認:', {
              taskId: task.id,
              taskTitle: task.title,
              startTime: task.startTime,
              endTime: task.endTime,
              isCrossDay,
              taskDate: taskDateStr,
              prevDate: prevDateStr,
              currentDate: currentDateStr
            });

            // 前日からまたがるタスクの場合
            if (isCrossDay && taskDateStr === prevDateStr) {
              const endMinutes = endTime.hour * 60 + endTime.minutes;
              const block = {
                task: { ...task, title: task.title + ' (2/2)' },
                duration: endMinutes / 60,
                startOffset: 0,
                topPosition: 0,
                heightInPixels: endMinutes * CalendarComponent.PIXELS_PER_MINUTE,
                isNoTask: task.noTask || false,
                isAllDay: false,
                isCrossDay: true,
              };

              console.log('週表示でバーを追加:', block);
              blocks.push(block);
              processedTaskIds.add(task.id);
            }
          }
        }
      });
    }

    // 週表示モードと日曜日の特別処理
    if (this.isWeekView && dayData.date.getDay() === 0) {
      const prevDate = new Date(dayData.date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toDateString();

      dayData.tasks.forEach(task => {
        if (
          task.startTime && task.endTime && task.dueDate &&
          !processedTaskIds.has(task.id + '_sunday')
        ) {
          const startTime = this.parseTime(task.startTime);
          const endTime = this.parseTime(task.endTime);
          const dueDateStr = new Date(task.dueDate).toDateString();
          if (
            startTime.hour !== null && endTime.hour !== null &&
            startTime.hour > endTime.hour &&
            dueDateStr === prevDateStr
          ) {
            const endMinutes = endTime.hour * 60 + endTime.minutes;
            const block = {
              task: { ...task, title: task.title + ' (2/2)' },
              duration: endMinutes / 60,
              startOffset: 0,
              topPosition: 0,
              heightInPixels: Math.max(
                endMinutes * CalendarComponent.PIXELS_PER_MINUTE,
                CalendarComponent.MIN_DURATION_MINUTES * CalendarComponent.PIXELS_PER_MINUTE
              ),
              isNoTask: task.noTask || false,
              isAllDay: false,
              isCrossDay: true,
            };
            blocks.unshift(block);
            processedTaskIds.add(task.id + '_sunday');
            console.log('日曜0時バー追加:', block);
          }
        }
      });
      // blocksをtopPosition順（昇順）、同じ場合はheightInPixels昇順で再ソート
      blocks.sort((a, b) => {
        if ((a.topPosition ?? 0) !== (b.topPosition ?? 0)) {
          return (a.topPosition ?? 0) - (b.topPosition ?? 0);
        }
        // topPositionが同じ場合はheightInPixels（短い方が上）
        return (a.heightInPixels ?? 0) - (b.heightInPixels ?? 0);
      });
      console.log('日曜blocks:', blocks.map(b => ({
        title: b.task.title,
        top: b.topPosition,
        height: b.heightInPixels
      })));
    }

    timedTasks.forEach(task => {
      if (processedTaskIds.has(task.id)) return;

      let taskStartMinutes: number;
      let taskEndMinutes: number;
      let isCrossDay = false;

      if (task.startTime && task.endTime) {
        // startTime/endTimeがある場合
        const startTime = this.parseTime(task.startTime);
        const endTime = this.parseTime(task.endTime);
        if (startTime.hour === null || endTime.hour === null) return;

        isCrossDay = startTime.hour > endTime.hour;
        taskStartMinutes = startTime.hour * 60 + startTime.minutes;
        taskEndMinutes = endTime.hour * 60 + endTime.minutes;

        if (isCrossDay) {
          // 日をまたぐ場合の処理
          const currentDate = dayData.date;
          const taskDate = task.dueDate ? new Date(task.dueDate) : currentDate;
          const nextDayDate = new Date(taskDate);
          nextDayDate.setDate(nextDayDate.getDate() + 1);

          const currentDateStr = currentDate.toDateString();
          const taskDateStr = taskDate.toDateString();
          const nextDayDateStr = nextDayDate.toDateString();

          // 土曜日側のバー（startTime～24:00）
          if (taskDateStr === currentDateStr) {
            const duration = (24 * 60 - taskStartMinutes);
            blocks.push({
              task: { ...task, title: task.title + ' (1/2)' },
              duration: duration / 60,
              startOffset: 0,
              topPosition: taskStartMinutes * CalendarComponent.PIXELS_PER_MINUTE,
              heightInPixels: Math.max(
                duration * CalendarComponent.PIXELS_PER_MINUTE,
                CalendarComponent.MIN_DURATION_MINUTES * CalendarComponent.PIXELS_PER_MINUTE
              ),
              isNoTask: task.noTask || false,
              isAllDay: false,
              isCrossDay: true,
            });
          } else if (nextDayDateStr === currentDateStr) {
            // 日曜日側のバー（0:00～endTime）
            const duration = taskEndMinutes;
            blocks.push({
              task: { ...task, title: task.title + ' (2/2)' },
              duration: duration / 60,
              startOffset: 0,
              topPosition: 0,
              heightInPixels: Math.max(
                duration * CalendarComponent.PIXELS_PER_MINUTE,
                CalendarComponent.MIN_DURATION_MINUTES * CalendarComponent.PIXELS_PER_MINUTE
              ),
              isNoTask: task.noTask || false,
              isAllDay: false,
              isCrossDay: true,
            });
          }
          processedTaskIds.add(task.id);
          return;
        }
      } else if (task.dueTime) {
        // dueTimeのみの場合
        const dueTime = this.parseTime(task.dueTime);
        if (dueTime.hour === null) return;

        taskStartMinutes = dueTime.hour * 60 + dueTime.minutes;
        taskEndMinutes = taskStartMinutes + 30; // デフォルトで30分の長さを設定
      } else {
        return;
      }

      // タスクの位置とサイズを計算
      const topPosition = taskStartMinutes * CalendarComponent.PIXELS_PER_MINUTE;
      const duration = taskEndMinutes - taskStartMinutes;
      const heightInPixels = Math.max(
        duration * CalendarComponent.PIXELS_PER_MINUTE,
        CalendarComponent.MIN_DURATION_MINUTES * CalendarComponent.PIXELS_PER_MINUTE
      );

      blocks.push({
        task,
        duration: duration / 60,
        startOffset: 0,
        topPosition,
        heightInPixels,
        isNoTask: task.noTask || false,
        isAllDay: false,
        isCrossDay,
      });
      processedTaskIds.add(task.id);
    });

    // === 重なり検出・isOverlap付与 ===
    for (let i = 0; i < blocks.length; i++) {
      const a = blocks[i];
      a.isOverlap = false;
      for (let j = 0; j < i; j++) { // iより前だけを見る
        const b = blocks[j];
        if (
          (a.topPosition! < (b.topPosition! + b.heightInPixels!)) &&
          ((a.topPosition! + a.heightInPixels!) > b.topPosition!)
        ) {
          a.isOverlap = true;
          break;
        }
      }
    }

    console.log('週表示の最終ブロック:', {
      date: dayData.date.toDateString(),
      blocks: blocks,
      isWeekView: this.isWeekView
    });
    return blocks;
  }

  isToday(day: string): boolean {
    if (!day) return false;
    const date = this.getDateForDay(day);
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  // 月のタイトルを取得（週表示の場合は週の範囲を表示）
  getMonthTitle(): string {
    if (this.isWeekView) {
      // 週の開始日と終了日を計算
      const startDate = new Date(this.currentDate);
      startDate.setDate(startDate.getDate() - startDate.getDay()); // 週の開始日（日曜日）
      
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6); // 週の終了日（土曜日）

      // 年をまたぐ場合
      if (startDate.getFullYear() !== endDate.getFullYear()) {
        return `${startDate.getFullYear()}年${startDate.getMonth() + 1}月～${endDate.getFullYear()}年${endDate.getMonth() + 1}月`;
      }

      // 月をまたぐ場合
      if (startDate.getMonth() !== endDate.getMonth()) {
        return `${startDate.getFullYear()}年${startDate.getMonth() + 1}月～${endDate.getMonth() + 1}月`;
      }
      
      // 同じ月の場合
      return `${startDate.getFullYear()}年${startDate.getMonth() + 1}月`;
    }

    // 月表示の場合
    return `${this.currentYear}年${this.currentMonth + 1}月`;
  }

  // getAll()メソッドをオーバーライド
  getAll(): Task[] {
    return this._tasks;
  }

  // イベントの開始位置を計算（getEventTopPosition も同じロジックで修正）
  getEventTopPosition(event: { task: Task, duration: number, isNoTask?: boolean }): number {
    if (event.task.startTime) {
      const start = this.parseTime(event.task.startTime);
      if (start.hour !== null) {
        const startTotalMinutes = start.hour * 60 + start.minutes;
        return CalendarComponent.HEADER_HEIGHT + this.minutesToPixels(startTotalMinutes);
      }
    }
    return CalendarComponent.HEADER_HEIGHT;
  }

  // イベントが日をまたぐかどうかを判定
  private isCrossDay(task: Task): boolean {
    if (!task.startTime || !task.endTime) return false;
    const start = this.parseTime(task.startTime);
    const end = this.parseTime(task.endTime);
    return start.hour !== null && end.hour !== null && start.hour > end.hour;
  }

  // クラス変数をコンポーネントテンプレートから参照できるようにするゲッターメソッド
  get HEADER_HEIGHT(): number {
    return CalendarComponent.HEADER_HEIGHT;
  }

  get PIXELS_PER_HOUR(): number {
    return CalendarComponent.PIXELS_PER_HOUR;
  }

  get PIXELS_PER_MINUTE(): number {
    return CalendarComponent.PIXELS_PER_MINUTE;
  }

  getTimeBlocksForHour(dayData: { date: Date; tasks: Task[]; isToday: boolean } | null | undefined, hour: number): TimeBlock[] {
    if (!dayData || !dayData.tasks) {
      return [];
    }

    const blocks: TimeBlock[] = [];
    const processedTaskIds = new Set<string>();

    // 終日タスクを処理
    const allDayTasks = dayData.tasks.filter(task => {
      // 締め切り日がその日なら終日バーを出す（目標完了日があっても）
      const isAllDay = (!task.startTime || task.startTime.trim() === '') && 
                       (!task.endTime || task.endTime.trim() === '') &&
                       (!task.dueTime || task.dueTime.trim() === '');
      if (!isAllDay) return false;
      // 締め切り日がその日なら追加
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate).toDateString();
        const dayDate = new Date(dayData.date).toDateString();
        if (dueDate === dayDate) return true;
      }
      // 締め切り日も目標完了日もその日でなければ追加
      return true;
    });

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
          isCrossDay: false,
        });
        processedTaskIds.add(task.id);
      }
    });

    // 時間指定のあるタスクを処理
    const timedTasks = dayData.tasks.filter(task => {
      if (!task.startTime || !task.endTime || processedTaskIds.has(task.id)) return false;
      const startTime = this.parseTime(task.startTime);
      const endTime = this.parseTime(task.endTime);
      return startTime.hour !== null && endTime.hour !== null;
    });

    timedTasks.forEach(task => {
      if (processedTaskIds.has(task.id)) return;

      const startTime = this.parseTime(task.startTime!);
      const endTime = this.parseTime(task.endTime!);
      if (startTime.hour === null || endTime.hour === null) return;

      const isCrossDay = startTime.hour > endTime.hour;
      let taskStartMinutes = startTime.hour * 60 + startTime.minutes;
      let taskEndMinutes = endTime.hour * 60 + endTime.minutes;

      if (isCrossDay) {
        taskEndMinutes += 24 * 60; // 日をまたぐ場合は24時間分を加算
      }

      // 現在の時間枠内のタスクのみを処理
      const currentHourStartMinutes = hour * 60;
      const currentHourEndMinutes = (hour + 1) * 60;

      if (taskStartMinutes <= currentHourEndMinutes && taskEndMinutes >= currentHourStartMinutes) {
        const topPosition = Math.max(0, taskStartMinutes - currentHourStartMinutes) * CalendarComponent.PIXELS_PER_MINUTE;
        const heightInPixels = Math.min(
          currentHourEndMinutes - taskStartMinutes,
          taskEndMinutes - taskStartMinutes
        ) * CalendarComponent.PIXELS_PER_MINUTE;

        blocks.push({
          task,
          duration: this.diffInMinutes(task.startTime!, task.endTime!) / 60,
          startOffset: 0,
          topPosition: topPosition,
          heightInPixels: Math.max(heightInPixels, CalendarComponent.MIN_DURATION_MINUTES * CalendarComponent.PIXELS_PER_MINUTE),
          isNoTask: task.noTask || false,
          isAllDay: false,
          isCrossDay,
        });
        processedTaskIds.add(task.id);
      }
    });

    return blocks;
  }

  // 繰り返しタスクを展開する関数を修正
  private expandRepeatingTasks(tasks: Task[]): Task[] {
    const expandedTasks: Task[] = [];
    
    // 月表示と週表示で適切な日付範囲を設定
    let rangeStart: Date;
    let rangeEnd: Date;
    
    if (this.isWeekView) {
      // 週表示の場合
      rangeStart = new Date(this.currentDate);
      rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay());
      rangeEnd = new Date(rangeStart);
      rangeEnd.setDate(rangeStart.getDate() + 6);
      // 前後1日ずつ拡張して、日をまたぐタスクを確実に取得
      rangeStart.setDate(rangeStart.getDate() - 1);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
    } else {
      // 月表示の場合
      const firstDay = new Date(this.currentYear, this.currentMonth, 1);
      const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
      const startWeekDay = firstDay.getDay();
      const endWeekDay = lastDay.getDay();
      
      // カレンダーグリッドの開始日と終了日を計算
      rangeStart = new Date(this.currentYear, this.currentMonth, 1 - startWeekDay);
      rangeEnd = new Date(this.currentYear, this.currentMonth, lastDay.getDate() + (6 - endWeekDay));
      // 前後1日ずつ拡張
      rangeStart.setDate(rangeStart.getDate() - 1);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
    }

    tasks.forEach(task => {
      if (!task.repeat?.enabled) {
        const hasDueDateInRange = task.dueDate && (new Date(task.dueDate) >= rangeStart && new Date(task.dueDate) <= rangeEnd);
        // 追加: scheduleDateが範囲内なら追加
        const hasScheduleDateInRange = task.scheduleDate && (new Date(task.scheduleDate) >= rangeStart && new Date(task.scheduleDate) <= rangeEnd);
        // 追加: startTime/endTimeのみのタスクもcreatedAtが範囲内なら追加
        const hasScheduleInRange = (!task.dueDate && (task.startTime || task.endTime) && task.createdAt &&
          (new Date(task.createdAt) >= rangeStart && new Date(task.createdAt) <= rangeEnd));
        
        // 特に日をまたぐタスク(前日からのタスク)も確実に含める処理を追加
        const isCrossDayTask = task.startTime && task.endTime && this.isCrossDay(task);
        const prevDayDate = task.dueDate && isCrossDayTask ? new Date(task.dueDate) : null;
        const nextDayDate = prevDayDate ? new Date(prevDayDate) : null;
        if (nextDayDate) nextDayDate.setDate(nextDayDate.getDate() + 1);
        
        const hasCrossDayInRange = prevDayDate && nextDayDate && 
          ((prevDayDate >= rangeStart && prevDayDate <= rangeEnd) || 
           (nextDayDate >= rangeStart && nextDayDate <= rangeEnd));
        
        if (hasDueDateInRange || hasScheduleInRange || 
            hasScheduleDateInRange || hasCrossDayInRange) {
          expandedTasks.push(task);
        }
        return;
      }

      const startDate = task.repeat.startDate ? new Date(task.repeat.startDate) : rangeStart;
      const endDate = task.repeat.endDate ? new Date(task.repeat.endDate) : rangeEnd;
      const exDates = Array.from(new Set((task.exDates || []).map((d: any) => {
        if (typeof d === 'string') return d.slice(0, 10);
        if (d && typeof d.toDate === 'function') return d.toDate().toISOString().slice(0, 10);
        if (d instanceof Date) return d.toISOString().slice(0, 10);
        return '';
      }))).filter(Boolean); // 空文字を除去

      console.log('タスクのexDates変換後:', {
        taskId: task.id,
        taskTitle: task.title,
        exDates,
        originalExDates: task.exDates,
        exDatesType: typeof exDates[0]
      });
      switch (task.repeat.frequency) {
        case '毎日':
          for (let date = new Date(rangeStart); date <= rangeEnd; date.setDate(date.getDate() + 1)) {
            if (date >= startDate && date <= endDate) {
              const dateStr = `${date.getFullYear()}-${('0'+(date.getMonth()+1)).slice(-2)}-${('0'+date.getDate()).slice(-2)}`;
              console.log('日付比較:', {
                taskId: task.id,
                dateStr,
                exDates,
                isExcluded: exDates.includes(dateStr)
              });
              if (exDates.includes(dateStr)) {
                console.log('exDatesでスキップ:', { taskId: task.id, dateStr, exDates });
                continue;
              }
              expandedTasks.push(this.createRepeatedTask(task, new Date(date)));
            }
          }
          break;
        case '毎週':
          if (task.repeat.daysOfWeek && task.repeat.daysOfWeek.length > 0) {
            for (let date = new Date(rangeStart); date <= rangeEnd; date.setDate(date.getDate() + 1)) {
              if (date >= startDate && date <= endDate && task.repeat.daysOfWeek.includes(date.getDay())) {
                const dateStr = `${date.getFullYear()}-${('0'+(date.getMonth()+1)).slice(-2)}-${('0'+date.getDate()).slice(-2)}`;
                if (exDates.includes(dateStr)) {
                  console.log('exDatesでスキップ:', { taskId: task.id, dateStr, exDates });
                  continue;
                }
                expandedTasks.push(this.createRepeatedTask(task, new Date(date)));
              }
            }
          }
          break;
        case '毎月':
          if (task.repeat.dayOfMonth) {
            for (let date = new Date(rangeStart); date <= rangeEnd; date.setDate(date.getDate() + 1)) {
              if (date >= startDate && date <= endDate && date.getDate() === task.repeat.dayOfMonth) {
                const dateStr = `${date.getFullYear()}-${('0'+(date.getMonth()+1)).slice(-2)}-${('0'+date.getDate()).slice(-2)}`;
                if (exDates.includes(dateStr)) {
                  console.log('exDatesでスキップ:', { taskId: task.id, dateStr, exDates });
                  continue;
                }
                expandedTasks.push(this.createRepeatedTask(task, new Date(date)));
              }
            }
          }
          break;
        case '毎年':
          if (task.repeat.month !== undefined && task.repeat.dayOfMonth) {
            for (let date = new Date(rangeStart); date <= rangeEnd; date.setDate(date.getDate() + 1)) {
              if (date >= startDate && 
                  date <= endDate && 
                  date.getMonth() === task.repeat.month && 
                  date.getDate() === task.repeat.dayOfMonth) {
                const dateStr = `${date.getFullYear()}-${('0'+(date.getMonth()+1)).slice(-2)}-${('0'+date.getDate()).slice(-2)}`;
                if (exDates.includes(dateStr)) {
                  console.log('exDatesでスキップ:', { taskId: task.id, dateStr, exDates });
                  continue;
                }
                expandedTasks.push(this.createRepeatedTask(task, new Date(date)));
              }
            }
          }
          break;
      }
    });
    return expandedTasks;
  }

  // 繰り返しタスクを生成するヘルパーメソッド
  private createRepeatedTask(originalTask: Task, date: Date): Task {
    // ローカル0時でdueDateを生成
    const newDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    return {
      ...originalTask,
      dueDate: newDate,
      id: `${originalTask.id}_${newDate.toISOString()}`,
      title: `${originalTask.title} (繰り返し)`,
      startTime: originalTask.startTime || '',
      endTime: originalTask.endTime || '',
      dueTime: originalTask.dueTime || '',
      repeat: undefined // 生成されたタスクは繰り返し設定を持たない
    };
  }

  private startCurrentTimeTimer() {
    // 1分ごとに更新
    this.currentTimeInterval = setInterval(() => {
      this.updateCurrentTimeLine();
    }, 60000);
  }

  private updateCurrentTimeLine() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // 現在時刻の位置を計算（時間 * 60px + 分 * (60px/60)）
    this.currentTimePosition = (hours * 60 + minutes) * (60/60);
    
    // 時刻ラベルを更新
    this.currentTimeLabel = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // タスクのツールチップ表示用
  getTaskTooltip(task: Task): string {
    if (!task.startTime && !task.endTime && !task.dueTime) {
      return `${task.title} (終日)`;
    }
    if (task.startTime && task.endTime) {
      return `${task.title}\n${task.startTime} - ${task.endTime}`;
    }
    if (task.dueTime) {
      return `${task.title}\n期限: ${task.dueTime}`;
    }
    return task.title;
  }

  // タスク一覧ダイアログを開く
  openTasksDialog(date: Date, tasks: Task[]) {
    this.dialog.open(TasksByDateDialogComponent, {
      width: '400px',
      data: { date, tasks: this.sortTasksByTime(tasks) },
      panelClass: 'tasks-dialog'
    });
  }

  // タスクを時間順にソート
  private sortTasksByTime(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => {

      // 終日タスクを次に
      const aIsAllDay = !a.startTime || a.startTime.trim() === '';
      const bIsAllDay = !b.startTime || b.startTime.trim() === '';
      if (aIsAllDay && !bIsAllDay) return -1;
      if (!aIsAllDay && bIsAllDay) return 1;
      if (aIsAllDay && bIsAllDay) return a.title.localeCompare(b.title);

      // 時間指定のあるタスクを時系列でソート
      const aTime = a.startTime || a.dueTime || '';
      const bTime = b.startTime || b.dueTime || '';
      const aTimeObj = this.parseTime(aTime);
      const bTimeObj = this.parseTime(bTime);
      if (aTimeObj.hour === null && bTimeObj.hour === null) return 0;
      if (aTimeObj.hour === null) return 1;
      if (bTimeObj.hour === null) return -1;

      const aMinutes = aTimeObj.hour * 60 + aTimeObj.minutes;
      const bMinutes = bTimeObj.hour * 60 + bTimeObj.minutes;
      if (aMinutes !== bMinutes) return aMinutes - bMinutes;

      // 同じ時刻の場合、startTimeがない（dueTimeのみ）の方を上に
      const aHasStart = !!(a.startTime && a.startTime.trim() !== '');
      const bHasStart = !!(b.startTime && b.startTime.trim() !== '');
      if (aHasStart !== bHasStart) return aHasStart ? 1 : -1;

      // さらに同じならタイトル順
      return a.title.localeCompare(b.title);
    });
  }

  // 時刻文字列を分単位に変換（24時間表記、AM/PM、午前/午後対応）
  private parseTimeToMinutes(timeStr?: string): number {
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

  openTaskDetail(task: Task, date?: Date) {
    // 繰り返しタスク（idに'_'が含まれる場合）は親IDを抽出
    let realTask = task;
    if (task.id && task.id.includes('_')) {
      const parentId = task.id.split('_')[0];
      const parentTask = this._tasks.find(t => t.id === parentId);
      if (parentTask) {
        realTask = parentTask;
      }
    }
    // 日付情報とfromCalendar: trueを必ず渡す
    this.dialog.open(TaskDetailDialogComponent, {
      width: '500px',
      maxHeight: '80vh',
      data: { task: realTask, date: date ?? (task.dueDate ? new Date(task.dueDate) : undefined), fromCalendar: true },
      panelClass: ['task-detail-dialog', 'mat-elevation-z8'],
      position: { top: '50px' }
    });
  }

  openNewTaskForm(date: Date, hour?: number) {
    // 時刻の設定
    let startTime: string | undefined;
    let endTime: string | undefined;
    
    if (hour !== undefined) {
      // 時間指定の場合
      const hourStr = hour.toString().padStart(2, '0');
      startTime = `${hourStr}:00`;
      endTime = `${(hour + 1).toString().padStart(2, '0')}:00`;
    }

    // 日付を確実にDateオブジェクトに変換（文字列が渡される可能性も考慮）
    const taskDate = new Date(date);
    // 時間がない場合はその日の0時0分に設定
    taskDate.setHours(0, 0, 0, 0);

    console.log('Opening new task form with date:', taskDate);

    // タスク作成ダイアログを開く
    const dialogRef = this.dialog.open(TaskFormComponent, {
      width: '500px',
      maxHeight: '80vh',
      panelClass: ['task-form-dialog', 'mat-elevation-z8'],
      autoFocus: true,
      disableClose: true,
      position: { top: '50px' },
      data: {
        type: 'todo',
        initialDate: taskDate,
        startTime,
        endTime,
        dueDate: taskDate // 締め切り日としても設定
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadTasks();
      }
    });
  }

  isCapacityOver(day: { date: Date, tasks: Task[] }): boolean {
    // ユーザー設定が未保存の場合はキャパオーバー判定しない
    if (!this.userSettings || this.userSettings.capacity == null) {
      return false;
    }

    // 1分単位で重複しないように管理
    const minutes = new Array(1440).fill(false);

    // 当日のタスクを処理
    for (const task of day.tasks) {
      // ノータスクゾーンは除外
      if (task.noTask) continue;

      // 時間幅がないものは除外
      if (!task.startTime || !task.endTime) continue;

      const startTime = this.parseTime(task.startTime);
      const endTime = this.parseTime(task.endTime);
      if (startTime.hour === null || endTime.hour === null) continue;

      let start = startTime.hour * 60 + startTime.minutes;
      let end = endTime.hour * 60 + endTime.minutes;

      // 日をまたぐ場合は24:00まで
      if (end <= start) end = 1440;

      // 範囲外防止
      start = Math.max(0, Math.min(1439, start));
      end = Math.max(0, Math.min(1440, end));

      for (let i = start; i < end; i++) {
        minutes[i] = true;
      }
    }

    // 前日から日をまたぐタスクの当日分を処理
    const prevDate = new Date(day.date);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toDateString();

    // 展開済みタスクも含めて厳密に前日分の日またぎタスクを抽出
    const allTasks = [...(this._tasks || []), ...(day.tasks || [])];
    for (const task of allTasks) {
      // ノータスクゾーンは除外
      if (task.noTask) continue;

      // 時間幅がないものは除外
      if (!task.startTime || !task.endTime || !task.dueDate) continue;

      const startTime = this.parseTime(task.startTime);
      const endTime = this.parseTime(task.endTime);
      if (startTime.hour === null || endTime.hour === null) continue;

      const isCrossDay = startTime.hour > endTime.hour || 
                        (startTime.hour === endTime.hour && startTime.minutes > endTime.minutes);
      const dueDateStr = new Date(task.dueDate).toDateString();

      // 前日からの日またぎタスクの場合
      if (isCrossDay && dueDateStr === prevDateStr) {
        let end = endTime.hour * 60 + endTime.minutes;
        end = Math.max(0, Math.min(1440, end));
        for (let i = 0; i < end; i++) {
          minutes[i] = true;
        }
      }
    }

    // 繰り返しスケジュールの日またぎ分を処理
    if (this._tasks && Array.isArray(this._tasks)) {
      for (const task of this._tasks) {
        if (!task.repeat?.enabled || !task.startTime || !task.endTime) continue;
        if (task.noTask) continue;

        const startTime = this.parseTime(task.startTime);
        const endTime = this.parseTime(task.endTime);
        if (startTime.hour === null || endTime.hour === null) continue;

        // 日またぎでない場合はスキップ
        if (startTime.hour <= endTime.hour && 
            !(startTime.hour === endTime.hour && startTime.minutes > endTime.minutes)) continue;

        // 前日が繰り返し対象かどうか判定
        const prevDate = new Date(day.date);
        prevDate.setDate(prevDate.getDate() - 1);
        let isRepeatOnPrevDate = false;

        switch (task.repeat.frequency) {
          case '毎日':
            isRepeatOnPrevDate = true;
            break;
          case '毎週':
            if (task.repeat.daysOfWeek && task.repeat.daysOfWeek.includes(prevDate.getDay())) {
              isRepeatOnPrevDate = true;
            }
            break;
          case '毎月':
            if (task.repeat.dayOfMonth && prevDate.getDate() === task.repeat.dayOfMonth) {
              isRepeatOnPrevDate = true;
            }
            break;
          case '毎年':
            if (task.repeat.month !== undefined && task.repeat.dayOfMonth && 
                prevDate.getMonth() === task.repeat.month && 
                prevDate.getDate() === task.repeat.dayOfMonth) {
              isRepeatOnPrevDate = true;
            }
            break;
        }

        // 除外日（exDates）があればスキップ
        if (isRepeatOnPrevDate && Array.isArray(task.exDates)) {
          const prevDateStr = `${prevDate.getFullYear()}-${('0'+(prevDate.getMonth()+1)).slice(-2)}-${('0'+prevDate.getDate()).slice(-2)}`;
          const exDates = task.exDates.map((d: any) => 
            typeof d === 'string' ? d.slice(0, 10) : (d instanceof Date ? d.toISOString().slice(0, 10) : '')
          );
          if (exDates.includes(prevDateStr)) continue;
        }

        // 繰り返し対象の場合、当日分の時間を加算
        if (isRepeatOnPrevDate) {
          let end = endTime.hour * 60 + endTime.minutes;
          end = Math.max(0, Math.min(1440, end));
          for (let i = 0; i < end; i++) {
            minutes[i] = true;
          }
        }
      }
    }

    const used = minutes.filter(Boolean).length;

    // ユーザー設定値でキャパシティを判定
    let cap = this.userSettings?.capacity ?? 600;
    const ymd = `${day.date.getFullYear()}-${('0'+(day.date.getMonth()+1)).slice(-2)}-${('0'+day.date.getDate()).slice(-2)}`;

    // 特別日設定を優先
    if (this.userSettings?.specialCapacity && 
        this.userSettings.specialCapacity[ymd] !== undefined && 
        this.userSettings.specialCapacity[ymd] !== null) {
      cap = this.userSettings.specialCapacity[ymd];
    }
    // 次に曜日設定を確認
    else if (this.userSettings?.weekdayCapacity && 
             this.userSettings.weekdayCapacity[day.date.getDay()] !== undefined && 
             this.userSettings.weekdayCapacity[day.date.getDay()] !== null) {
      const weekdayCap = this.userSettings.weekdayCapacity[day.date.getDay()];
      if (weekdayCap === 0) {
        cap = this.userSettings.capacity ?? 600;
      } else {
        cap = weekdayCap ?? 600;
      }
    }

    return used > cap;
  }

  private async loadUserSettings() {
    const user = await firstValueFrom(this.authService.getCurrentUser());
    if (!user || !(user as any).uid) {
      this.userSettings = null;
      return;
    }
    this.userSettings = await this.userSettingsService.getUserCapacitySettings((user as any).uid);
  }
}