import { FADE_IN, GROW_SHRINK } from '@angular-console/ui';
import {
  BASIC_WORKSPACE_POLLING,
  EditorSupport,
  Settings
} from '@angular-console/utils';
import { style, transition, trigger } from '@angular/animations';
import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  OnDestroy,
  ViewEncapsulation
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { combineLatest, Observable } from 'rxjs';
import {
  filter,
  first,
  map,
  publishReplay,
  refCount,
  shareReplay,
  switchMap
} from 'rxjs/operators';
import {
  ContextualActionBarService,
  MenuOption
} from '@nrwl/angular-console-enterprise-frontend';
import { BasicWorkspaceGQL } from '../generated/graphql';

interface Route {
  icon?: string;
  svgIcon?: string;
  url: string;
  title: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'angular-console-workspace',
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.scss'],
  encapsulation: ViewEncapsulation.None,
  animations: [
    GROW_SHRINK,
    trigger('routerTransition', [
      transition('void => *', []),
      transition('* => projects', FADE_IN),
      transition('* => *', [style({ background: '#F5F5F5' }), FADE_IN])
    ])
  ]
})
export class WorkspaceComponent implements OnDestroy {
  @HostBinding('@.disabled') animationsDisabled = false;

  readonly activeRouteTitle$: Observable<string> = this.router.events.pipe(
    filter(event => event instanceof NavigationEnd),
    map(() => {
      const firstChild = this.route.snapshot.firstChild;
      if (!firstChild) {
        throw new Error('This should never happen');
      }

      const url = firstChild.url[0].path;

      const route = this.routes.find(r => url.indexOf(r.url) > -1);
      if (!route) {
        throw new Error('This should never happen');
      }

      return route.title;
    }),
    shareReplay(1)
  );

  readonly routes: Array<Route> = [
    { icon: 'view_list', url: 'projects', title: 'Projects' },
    { icon: 'code', url: 'generate', title: 'Generate Code' },
    { svgIcon: 'terminal', url: 'tasks', title: 'Run Tasks' },
    {
      icon: 'extension',
      url: 'extensions',
      title: 'Add CLI Extensions'
    }
  ];

  readonly sideNavAnimationState$ = this.contextualActionBarService.contextualActions$.pipe(
    map(actions => {
      if (actions === null) {
        return 'expand';
      } else {
        return 'collapse';
      }
    })
  );

  private readonly workspace$: Observable<{
    name: string;
    path: string;
  }> = this.route.params.pipe(
    map(m => m.path),
    switchMap(path => {
      return this.basicWorkspaceGQL.watch(
        {
          path
        },
        {
          pollInterval: BASIC_WORKSPACE_POLLING
        }
      ).valueChanges;
    }),
    map((r: any) => r.data.workspace),
    publishReplay(1),
    refCount()
  );

  private readonly editorSubscription = this.editorSupport.editors.subscribe(
    editors => {
      this.contextualActionBarService.nonContextualActions$.next([
        {
          name: 'Open',
          description: 'Open workspace in another program',
          icon: 'open_in_browser',
          options: editors.map(
            (editor): MenuOption => {
              return {
                name: `Open in ${editor.name}`,
                image: editor.icon,
                invoke: () => {
                  this.workspace$
                    .pipe(first())
                    .subscribe(w =>
                      this.editorSupport.openInEditor(editor.name, w.path)
                    );
                }
              };
            }
          )
        }
      ]);
    }
  );

  private readonly workplaceSubscription = combineLatest(
    this.workspace$,
    this.activeRouteTitle$
  ).subscribe(([workspace, routeTitle]) => {
    this.contextualActionBarService.breadcrumbs$.next([
      { title: workspace.name },
      { title: routeTitle }
    ]);
  });

  private readonly subscription = this.workspace$.subscribe(w => {
    this.settings.addRecent({ name: w.name, path: w.path });
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly settings: Settings,
    private readonly contextualActionBarService: ContextualActionBarService,
    private readonly editorSupport: EditorSupport,
    private readonly basicWorkspaceGQL: BasicWorkspaceGQL
  ) {}

  ngOnDestroy(): void {
    this.contextualActionBarService.nonContextualActions$.next([]);
    this.workplaceSubscription.unsubscribe();
    this.subscription.unsubscribe();
    this.editorSubscription.unsubscribe();
  }

  toggleAnimations() {
    this.animationsDisabled = !this.animationsDisabled;
  }
}
