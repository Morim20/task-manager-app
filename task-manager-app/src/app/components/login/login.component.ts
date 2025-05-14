// src/app/components/login/login.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatSnackBarModule
  ]
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm: FormGroup;
  isLoading = false;
  hidePassword = true;
  isSignUpMode = false;
  private authSubscription?: Subscription;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    this.authSubscription = this.authService.getCurrentUser().pipe(
      map(user => !!user)
    ).subscribe((isLoggedIn: boolean) => {
      if (isLoggedIn) {
        this.router.navigate(['/']);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  toggleMode(): void {
    this.isSignUpMode = !this.isSignUpMode;
    this.loginForm.reset();
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.valid) {
      this.isLoading = true;
      try {
        const { email, password } = this.loginForm.value;
        if (this.isSignUpMode) {
          await this.authService.signup(email, password);
          this.snackBar.open(
            'アカウントが作成されました',
            '閉じる',
            { duration: 3000 }
          );
        } else {
          await this.authService.login(email, password);
        }
        this.router.navigate(['/']);
      } catch (error: any) {
        this.snackBar.open(
          error.message || (this.isSignUpMode ? 'アカウント作成に失敗しました' : 'ログインに失敗しました'),
          '閉じる',
          { duration: 5000 }
        );
      } finally {
        this.isLoading = false;
      }
    } else {
      this.snackBar.open(
        'メールアドレスとパスワードを正しく入力してください',
        '閉じる',
        { duration: 5000 }
      );
    }
  }
}
