import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot
} from '@angular/router';
import { ViewMode } from '@prisma/client';
import { EMPTY } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { SettingsStorageService } from '../services/settings-storage.service';
import { UserService } from '../services/user/user.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private static PUBLIC_PAGE_ROUTES = [
    '/about',
    '/about/changelog',
    '/blog',
    '/de/blog',
    '/en/blog',
    '/p',
    '/pricing',
    '/register',
    '/resources'
  ];

  constructor(
    private router: Router,
    private settingsStorageService: SettingsStorageService,
    private userService: UserService
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    if (route.queryParams?.utm_source) {
      this.settingsStorageService.setSetting(
        'utm_source',
        route.queryParams?.utm_source
      );
    }

    return new Promise<boolean>((resolve) => {
      this.userService
        .get()
        .pipe(
          catchError(() => {
            if (route.queryParams?.utm_source) {
              this.router.navigate(['/register']);
              resolve(false);
            } else if (
              AuthGuard.PUBLIC_PAGE_ROUTES.filter((publicPageRoute) =>
                state.url.startsWith(publicPageRoute)
              )?.length > 0
            ) {
              resolve(true);
              return EMPTY;
            } else if (state.url !== '/start') {
              this.router.navigate(['/start']);
              resolve(false);
              return EMPTY;
            }

            resolve(true);
            return EMPTY;
          })
        )
        .subscribe((user) => {
          if (
            state.url.startsWith('/home') &&
            user.settings.viewMode === ViewMode.ZEN
          ) {
            this.router.navigate(['/zen']);
            resolve(false);
            return;
          } else if (state.url.startsWith('/start')) {
            if (user.settings.viewMode === ViewMode.ZEN) {
              this.router.navigate(['/zen']);
            } else {
              this.router.navigate(['/home']);
            }

            resolve(false);
            return;
          } else if (
            state.url.startsWith('/zen') &&
            user.settings.viewMode === ViewMode.DEFAULT
          ) {
            this.router.navigate(['/home']);
            resolve(false);
            return;
          }

          resolve(true);
        });
    });
  }
}
