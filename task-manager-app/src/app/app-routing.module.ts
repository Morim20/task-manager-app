// src/app/app-routing.module.ts
import { NgModule }             from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LoginComponent }       from './components/login/login.component';
import { DashboardComponent }   from './components/dashboard/dashboard.component';
import { TaskListComponent }    from './components/task-list/task-list.component';
import { TaskFormComponent }    from './components/task-form/task-form.component';
import { CalendarComponent }    from './components/calendar/calendar.component';
import { ProjectsComponent }    from './components/projects/projects.component';
import { AuthGuard }            from './guards/auth.guard';
import { TodayTodoComponent }   from './components/today-todo/today-todo.component';
import { PersonalProjectsComponent } from './components/projects/personal-projects.component';
import { ProjectDetailComponent } from './components/projects/project-detail.component';
import { CategoryDetailComponent } from './components/projects/category-detail.component.js';
import { CategoriesComponent } from './components/projects/categories.component';
import { EffortLogComponent } from './components/effort-log/effort-log.component';
import { UserSettingsComponent } from './components/user-settings/user-settings.component';
import { ArchiveTaskListComponent } from './components/task-list/archive-task-list.component';

export const routes: Routes = [
  // 1) 先にログインルート
  { path: 'login', component: LoginComponent },

  // 2) 認証後のメイン親ルート
  {
    path: '',
    component: DashboardComponent,
    canActivate: [AuthGuard],
    children: [
      // 実際の画面たち
      { path: 'today-todo', component: TodayTodoComponent },
      { path: 'tasks',         component: TaskListComponent },
      { path: 'calendar',      component: CalendarComponent },
      { path: 'projects',      component: ProjectsComponent },
      { path: 'projects/personal', component: PersonalProjectsComponent },
      { path: 'projects/:id',  component: ProjectDetailComponent },
      { path: 'categories',    component: CategoriesComponent },
      { path: 'categories/:categoryId', component: CategoryDetailComponent },
      { path: 'effort-log', component: EffortLogComponent },
      { path: 'archive', component: ArchiveTaskListComponent },
    ]
  },

  { path: 'settings', component: UserSettingsComponent },

  // それ以外はログイン画面かメイン画面へフォールバック
  { path: '**', redirectTo: 'login' }
];

@NgModule({
  imports: [ RouterModule.forRoot(routes), TodayTodoComponent, TaskFormComponent, CategoryDetailComponent, CategoriesComponent ],
  exports: [ RouterModule ]
})
export class AppRoutingModule {}
