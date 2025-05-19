// アプリのルート。ツールバー＋<router-outlet>の骨組みを担当。
import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from './services/auth.service';
import { Observable } from 'rxjs';
import { User } from '@angular/fire/auth';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { filter } from 'rxjs/operators';
import { TaskService } from './services/task.service';
import { StatusService } from './services/status.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatSidenavModule,
    MatListModule
  ]
})
export class AppComponent implements OnInit {
  title = 'task-manager-app';
  userEmail: string | null = null;
  showUserInfo = false;
  @ViewChild('sidenav') sidenav!: MatSidenav;
  isHomePage = false;

  constructor(private authService: AuthService, private router: Router, private taskService: TaskService, private statusService: StatusService) {}

  async ngOnInit() {
    this.authService.getCurrentUser().subscribe(async (user: any) => {
      this.userEmail = user?.email || null;
      if (user) {
        // 認証済みになったタイミングで実行
        console.log('ユーザー認証完了');
      }
    });

    // ルート変更を監視し、ダッシュボード画面では常にサイドバーを表示する
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      // ルートに応じてサイドバーの表示を制御
      const url = event.url;
      this.isHomePage = url === '/' || url === '/today-todo' || url === '/dashboard';
      
      // ダッシュボード画面（ホーム画面）ではサイドバーを開く
      if (this.isHomePage && this.sidenav) {
        this.sidenav.open();
      }
    });
  }

  onLogout() {
    this.authService.logout();
    this.userEmail = null;
    // ルートをログイン画面に遷移
    this.router.navigate(['/login']);
  }

  toggleUserInfo() {
    this.showUserInfo = !this.showUserInfo;
  }

  fixDates() {
    this.taskService.fixAllTaskDates().then(() => {
      alert('fixAllTaskDates 実行完了！');
    });
  }
}
