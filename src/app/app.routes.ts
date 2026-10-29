import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/feed', pathMatch: 'full' },
  { path: 'feed', loadComponent: () => import('./feed/feed.component').then((m) => m.FeedComponent) },
  { path: 'explore', loadComponent: () => import('./explore/explore.component').then((m) => m.ExploreComponent) },
  { path: 'following', loadComponent: () => import('./following/following.component').then((m) => m.FollowingComponent) },
  { path: 'settings', loadComponent: () => import('./settings/settings.component').then((m) => m.SettingsComponent) },
  { path: 'notifications', loadComponent: () => import('./notifications/notifications.component').then((m) => m.NotificationsComponent) },
  { path: 'media/:id/:index', loadComponent: () => import('./media/media.component').then((m) => m.MediaComponent) },
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
  { path: 'profile', loadComponent: () => import('./profile/profile.component').then((m) => m.ProfileComponent) },
  { path: 'profile/edit', loadComponent: () => import('./profile/edit-profile.component').then((m) => m.EditProfileComponent) },
  { path: 'story/:id', loadComponent: () => import('./story/story.component').then((m) => m.StoryComponent) },
];
