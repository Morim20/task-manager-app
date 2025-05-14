import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TasksByDateDialogComponent } from './tasks-by-date-dialog.component';

describe('TasksByDateDialogComponent', () => {
  let component: TasksByDateDialogComponent;
  let fixture: ComponentFixture<TasksByDateDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TasksByDateDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TasksByDateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
