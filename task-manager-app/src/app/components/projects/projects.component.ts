// src/app/components/projects/projects.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../models/task.model';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { v4 as uuidv4 } from 'uuid';
import { Component as DialogComponent, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TaskService } from '../../services/task.service';

@Component({
  selector: 'app-projects',
  templateUrl: './projects.component.html',
  styleUrls: ['./projects.component.scss'],
  standalone: true,
  imports: [CommonModule, MatCardModule, MatListModule, RouterModule, MatIconModule, MatDialogModule, MatFormFieldModule, MatInputModule, FormsModule, MatButtonModule, MatMenuModule]
})
export class ProjectsComponent implements OnInit, OnDestroy {
  categories: Category[] = [];
  defaultImage = 'https://source.unsplash.com/400x200/?workspace,board';
  selectedCategoryForMenu: Category | null = null;
  editingCategory: Category | null = null;
  editCategoryName: string = '';
  creatingCategory: boolean = false;
  newCategoryName: string = '';
  deletingCategory: Category | null = null;
  private globalClickListener: (() => void) | null = null;

  constructor(private categorySvc: CategoryService, private dialog: MatDialog, private snackBar: MatSnackBar, private taskSvc: TaskService) {}

  ngOnInit() {
    this.categorySvc.getCategories().subscribe(categories => {
      this.categories = categories;
    });
    // グローバルクリックリスナーを追加
    this.globalClickListener = () => {
      if (this.selectedCategoryForMenu) {
        this.selectedCategoryForMenu = null;
      }
    };
    document.addEventListener('click', this.globalClickListener);
  }

  ngOnDestroy() {
    if (this.globalClickListener) {
      document.removeEventListener('click', this.globalClickListener);
    }
  }

  onCreateCategory() {
    if (this.creatingCategory) return;
    this.creatingCategory = true;
    this.newCategoryName = '';
    // 一時的な新規カテゴリーカードを先頭に追加
    this.categories = [
      { id: 'new', name: '', createdAt: new Date().toISOString() },
      ...this.categories
    ];
  }

  async saveNewCategory() {
    if (!this.newCategoryName.trim()) return;
    try {
      await this.categorySvc.add(this.newCategoryName.trim());
      this.snackBar.open('新しいカテゴリーを作成しました', '閉じる', { duration: 3000 });
      this.categorySvc.getCategories().subscribe(categories => {
        this.categories = categories;
      });
    } catch (e: any) {
      this.snackBar.open(e.message || 'カテゴリー作成に失敗しました', '閉じる', { duration: 3000 });
    }
    // 保存後に必ず新規追加用カードを消す
    this.creatingCategory = false;
    this.newCategoryName = '';
    this.categories = this.categories.filter(c => c.id !== 'new');
  }

  cancelNewCategory() {
    this.creatingCategory = false;
    this.newCategoryName = '';
    // 一時的な新規カテゴリーカードを削除
    this.categories = this.categories.filter(c => c.id !== 'new');
  }

  openCategoryMenu(category: Category) {
    if (this.selectedCategoryForMenu && this.selectedCategoryForMenu.id === category.id) {
      this.selectedCategoryForMenu = null;
    } else {
      this.selectedCategoryForMenu = category;
    }
  }

  onEditCategory(category: Category) {
    this.selectedCategoryForMenu = null;
    this.editingCategory = category;
    this.editCategoryName = category.name;
  }

  async onEditCategorySave() {
    if (!this.editingCategory || !this.editCategoryName.trim()) return;
    const oldName = this.editingCategory.name;
    const newName = this.editCategoryName.trim();
    const updated = { ...this.editingCategory, name: newName, updatedAt: new Date().toISOString() };
    this.editingCategory = null;
    this.editCategoryName = '';
    try {
      await this.categorySvc.update(updated);
      // カテゴリー名が変わった場合、タスクも一括更新
      if (oldName !== newName) {
        const tasks = await this.taskSvc.getTasksByCategory(oldName);
        await Promise.all(tasks.map(task => {
          const updatedTask = { ...task, category: newName };
          return this.taskSvc.updateTask(updatedTask);
        }));
        // 変更後のタスクを再取得してデバッグ出力
        const updatedTasks = await this.taskSvc.getTasksByCategory(newName);
        console.log('【DEBUG】カテゴリー名変更後のタスク:', updatedTasks.map(t => `[${t.title}] category=「${t.category}"]`));
        // UIにも反映
        this.taskSvc.getTasks().subscribe(); // タスクリスト再取得
      }
      this.snackBar.open('ボード名を更新しました', '閉じる', { duration: 3000 });
      this.categorySvc.getCategories().subscribe(categories => {
        this.categories = categories;
      });
    } catch (e: any) {
      this.snackBar.open(e?.message || String(e) || '編集に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  onEditCategoryCancel() {
    this.editingCategory = null;
    this.editCategoryName = '';
  }

  onDeleteCategory(category: Category) {
    this.selectedCategoryForMenu = null;
    this.deletingCategory = category;
  }

  cancelDeleteCategory() {
    this.deletingCategory = null;
  }

  async confirmDeleteCategory(category: Category) {
    this.deletingCategory = null;
    try {
      await this.categorySvc.update({ ...category, deleted: true, updatedAt: new Date().toISOString() });
      this.snackBar.open('ボードを削除しました', '閉じる', { duration: 3000 });
      this.categorySvc.getCategories().subscribe(categories => {
        this.categories = categories;
      });
    } catch (e: any) {
      this.snackBar.open(e.message || '削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async migrateToCategoryId() {
    try {
      await this.taskSvc.migrateToCategoryId();
      this.snackBar.open('カテゴリーIDへの移行が完了しました', '閉じる', {
        duration: 3000
      });
    } catch (error) {
      console.error('移行中にエラーが発生しました:', error);
      this.snackBar.open('移行中にエラーが発生しました', '閉じる', {
        duration: 3000
      });
    }
  }
}

@Component({
  selector: 'app-category-menu-dialog',
  template: `
    <div style="padding: 8px 0; min-width: 140px;">
      <button mat-menu-item (click)="onEdit()">
        <mat-icon>edit</mat-icon>
        <span>編集</span>
      </button>
      <button mat-menu-item (click)="onDelete()">
        <mat-icon color="warn">delete</mat-icon>
        <span style="color:#d32f2f;">削除</span>
      </button>
    </div>
  `,
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule]
})
export class CategoryMenuDialog {
  constructor(
    public dialogRef: MatDialogRef<CategoryMenuDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { category: Category }
  ) {}
  onDelete() { this.dialogRef.close('delete'); }
  onEdit() { this.dialogRef.close('edit'); }
}

@Component({
  selector: 'app-delete-category-confirm-dialog',
  template: `
    <h2 mat-dialog-title>ボード削除</h2>
    <mat-dialog-content>
      <p>「{{data.category.name}}」を本当に削除しますか？</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onNo()">キャンセル</button>
      <button mat-flat-button color="warn" (click)="onYes()">削除</button>
    </mat-dialog-actions>
  `,
  standalone: true,
  imports: [MatDialogModule, MatButtonModule]
})
export class DeleteCategoryConfirmDialog {
  constructor(
    public dialogRef: MatDialogRef<DeleteCategoryConfirmDialog>,
    @Inject(MAT_DIALOG_DATA) public data: { category: Category }
  ) {}
  onNo() { this.dialogRef.close(false); }
  onYes() { this.dialogRef.close(true); }
}

@Component({
  selector: 'app-create-category-dialog',
  template: `
    <h2 mat-dialog-title>カテゴリー作成</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" style="width:100%;">
        <mat-label>カテゴリー名</mat-label>
        <input matInput [(ngModel)]="categoryName" maxlength="32" placeholder="例: プロジェクトA">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">キャンセル</button>
      <button mat-flat-button color="primary" (click)="onCreate()" [disabled]="!categoryName.trim()">作成</button>
    </mat-dialog-actions>
  `,
  standalone: true,
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, FormsModule, MatButtonModule]
})
export class CreateCategoryDialog {
  categoryName = '';
  constructor(public dialogRef: MatDialogRef<CreateCategoryDialog>) {}
  onCancel() { this.dialogRef.close(); }
  onCreate() { this.dialogRef.close({ name: this.categoryName.trim() }); }
}
