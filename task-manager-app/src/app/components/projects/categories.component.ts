import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { RouterModule } from '@angular/router';
import { CategoryService } from '../../services/category.service';
import { Category } from '../../models/task.model';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.scss'],
  standalone: true,
  imports: [CommonModule, MatCardModule, MatListModule, RouterModule]
})
export class CategoriesComponent implements OnInit {
  categories: Category[] = [];

  constructor(private categorySvc: CategoryService) {}

  ngOnInit() {
    this.categorySvc.getCategories().subscribe(categories => {
      this.categories = categories;
    });
  }
} 