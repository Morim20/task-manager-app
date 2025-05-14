import { Component, OnInit, ChangeDetectorRef, OnDestroy, ViewChild, TemplateRef } from '@angular/core';
import { Task } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { DatePipe, CommonModule } from '@angular/common';
import { Subscription, forkJoin } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { SearchDialogComponent } from './search-dialog.component';
import { MatButtonModule } from '@angular/material/button';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../models/task.model';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-archive-task-list',
  template: `
    <div class="archive-dashboard">
      <div class="archive-task-list">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <h2 style="margin:0;">アーカイブ済みタスク一覧</h2>
          <button mat-icon-button (click)="openSearchDialog()" aria-label="検索">
            <mat-icon>search</mat-icon>
          </button>
        </div>
        <div style="margin-bottom: 16px;">
          <button mat-raised-button color="primary" (click)="groupMode = 'category'" [disabled]="groupMode === 'category'">カテゴリーごと</button>
          <button mat-raised-button color="accent" (click)="groupMode = 'date'" [disabled]="groupMode === 'date'" style="margin-left:8px;">アーカイブ日ごと</button>
        </div>
        <div *ngIf="archivedTasks.length === 0">アーカイブ済みタスクはありません。</div>
        <ng-container *ngIf="archivedTasks.length > 0">
          <ng-container *ngIf="groupMode === 'category'">
            <div *ngFor="let group of groupedByCategory">
              <h3>{{ group.category || '未分類' }}</h3>
              <div *ngFor="let task of group.tasks" class="task-card">
                <div class="task-title">{{ task.title }}</div>
                <div class="task-meta">{{ task.dueDate ? (task.dueDate | date:'yyyy/MM/dd') : '' }} {{ task.dueTime }}</div>
                <div class="task-meta">アーカイブ日: {{ task.archivedAt ? (task.archivedAt | date:'yyyy/MM/dd') : '' }}</div>
                <button mat-raised-button color="primary" (click)="restoreTask(task)">復元</button>
              </div>
            </div>
          </ng-container>
          <ng-container *ngIf="groupMode === 'date'">
            <div *ngFor="let group of groupedByDate">
              <h3>{{ group.date | date:'yyyy/MM/dd' }}</h3>
              <div *ngFor="let task of group.tasks" class="task-card">
                <div class="task-title">{{ task.title }}</div>
                <div class="task-meta">{{ task.dueDate ? (task.dueDate | date:'yyyy/MM/dd') : '' }} {{ task.dueTime }}</div>
                <div class="task-meta">カテゴリー: {{ getCategoryName(task.categoryId) || '未分類' }}</div>
                <button mat-raised-button color="primary" (click)="restoreTask(task)">復元</button>
              </div>
            </div>
          </ng-container>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    .archive-dashboard {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 64px);
      width: 100vw;
      background: #f5f5f5;
      box-sizing: border-box;
    }
    .archive-task-list { max-width: 700px; width: 100%; margin: 0; }
    .task-card {
      background: #fff;
      border-bottom: 1px solid #eee;
      border-radius: 0;
      padding: 8px 12px;
      margin-bottom: 0;
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 40px;
      box-shadow: none;
    }
    .task-title {
      font-size: 1rem;
      font-weight: 500;
      margin-bottom: 0;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .task-meta {
      color: #888;
      font-size: 0.92rem;
      margin-bottom: 0;
      margin-right: 12px;
      white-space: nowrap;
    }
    button[disabled] { opacity: 0.7; }
    h3 {
      margin-top: 24px;
      margin-bottom: 8px;
      font-size: 1.08rem;
      font-weight: bold;
      color: #1976d2;
    }
  `],
  standalone: true,
  imports: [DatePipe, CommonModule, MatIconModule, MatDialogModule, FormsModule, MatButtonModule]
})
export class ArchiveTaskListComponent implements OnInit, OnDestroy {
  archivedTasks: Task[] = [];
  filteredTasks: Task[] = [];
  groupMode: 'category' | 'date' = 'category';
  groupedByCategory: { category: string; tasks: Task[] }[] = [];
  groupedByDate: { date: Date; tasks: Task[] }[] = [];
  private subscription: Subscription = new Subscription();
  searchKeyword: string = '';
  categories: Category[] = [];

  constructor(
    private taskSvc: TaskService,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private categorySvc: CategoryService
  ) {}

  ngOnInit() {
    this.subscription.add(
      forkJoin([
        this.categorySvc.getCategories().pipe(take(1)),
        this.taskSvc.getTasks().pipe(take(1))
      ]).subscribe(([categories, tasks]) => {
        this.categories = categories;
        this.archivedTasks = tasks.filter(t => t.archived);
        this.filteredTasks = this.archivedTasks;
        this.groupedByCategory = this.groupByCategory(this.filteredTasks);
        this.groupedByDate = this.groupByDate(this.filteredTasks);
        this.cdr.detectChanges();
      })
    );
  }

  groupByCategory(tasks: Task[]): { category: string; tasks: Task[] }[] {
    if (!this.categories || this.categories.length === 0) {
      return [{ category: '未分類', tasks }];
    }

    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = this.getCategoryName(task.categoryId) || '未分類';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return Array.from(map.entries()).map(([category, tasks]) => ({ category, tasks }));
  }

  groupByDate(tasks: Task[]): { date: Date; tasks: Task[] }[] {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      let date: Date | undefined = undefined;
      const at = (task as any).archivedAt;
      if (at && typeof at === 'object' && typeof at.toDate === 'function') {
        date = at.toDate();
      } else if (at && Object.prototype.toString.call(at) === '[object Date]' && !isNaN(at.getTime())) {
        date = at;
      } else if (typeof at === 'string' && !isNaN(new Date(at).getTime())) {
        date = new Date(at);
      } else if (typeof task.updatedAt === 'string' && !isNaN(new Date(task.updatedAt).getTime())) {
        date = new Date(task.updatedAt);
      }
      if (!date) continue;
      const dateStr = date.toISOString().slice(0, 10);
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(task);
    }
    return Array.from(map.entries())
      .map(([dateStr, tasks]) => ({ date: new Date(dateStr), tasks }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async restoreTask(task: Task) {
    task.archived = false;
    task.archivedAt = undefined;
    await this.taskSvc.updateTask(task);
    this.archivedTasks = this.archivedTasks.filter(t => t.id !== task.id);
    this.groupedByCategory = this.groupByCategory(this.archivedTasks);
    this.groupedByDate = this.groupByDate(this.archivedTasks);
    this.cdr.detectChanges();
  }

  async archiveTask(task: Task) {
    task.archived = true;
    task.archivedAt = new Date().toISOString();
    await this.taskSvc.updateTask(task);
    this.archivedTasks = this.archivedTasks.filter(t => t.id !== task.id);
    this.groupedByCategory = this.groupByCategory(this.archivedTasks);
    this.groupedByDate = this.groupByDate(this.archivedTasks);
    this.cdr.detectChanges();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  openSearchDialog() {
    const dialogRef = this.dialog.open(SearchDialogComponent, {
      width: '350px',
      data: { keyword: this.searchKeyword }
    });
    dialogRef.afterClosed().subscribe((result: string | undefined) => {
      if (typeof result === 'string') {
        this.searchKeyword = result;
        this.applySearch();
      }
    });
  }

  applySearch() {
    const keyword = this.searchKeyword.trim().toLowerCase();
    if (!keyword) {
      this.filteredTasks = this.archivedTasks;
    } else {
      this.filteredTasks = this.archivedTasks.filter(task => {
        return (
          (task.title && task.title.toLowerCase().includes(keyword)) ||
          (task.description && task.description.toLowerCase().includes(keyword)) ||
          (this.getCategoryName(task.categoryId).toLowerCase().includes(keyword)) ||
          (task.memo && task.memo.toLowerCase().includes(keyword)) ||
          (task.labels && task.labels.some(label => label.name.toLowerCase().includes(keyword)))
        );
      });
    }
    this.groupedByCategory = this.groupByCategory(this.filteredTasks);
    this.groupedByDate = this.groupByDate(this.filteredTasks);
    this.cdr.detectChanges();
  }

  getCategoryName(categoryId: string | undefined): string {
    if (!categoryId || !this.categories || this.categories.length === 0) return '未設定';
    const category = this.categories.find(cat => cat.id === categoryId);
    if (!category) return '未設定';
    if (category.deleted) return '未設定';
    return category.name;
  }
} 