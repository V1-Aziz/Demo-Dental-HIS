import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  standalone: false,
  selector: 'app-login',
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  showPassword = false;
  isLoading = false;
  errorMessage = '';
  registrationSuccess = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    if (this.auth.isLoggedIn()) {
      this.router.navigate([this.auth.getPortalRoute()]);
    }
  }

  ngOnInit(): void {
    this.registrationSuccess = this.route.snapshot.queryParamMap.get('registered') === '1';
  }

  onSubmit(): void {
    if (!this.email || !this.password) return;

    this.isLoading = true;
    this.errorMessage = '';

    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate([this.auth.getPortalRoute()]);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage =
          err?.error?.message ?? 'Invalid credentials. Please try again.';
      },
    });
  }
}
