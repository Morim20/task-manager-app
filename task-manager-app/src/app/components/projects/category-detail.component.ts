import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { CategoryService } from '../../services/category.service';
import { TaskService } from '../../services/task.service';
import { Category } from '../../models/task.model';
import { Task } from '../../models/task.model';
import { Category as CategoryModel } from '../../models/category.model';

@Component({
  selector: 'app-category-detail',
  templateUrl: './category-detail.component.html',
  styleUrls: ['./category-detail.component.scss'],
  standalone: true,
  imports: [CommonModule, MatCardModule, MatListModule]
})
export class CategoryDetailComponent implements OnInit {
  category?: Category;
  tasks: Task[] = [];
  allCategories: CategoryModel[] = [];

  constructor(private route: ActivatedRoute, private categorySvc: CategoryService, private taskSvc: TaskService) {
    this.categorySvc.getCategories().subscribe(categories => {
      this.allCategories = categories;
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('categoryId');
    this.categorySvc.getCategories().subscribe(categories => {
      this.category = categories.find(c => c.id === id);
    });
    this.taskSvc.getTasks().subscribe(tasks => {
      this.tasks = tasks.filter(t => t.categoryId === id);
    });
  }

  getCategoryName(categoryId: string | undefined): string {
    if (!categoryId) return '';
    const category = this.allCategories.find(cat => cat.id === categoryId);
    return category ? category.name : '';
  }
} 