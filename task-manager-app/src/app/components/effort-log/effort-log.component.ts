import { Component, OnInit } from '@angular/core';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { TaskService } from '../../services/task.service';
import { Task } from '../../models/task.model';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../models/category.model';

// 時間差分計算用
function getMinutesDiff(start: string, end: string): number {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (s === null || e === null) return 0;
  return e - s;
}

// 0:00や24:00も正しく扱うパース関数
function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  // AM/PM表記対応
  const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const ampm = ampmMatch[3].toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return hour * 60 + minutes;
  }
  // 24時間表記
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  if (h === 24 && m === 0) return 1440;
  if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m;
  return null;
}

@Component({
  selector: 'app-effort-log',
  standalone: true,
  imports: [NgxChartsModule, MatTabsModule, MatIconModule],
  template: `
    <div class="dashboard">
      <div style="color:#1976d2; font-weight:bold; margin-bottom:8px; font-size:1.08em;">
        ※棒グラフは昨日までのタスクに対するデータです（繰り返しタスクは含めていません）
      </div>
      <div class="period-selector">
        <button *ngFor="let p of periods" mat-raised-button color="primary" [disabled]="period === p" (click)="changePeriod(p)">{{ p }}</button>
      </div>
      <div class="chart-container">
        <h3>タスク完了数</h3>
        <div style="display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:8px;">
          <button mat-icon-button (click)="prevPage()" [disabled]="currentPageStartIndex === 0"><mat-icon>chevron_left</mat-icon></button>
          <span style="font-weight:bold; min-width:160px; text-align:center;">{{ currentPageLabel }}</span>
          <button mat-icon-button (click)="nextPage()" [disabled]="currentPageStartIndex + PAGE_SIZE >= completionData.length"><mat-icon>chevron_right</mat-icon></button>
        </div>
        <ngx-charts-bar-vertical
          [results]="displayedCompletionData"
          [xAxis]="true"
          [yAxis]="true"
          [showXAxisLabel]="true"
          [showYAxisLabel]="true"
          [xAxisLabel]="xAxisLabel"
          yAxisLabel="完了数"
          [view]="[750,300]"
          [animations]="false"
          [tooltipDisabled]="false">
        </ngx-charts-bar-vertical>
      </div>
      <div class="chart-container">
        <h3>カテゴリ別分布</h3>
        <mat-tab-group [(selectedIndex)]="selectedCategoryTab">
          <mat-tab label="全カテゴリー合計">
            <ngx-charts-pie-chart
              [results]="getCategoryStatusPieData()"
              [labels]="true"
              [doughnut]="true"
              [view]="[750,300]"
              [animations]="false"
              [tooltipDisabled]="false">
            </ngx-charts-pie-chart>
          </mat-tab>
          <mat-tab *ngFor="let cat of categoryList; let i = index" [label]="cat">
            <ngx-charts-pie-chart
              [results]="getCategoryStatusPieData(cat)"
              [labels]="true"
              [doughnut]="true"
              [view]="[750,300]"
              [animations]="false"
              [tooltipDisabled]="false">
            </ngx-charts-pie-chart>
          </mat-tab>
        </mat-tab-group>
      </div>
      <div class="chart-container">
        <h3>タスク完了率推移</h3>
        <div style="display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:8px;">
          <button mat-icon-button (click)="completionRatePrevPage()" [disabled]="completionRatePageIndex === 0"><mat-icon>chevron_left</mat-icon></button>
          <span style="font-weight:bold; min-width:160px; text-align:center;">{{ completionRatePageLabel }}</span>
          <button mat-icon-button (click)="completionRateNextPage()" [disabled]="completionRatePageIndex + PAGE_SIZE >= completionRateData.length"><mat-icon>chevron_right</mat-icon></button>
        </div>
        <ngx-charts-bar-vertical
          [results]="displayedCompletionRateData"
          [xAxis]="true"
          [yAxis]="true"
          [showXAxisLabel]="true"
          [showYAxisLabel]="true"
          xAxisLabel="日付"
          yAxisLabel="完了率（%）"
          [view]="[750,300]"
          [animations]="false"
          [tooltipDisabled]="false">
        </ngx-charts-bar-vertical>
      </div>
    </div>
  `,
  styles: [`
    .dashboard {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px;
      background-color: #f5f5f5;
      min-height: calc(100vh - 64px);
      align-items: center;
      justify-content: center;
      width: 100vw;
      box-sizing: border-box;
    }
    .chart-container {
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      min-width: 750px;
      max-width: 100%;
      width: 750px;
      min-height: 420px;
      height: 420px;
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0 auto;
    }
    h3 {
      margin-bottom: 12px;
      color: #333;
      font-size: 1.1em;
    }
    .period-selector {
      width: 100%;
      margin-bottom: 12px;
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    ngx-charts-line-chart,
    ngx-charts-bar-vertical,
    ngx-charts-pie-chart,
    ngx-charts-area-chart {
      display: block;
      width: 100%;
      height: 300px;
    }
    /* ngx-chartsツールチップ徹底強制表示 */
    ::ng-deep .ngx-charts-tooltip-content {
      z-index: 99999 !important;
      pointer-events: auto !important;
      background: #fff !important;
      color: #222 !important;
      font-size: 1.08em !important;
      border-radius: 6px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18) !important;
      padding: 8px 14px !important;
      min-width: 40px !important;
      min-height: 24px !important;
    }
    ::ng-deep .cdk-overlay-container, ::ng-deep .cdk-global-overlay-wrapper {
      overflow: visible !important;
      z-index: 99999 !important;
    }
    /* カスタムツールチップスタイル */
    ::ng-deep .tooltip-content {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    ::ng-deep .tooltip-label {
      font-weight: bold;
      margin-bottom: 4px;
      color: #1976d2;
    }
    ::ng-deep .tooltip-value {
      color: #333;
    }
  `]
})
export class EffortLogComponent implements OnInit {
  periods = ['日次', '週次', '月次'];
  period: string = '日次';

  timeData: any[] = [];
  completionData: any[] = [];
  categoryData: any[] = [];
  completionRateData: any[] = [];

  allTasks: Task[] = [];
  categoryList: string[] = [];
  selectedCategoryTab = 0;
  selectedStatusTab: number[] = [];

  // 追加: ページ送り用
  currentPageStartIndex: number = 0;
  readonly PAGE_SIZE = 7;

  _dayMinutes: { [key: string]: boolean[] } = {};
  _dayCategoryMinutes: { [key: string]: { [category: string]: boolean[] } } = {};

  // 追加: 週リスト
  weekList: string[] = [];

  // 各グラフ用ページインデックス
  timePageIndex: number = 0;
  completionRatePageIndex: number = 0;

  categories: Category[] = [];

  constructor(private taskService: TaskService, private categoryService: CategoryService) {}

  ngOnInit() {
    this.taskService.getTasks().subscribe(tasks => {
      this.allTasks = tasks;
      // カテゴリー一覧を購読し、削除済みを除外
      this.categoryService.getCategories().subscribe(categories => {
        this.categories = categories.filter(cat => !cat.deleted);
        // 現状の全てのカテゴリー（削除済み以外）を必ずタブに表示
        this.categoryList = this.categories.map(c => c.name);
        this.selectedStatusTab = this.categoryList.map(_ => 0);
        this.updateCharts();
      });
    });
  }

  // 追加: 現在ページの7日分/7週分/7ヶ月分だけ返すgetter
  get displayedCompletionData() {
    if (this.period === '週次') {
      return this.completionData
        .slice(this.currentPageStartIndex, this.currentPageStartIndex + this.PAGE_SIZE)
        .map(d => ({ name: `${d.label} (${d.value})`, value: d.value }));
    } else if (this.period === '月次') {
      return this.completionData
        .slice(this.currentPageStartIndex, this.currentPageStartIndex + this.PAGE_SIZE)
        .map(d => ({ name: `${d.name} (${d.value})`, value: d.value }));
    }
    return this.completionData
      .slice(this.currentPageStartIndex, this.currentPageStartIndex + this.PAGE_SIZE)
      .map(d => ({ name: `${d.name} (${d.value})`, value: d.value }));
  }

  // 追加: 現在のページの期間ラベル
  get currentPageLabel() {
    if (this.displayedCompletionData.length === 0) return '';
    const first = this.displayedCompletionData[0]?.name;
    const last = this.displayedCompletionData[this.displayedCompletionData.length - 1]?.name;
    if (this.period === '週次') {
      // 週次は「YYYY/MM/DD（週）」形式なので、（週）を除去してDate変換
      const firstDateStr = first.replace(/（週）.*$/, '');
      const lastDateStr = last.replace(/（週）.*$/, '');
      const firstDate = new Date(firstDateStr);
      const lastDate = new Date(lastDateStr);
      if (isNaN(firstDate.getTime()) || isNaN(lastDate.getTime())) return `${first} ~ ${last}`;
      const lastEnd = new Date(lastDate);
      lastEnd.setDate(lastEnd.getDate() + 6);
      return `${firstDate.getFullYear()}/${firstDate.getMonth() + 1}/${firstDate.getDate()} ~ ${lastEnd.getFullYear()}/${lastEnd.getMonth() + 1}/${lastEnd.getDate()}`;
    } else if (this.period === '月次') {
      // 月次は「YYYY/MM」形式
      const firstDate = first.split(' ')[0];
      const lastDate = last.split(' ')[0];
      return firstDate === lastDate ? firstDate : `${firstDate} ~ ${lastDate}`;
    }
    return first === last ? first : `${first} ~ ${last}`;
  }

  // ページ送り
  prevPage() {
    this.currentPageStartIndex = Math.max(0, this.currentPageStartIndex - this.PAGE_SIZE);
  }
  nextPage() {
    if (this.currentPageStartIndex + this.PAGE_SIZE < this.completionData.length)
      this.currentPageStartIndex += this.PAGE_SIZE;
  }

  // 期間切替時はページ先頭に戻す
  changePeriod(p: string) {
    this.period = p;
    this.currentPageStartIndex = 0;
    this.timePageIndex = 0;
    this.completionRatePageIndex = 0;
    this.updateCharts();
  }

  // --- 繰り返しタスクを日付ごとに展開 ---
  private expandRepeatingTasks(tasks: Task[], rangeStart: Date, rangeEnd: Date): Task[] {
    const expandedTasks: Task[] = [];
    tasks.forEach(task => {
      if (!task.repeat?.enabled) {
        if (!task.dueDate || (new Date(task.dueDate) >= rangeStart && new Date(task.dueDate) <= rangeEnd)) {
          expandedTasks.push(task);
        }
        return;
      }
      const startDate = task.repeat.startDate ? new Date(task.repeat.startDate) : rangeStart;
      const endDate = task.repeat.endDate ? new Date(task.repeat.endDate) : rangeEnd;
      switch (task.repeat.frequency) {
        case '毎日':
          for (let date = new Date(rangeStart); date <= rangeEnd; date.setDate(date.getDate() + 1)) {
            if (date >= startDate && date <= endDate) {
              expandedTasks.push(this.createRepeatedTask(task, new Date(date)));
            }
          }
          break;
        case '毎週':
          if (task.repeat.daysOfWeek && task.repeat.daysOfWeek.length > 0) {
            for (let date = new Date(rangeStart); date <= rangeEnd; date.setDate(date.getDate() + 1)) {
              if (date >= startDate && date <= endDate && task.repeat.daysOfWeek.includes(date.getDay())) {
                expandedTasks.push(this.createRepeatedTask(task, new Date(date)));
              }
            }
          }
          break;
        case '毎月':
          if (task.repeat.dayOfMonth) {
            for (let date = new Date(rangeStart); date <= rangeEnd; date.setDate(date.getDate() + 1)) {
              if (date >= startDate && date <= endDate && date.getDate() === task.repeat.dayOfMonth) {
                expandedTasks.push(this.createRepeatedTask(task, new Date(date)));
              }
            }
          }
          break;
        case '毎年':
          if (task.repeat.month !== undefined && task.repeat.dayOfMonth) {
            for (let date = new Date(rangeStart); date <= rangeEnd; date.setDate(date.getDate() + 1)) {
              if (date >= startDate && date <= endDate && date.getMonth() === task.repeat.month && date.getDate() === task.repeat.dayOfMonth) {
                expandedTasks.push(this.createRepeatedTask(task, new Date(date)));
              }
            }
          }
          break;
      }
    });
    return expandedTasks;
  }

  private createRepeatedTask(originalTask: Task, date: Date): Task {
    const newDate = new Date(date);
    // Date型であることを保証
    return {
      ...originalTask,
      dueDate: newDate,
      id: `${originalTask.id}_${newDate.toISOString()}`,
      title: `${originalTask.title} (繰り返し)`
    };
  }

  updateCharts() {
    this._dayMinutes = {};
    this._dayCategoryMinutes = {};
    const groupKey = (date: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      if (this.period === '日次') {
        return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
      } else if (this.period === '週次') {
        const d = new Date(date);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
      } else if (this.period === '月次') {
        return `${date.getFullYear()}/${pad(date.getMonth() + 1)}`;
      }
      return '';
    };

    // --- 日リスト生成 ---
    let dayList: string[] = [];
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    if (this.allTasks.length > 0) {
      const allDates = this.allTasks
        .filter(task => !!task.dueDate)
        .map(task => new Date(typeof task.dueDate === 'string' ? task.dueDate : (task.dueDate as Date).toISOString()))
        .filter(d => !isNaN(d.getTime()));
      if (allDates.length > 0) {
        let minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        let maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        // 前日までのデータに限定
        const yesterday = new Date();
        yesterday.setHours(0,0,0,0);
        yesterday.setDate(yesterday.getDate() - 1);
        if (maxDate > yesterday) maxDate = yesterday;
        if (minDate > yesterday) minDate = yesterday; // すべて未来日の場合も対応
        dayList = [];
        let d = new Date(minDate);
        while (d <= maxDate) {
          const label = groupKey(d); // ← groupKeyで統一
          dayList.push(label);
          d.setDate(d.getDate() + 1);
        }
        rangeStart = minDate;
        rangeEnd = maxDate;
      }
    }
    // --- ここまで日リスト生成 ---

    // --- 週リスト生成 ---
    if (this.period === '週次' && this.allTasks.length > 0) {
      const allDates = this.allTasks
        .filter(task => !!task.dueDate)
        .map(task => new Date(typeof task.dueDate === 'string' ? task.dueDate : (task.dueDate as Date).toISOString()))
        .filter(d => !isNaN(d.getTime()));
      if (allDates.length > 0) {
        let minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        let maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        // 前日までのデータに限定
        const yesterday = new Date();
        yesterday.setHours(0,0,0,0);
        yesterday.setDate(yesterday.getDate() - 1);
        if (maxDate > yesterday) maxDate = yesterday;
        if (minDate > yesterday) minDate = yesterday;
        minDate.setDate(minDate.getDate() - ((minDate.getDay() + 6) % 7));
        maxDate.setDate(maxDate.getDate() + (7 - ((maxDate.getDay() + 6) % 7) - 1));
        this.weekList = [];
        let d = new Date(minDate);
        while (d <= maxDate) {
          const label = groupKey(d); // ← groupKeyで統一
          this.weekList.push(label);
          d.setDate(d.getDate() + 7);
        }
        rangeStart = minDate;
        rangeEnd = maxDate;
      } else {
        this.weekList = [];
      }
    } else {
      this.weekList = [];
    }
    // --- ここまで週リスト生成 ---

    // デバッグ用ログ
    console.log('dayList:', dayList);
    console.log('weekList:', this.weekList);

    // --- 繰り返しタスクを展開して集計に使う ---
    let tasksForStats: Task[] = this.allTasks;
    if (rangeStart && rangeEnd) {
      // 前日までの範囲でフィルタ
      tasksForStats = this.allTasks
        .filter(task => {
          if (!task.dueDate) return false;
          const date = new Date(task.dueDate);
          const yesterday = new Date();
          yesterday.setHours(0,0,0,0);
          yesterday.setDate(yesterday.getDate() - 1);
          return date <= yesterday;
        });
    }

    // 必ずここで各種マップを宣言
    const timeMap: { [key: string]: number } = {};
    const doneMap: { [key: string]: number } = {};
    const categoryMap: { [key: string]: number } = {};
    const completionRateMap: { [key: string]: { total: number, completed: number } } = {};

    this._dayCategoryMinutes = {};
    // timeMapだけスケジュールベースで集計
    const scheduleTasks = tasksForStats
      .filter((task): task is Task & { category: string, startTime: string, endTime: string, dueDate: Date } => 
        !task.noTask && 
        !!task.startTime && 
        !!task.endTime && 
        !!task.dueDate && 
        !!task.category && 
        task.startTime.trim().length > 0 && 
        task.endTime.trim().length > 0 && 
        String(task.dueDate).trim().length > 0 && 
        String(task.category).trim().length > 0
      )
      .filter(task => {
        const date = new Date(task.dueDate);
        const today = new Date();
        today.setHours(0,0,0,0);
        date.setHours(0,0,0,0);
        return date <= today;
      });
    scheduleTasks.forEach(task => {
      const date = new Date(task.dueDate);
      if (isNaN(date.getTime())) return;
      const key = groupKey(date);
      const start = parseTimeToMinutes(task.startTime);
      const end = parseTimeToMinutes(task.endTime);
      if (start === null || end === null) return;
      if (!timeMap[key]) timeMap[key] = 0;
      if (!this._dayMinutes[key]) this._dayMinutes[key] = new Array(1440).fill(false);
      if (!this._dayCategoryMinutes[key]) this._dayCategoryMinutes[key] = {};
      if (!this._dayCategoryMinutes[key][task.category]) this._dayCategoryMinutes[key][task.category] = new Array(1440).fill(false);
      if (end <= start) {
        for (let i = start; i < 1440; i++) {
          this._dayMinutes[key][i] = true;
          this._dayCategoryMinutes[key][task.category][i] = true;
        }
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);
        const nextKey = groupKey(nextDate);
        if (!timeMap[nextKey]) timeMap[nextKey] = 0;
        if (!this._dayMinutes[nextKey]) this._dayMinutes[nextKey] = new Array(1440).fill(false);
        if (!this._dayCategoryMinutes[nextKey]) this._dayCategoryMinutes[nextKey] = {};
        if (!this._dayCategoryMinutes[nextKey][task.category]) this._dayCategoryMinutes[nextKey][task.category] = new Array(1440).fill(false);
        for (let i = 0; i < end; i++) {
          this._dayMinutes[nextKey][i] = true;
          this._dayCategoryMinutes[nextKey][task.category][i] = true;
        }
      } else {
        for (let i = start; i < end; i++) {
          this._dayMinutes[key][i] = true;
          this._dayCategoryMinutes[key][task.category][i] = true;
        }
      }
    });
    Object.keys(this._dayMinutes).forEach(key => {
      timeMap[key] = this._dayMinutes[key].filter(Boolean).length;
    });

    tasksForStats
      .forEach(task => {
        const date = task.dueDate ? new Date(task.dueDate) : new Date(task.updatedAt || task.createdAt);
        if (isNaN(date.getTime())) return;
        const key = groupKey(date);
        // Todayページの完了状態を反映
        const isCompleted = task.completed === true || task.status === '完了';
        if (isCompleted) {
          doneMap[key] = Number(doneMap[key] || 0) + 1;
        }
        if (!completionRateMap[key]) completionRateMap[key] = { total: 0, completed: 0 };
        completionRateMap[key].total++;
        if (isCompleted) completionRateMap[key].completed++;
        if (task.category) categoryMap[task.category] = (categoryMap[task.category] || 0) + 1;
      });

    // デバッグ用ログ
    console.log('doneMap:', doneMap);

    // グラフデータ生成
    if (this.period === '週次' && this.weekList.length > 0) {
      this.completionData = this.weekList.map(weekKey => {
        const value = doneMap[weekKey] || 0;
        const d = weekKey.split('/');
        const dispLabel = `${d[0]}/${('0' + d[1]).slice(-2)}/${('0' + d[2]).slice(-2)}（週）`;
        return { name: weekKey, label: dispLabel, value };
      });
    } else if (this.period === '日次' && dayList.length > 0) {
      this.completionData = dayList.map(dayKey => {
        const value = doneMap[dayKey] || 0;
        return { name: dayKey, value };
      });
    } else if (this.period === '月次' && dayList.length > 0) {
      // 月ごとにグループ化（doneMapの全キーを走査）
      const monthMap: { [key: string]: number } = {};
      Object.keys(doneMap).forEach(dayKey => {
        const [y, m] = dayKey.split('/');
        if (!y || !m) return;
        const monthKey = `${y}/${m}`;
        monthMap[monthKey] = (monthMap[monthKey] || 0) + (doneMap[dayKey] || 0);
      });
      this.completionData = Object.keys(monthMap).sort().map(monthKey => ({ name: monthKey, value: monthMap[monthKey] }));
      // デバッグ: 月次データをalertで強制表示
      // alert('completionData: ' + JSON.stringify(this.completionData));
    } else {
      this.completionData = Object.keys(doneMap)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
        .map(key => {
          const value = doneMap[key];
          return (key && typeof value === 'number' && !isNaN(value)) ? { name: key, value } : null;
        })
        .filter(item => item !== null);
    }

    // 作業時間推移グラフ
    if (this.period === '週次' && this.weekList.length > 0) {
      this.timeData = [{
        name: '作業時間',
        series: this.weekList.map(weekKey => {
          const value = timeMap[weekKey] || 0;
          return { name: weekKey, value };
        })
      }];
    } else if (this.period === '日次' && dayList.length > 0) {
      this.timeData = [{
        name: '作業時間',
        series: dayList.map(dayKey => {
          const value = timeMap[dayKey] || 0;
          return { name: dayKey, value };
        })
      }];
    } else if (this.period === '月次' && dayList.length > 0) {
      // 月ごとにグループ化（timeMapの全キーを走査）
      const monthMap: { [key: string]: number } = {};
      Object.keys(timeMap).forEach(dayKey => {
        const [y, m] = dayKey.split('/');
        if (!y || !m) return;
        const monthKey = `${y}/${m}`;
        monthMap[monthKey] = (monthMap[monthKey] || 0) + (timeMap[dayKey] || 0);
      });
      this.timeData = [{
        name: '作業時間',
        series: Object.keys(monthMap).sort().map(monthKey => ({ name: monthKey, value: monthMap[monthKey] }))
      }];
      // alert('timeData: ' + JSON.stringify(this.timeData));
    }

    // タスク完了率推移グラフ
    if (this.period === '週次' && this.weekList.length > 0) {
      this.completionRateData = this.weekList.map(weekKey => {
        const rateObj = completionRateMap[weekKey];
        const rate = rateObj && rateObj.total > 0 ? (rateObj.completed / rateObj.total) * 100 : 0;
        return { name: weekKey, value: Math.round(rate * 10) / 10 };
      });
    } else if (this.period === '日次' && dayList.length > 0) {
      this.completionRateData = dayList.map(dayKey => {
        const rateObj = completionRateMap[dayKey];
        const rate = rateObj && rateObj.total > 0 ? (rateObj.completed / rateObj.total) * 100 : 0;
        return { name: dayKey, value: Math.round(rate * 10) / 10 };
      });
    } else if (this.period === '月次' && dayList.length > 0) {
      // 月ごとにグループ化（completionRateMapの全キーを走査）
      const monthMap: { [key: string]: { total: number, completed: number } } = {};
      Object.keys(completionRateMap).forEach(dayKey => {
        const [y, m] = dayKey.split('/');
        if (!y || !m) return;
        const monthKey = `${y}/${m}`;
        if (!monthMap[monthKey]) monthMap[monthKey] = { total: 0, completed: 0 };
        const rateObj = completionRateMap[dayKey];
        if (rateObj) {
          monthMap[monthKey].total += rateObj.total;
          monthMap[monthKey].completed += rateObj.completed;
        }
      });
      this.completionRateData = Object.keys(monthMap).sort().map(monthKey => {
        const obj = monthMap[monthKey];
        const rate = obj.total > 0 ? (obj.completed / obj.total) * 100 : 0;
        return { name: monthKey, value: Math.round(rate * 10) / 10 };
      });
      // alert('completionRateData: ' + JSON.stringify(this.completionRateData));
    }

    // --- 自動ページ送り: 最新日付が含まれるページを表示 ---
    let latestLabel = '';
    if (this.period === '日次' && dayList.length > 0) {
      latestLabel = dayList[dayList.length - 1];
      const idx = dayList.indexOf(latestLabel);
      if (idx !== -1) {
        this.currentPageStartIndex = Math.floor(idx / this.PAGE_SIZE) * this.PAGE_SIZE;
      } else {
        this.currentPageStartIndex = 0;
      }
    } else if (this.period === '週次' && this.weekList.length > 0) {
      latestLabel = this.weekList[this.weekList.length - 1];
      const idx = this.completionData.findIndex(d => d.name === latestLabel);
      if (idx !== -1) {
        this.currentPageStartIndex = Math.floor(idx / this.PAGE_SIZE) * this.PAGE_SIZE;
      } else {
        this.currentPageStartIndex = 0;
      }
    }
    if (this.timeData[0]?.series?.length) {
      const idx = this.timeData[0].series.length - 1;
      this.timePageIndex = idx !== -1 ? Math.floor(idx / this.PAGE_SIZE) * this.PAGE_SIZE : 0;
    }
    if (this.completionRateData.length) {
      const idx = this.completionRateData.length - 1;
      this.completionRatePageIndex = idx !== -1 ? Math.floor(idx / this.PAGE_SIZE) * this.PAGE_SIZE : 0;
    }
  }

  getCategoryStatusPieData(category?: string) {
    let filteredTasks = this.allTasks;
    
    if (category) {
      const categoryObj = this.categories.find(c => c.name === category);
      if (categoryObj) {
        filteredTasks = filteredTasks.filter(task => task.categoryId === categoryObj.id);
      }
    }

    const completed = filteredTasks.filter(task => 
      task.completed === true || task.status === '完了'
    ).length;

    const uncompleted = filteredTasks.filter(task => 
      !(task.completed === true || task.status === '完了')
    ).length;

    return [
      { name: `完了(${completed})`, value: completed },
      { name: `未完了(${uncompleted})`, value: uncompleted }
    ];
  }

  // X軸ラベルをperiodごとに切り替え
  get xAxisLabel() {
    return this.period === '日次' ? '日付' : this.period === '週次' ? '週' : '月';
  }

  // 作業時間推移グラフ用のページ送りデータ
  get displayedTimeData() {
    if (!this.timeData[0] || !this.timeData[0].series) return this.timeData;
    return [{
      name: this.timeData[0].name,
      series: this.timeData[0].series.slice(this.timePageIndex, this.timePageIndex + this.PAGE_SIZE)
        .map((d: any) => ({ name: d.name, value: d.value }))
    }];
  }

  get timePageLabel() {
    const series = this.timeData[0]?.series || [];
    if (series.length === 0) return '';
    const first = series[this.timePageIndex]?.name;
    const last = series[Math.min(this.timePageIndex + this.PAGE_SIZE - 1, series.length - 1)]?.name;
    return first === last ? first : `${first} ~ ${last}`;
  }

  timePrevPage() {
    this.timePageIndex = Math.max(0, this.timePageIndex - this.PAGE_SIZE);
  }

  timeNextPage() {
    if (this.timePageIndex + this.PAGE_SIZE < (this.timeData[0]?.series?.length || 0))
      this.timePageIndex += this.PAGE_SIZE;
  }

  // タスク完了率推移グラフ用のページ送りデータ
  get displayedCompletionRateData() {
    return this.completionRateData.slice(this.completionRatePageIndex, this.completionRatePageIndex + this.PAGE_SIZE)
      .map(d => ({ name: `${d.name} (${d.value}%)`, value: d.value }));
  }

  get completionRatePageLabel() {
    const arr = this.completionRateData;
    if (arr.length === 0) return '';
    const first = arr[this.completionRatePageIndex]?.name;
    const last = arr[Math.min(this.completionRatePageIndex + this.PAGE_SIZE - 1, arr.length - 1)]?.name;
    return first === last ? first : `${first} ~ ${last}`;
  }

  completionRatePrevPage() {
    this.completionRatePageIndex = Math.max(0, this.completionRatePageIndex - this.PAGE_SIZE);
  }

  completionRateNextPage() {
    if (this.completionRatePageIndex + this.PAGE_SIZE < this.completionRateData.length)
      this.completionRatePageIndex += this.PAGE_SIZE;
  }
}
